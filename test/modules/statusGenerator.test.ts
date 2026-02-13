import stripAnsi from 'strip-ansi';

import MappableSemaphore from '../../src/async/mappableSemaphore.js';
import CandidateGenerator from '../../src/modules/candidates/candidateGenerator.js';
import DATPreferer from '../../src/modules/dats/datPreferer.js';
import ROMIndexer from '../../src/modules/roms/romIndexer.js';
import StatusGenerator from '../../src/modules/statusGenerator.js';
import type DAT from '../../src/types/dats/dat.js';
import Game from '../../src/types/dats/game.js';
import Header from '../../src/types/dats/logiqx/header.js';
import LogiqxDAT from '../../src/types/dats/logiqx/logiqxDat.js';
import ROM from '../../src/types/dats/rom.js';
import SingleValueGame from '../../src/types/dats/singleValueGame.js';
import ArchiveFile from '../../src/types/files/archives/archiveFile.js';
import Zip from '../../src/types/files/archives/zip.js';
import File from '../../src/types/files/file.js';
import type { OptionsProps } from '../../src/types/options.js';
import Options from '../../src/types/options.js';
import IPSPatch from '../../src/types/patches/ipsPatch.js';
import ROMWithFiles from '../../src/types/romWithFiles.js';
import WriteCandidate from '../../src/types/writeCandidate.js';
import ProgressBarFake from '../console/progressBarFake.js';

const gameNameNoRoms = 'no roms';
const gameNameBios = 'bios';
const gameNamePrototype = 'game prototype (proto)';
const gameNameSingleRom = 'game with single rom';
const gameNameMultipleRoms = 'game with multiple roms';
const gameNameDevice = 'device';

const defaultOptions: OptionsProps = {
  dat: [''], // force "is using DATs"
};

const games = [
  new Game({
    name: gameNameNoRoms,
    // (a game can't count as "missing" if it has no ROMs)
  }),
  new Game({
    name: gameNameBios,
    isBios: 'yes',
    roms: new ROM({ name: 'bios.rom', size: 123, crc32: '11111111' }),
  }),
  new Game({
    name: gameNamePrototype,
    cloneOf: gameNameSingleRom,
    roms: new ROM({ name: 'game prototype (proto).rom', size: 123, crc32: '22222222' }),
  }),
  new Game({
    name: gameNameSingleRom,
    roms: new ROM({ name: 'game.rom', size: 123, crc32: '33333333' }),
  }),
  new Game({
    name: gameNameMultipleRoms,
    roms: [
      new ROM({ name: 'one.rom', size: 123, crc32: '44444444' }),
      new ROM({ name: 'two.rom', size: 123, crc32: '55555555' }),
    ],
  }),
  new Game({
    name: gameNameDevice,
    isDevice: 'yes',
    // (a game can't count as "missing" if it has no ROMs)
  }),
];

const dummyDat = new LogiqxDAT({
  header: new Header({
    name: 'dat',
  }),
  games,
});

async function candidateGenerator(
  options: Options,
  dat: DAT,
  gameNames: string[],
): Promise<WriteCandidate[]> {
  const roms = (
    await Promise.all(
      dat
        .getGames()
        .filter((game) => gameNames.includes(game.getName()))
        .map(
          async (game) => await Promise.all(game.getRoms().map(async (rom) => await rom.toFile())),
        ),
    )
  ).flat();
  const romsIndexed = new ROMIndexer(options, new ProgressBarFake()).index(roms);
  return await new CandidateGenerator(
    options,
    new ProgressBarFake(),
    new MappableSemaphore(2),
  ).generate(dat, romsIndexed);
}

describe('toConsole', () => {
  describe('no candidates', () => {
    it('should print games without ROMs as found when single:true', async () => {
      const options = new Options({
        ...defaultOptions,
        single: true,
        preferParent: true,
      });
      const preferredDat = new DATPreferer(options, new ProgressBarFake()).prefer(dummyDat);
      const candidates = await candidateGenerator(options, preferredDat, []);

      const datStatus = new StatusGenerator(new ProgressBarFake()).generate(
        preferredDat,
        candidates,
      );
      expect(stripAnsi(datStatus.toConsole(options))).toEqual(
        '2/5 games, 0/1 BIOSes, 1/1 devices, 2/5 retail releases found',
      );
    });

    it('should print games without ROMs as found when single:false', async () => {
      const options = new Options({
        ...defaultOptions,
        single: false,
        preferParent: true,
      });
      const preferredDat = new DATPreferer(options, new ProgressBarFake()).prefer(dummyDat);
      const candidates = await candidateGenerator(options, preferredDat, []);

      const datStatus = new StatusGenerator(new ProgressBarFake()).generate(
        preferredDat,
        candidates,
      );
      expect(stripAnsi(datStatus.toConsole(options))).toEqual(
        '2/6 games, 0/1 BIOSes, 1/1 devices, 2/5 retail releases found',
      );
    });

    it('should not print BIOS count when noBios:true', () => {
      const options = new Options({ ...defaultOptions, noBios: true });

      const datStatus = new StatusGenerator(new ProgressBarFake()).generate(dummyDat, []);
      expect(stripAnsi(datStatus.toConsole(options))).toEqual(
        '2/6 games, 1/1 devices, 2/5 retail releases found',
      );
    });

    it('should only print BIOS count when onlyBios:true', () => {
      const options = new Options({ ...defaultOptions, onlyBios: true });

      const datStatus = new StatusGenerator(new ProgressBarFake()).generate(dummyDat, []);
      expect(stripAnsi(datStatus.toConsole(options))).toEqual('0/1 BIOSes found');
    });

    it('should not print device count when noDevice:true', () => {
      const options = new Options({ ...defaultOptions, noDevice: true });

      const datStatus = new StatusGenerator(new ProgressBarFake()).generate(dummyDat, []);
      expect(stripAnsi(datStatus.toConsole(options))).toEqual(
        '2/6 games, 0/1 BIOSes, 2/5 retail releases found',
      );
    });

    it('should not print device count when onlyDevice:true', () => {
      const options = new Options({ ...defaultOptions, onlyDevice: true });

      const datStatus = new StatusGenerator(new ProgressBarFake()).generate(dummyDat, []);
      expect(stripAnsi(datStatus.toConsole(options))).toEqual('1/1 devices found');
    });
  });

  describe('partially missing', () => {
    it('should print games without ROMS and BIOSes as found', async () => {
      const options = new Options(defaultOptions);
      const preferredDat = new DATPreferer(options, new ProgressBarFake()).prefer(dummyDat);
      const candidates = await candidateGenerator(options, preferredDat, [gameNameBios]);

      const datStatus = new StatusGenerator(new ProgressBarFake()).generate(
        preferredDat,
        candidates,
      );
      expect(stripAnsi(datStatus.toConsole(options))).toEqual(
        '3/6 games, 1/1 BIOSes, 1/1 devices, 3/5 retail releases found',
      );
    });

    it('should print prototypes as found', async () => {
      const options = new Options(defaultOptions);
      const preferredDat = new DATPreferer(options, new ProgressBarFake()).prefer(dummyDat);
      const candidates = await candidateGenerator(options, preferredDat, [gameNamePrototype]);

      const datStatus = new StatusGenerator(new ProgressBarFake()).generate(
        preferredDat,
        candidates,
      );
      expect(stripAnsi(datStatus.toConsole(options))).toEqual(
        '3/6 games, 0/1 BIOSes, 1/1 devices, 2/5 retail releases found',
      );
    });

    it('should print the game with single rom as found', async () => {
      const options = new Options(defaultOptions);
      const preferredDat = new DATPreferer(options, new ProgressBarFake()).prefer(dummyDat);
      const candidates = await candidateGenerator(options, preferredDat, [gameNameSingleRom]);

      const datStatus = new StatusGenerator(new ProgressBarFake()).generate(
        preferredDat,
        candidates,
      );
      expect(stripAnsi(datStatus.toConsole(options))).toEqual(
        '3/6 games, 0/1 BIOSes, 1/1 devices, 3/5 retail releases found',
      );
    });
  });

  it('should always print patched games as found', async () => {
    const options = new Options(defaultOptions);
    const game = new SingleValueGame({ name: 'patched game' });
    const rom = new ROM({ name: 'patched.rom', size: 123, crc32: '00000000' });
    const candidates = [
      new WriteCandidate(game, [
        new ROMWithFiles(
          rom,
          (await rom.toFile()).withPatch(
            IPSPatch.patchFrom(await File.fileOf({ filePath: 'patch 00000000.ips' })),
          ),
          await rom.toFile(),
        ),
      ]),
    ];

    const datStatus = new StatusGenerator(new ProgressBarFake()).generate(dummyDat, candidates);
    expect(stripAnsi(datStatus.toConsole(options))).toEqual(
      '2/6 games, 0/1 BIOSes, 1/1 devices, 2/5 retail releases, 1 patched games found',
    );
  });

  it('should print every game as found when all are present', async () => {
    const options = new Options(defaultOptions);
    const preferredDat = new DATPreferer(options, new ProgressBarFake()).prefer(dummyDat);
    const candidates = await candidateGenerator(options, preferredDat, [
      gameNameBios,
      gameNamePrototype,
      gameNameSingleRom,
      gameNameMultipleRoms,
    ]);

    const datStatus = new StatusGenerator(new ProgressBarFake()).generate(preferredDat, candidates);
    expect(stripAnsi(datStatus.toConsole(options))).toEqual(
      '6/6 games, 1/1 BIOSes, 1/1 devices, 5/5 retail releases found',
    );
  });

  it('should print only the preferred game as found when none are present and single:true', async () => {
    const options = new Options({
      ...defaultOptions,
      single: true,
      preferParent: true,
    });
    const preferredDat = new DATPreferer(options, new ProgressBarFake()).prefer(dummyDat);
    const candidates = await candidateGenerator(options, preferredDat, []);

    const datStatus = new StatusGenerator(new ProgressBarFake()).generate(preferredDat, candidates);
    expect(stripAnsi(datStatus.toConsole(options))).toEqual(
      '2/5 games, 0/1 BIOSes, 1/1 devices, 2/5 retail releases found',
    );
  });

  it('should print only the preferred game as found when all are present and single:true', async () => {
    const options = new Options({
      ...defaultOptions,
      single: true,
      preferParent: true,
    });
    const preferredDat = new DATPreferer(options, new ProgressBarFake()).prefer(dummyDat);
    const candidates = await candidateGenerator(options, preferredDat, [
      gameNameBios,
      gameNamePrototype,
      gameNameSingleRom,
      gameNameMultipleRoms,
    ]);

    const datStatus = new StatusGenerator(new ProgressBarFake()).generate(preferredDat, candidates);
    expect(stripAnsi(datStatus.toConsole(options))).toEqual(
      '5/5 games, 1/1 BIOSes, 1/1 devices, 5/5 retail releases found',
    );
  });
});

describe('toCSV', () => {
  describe('no candidates', () => {
    it('should report games without ROMs as found when single:true', async () => {
      const options = new Options({
        ...defaultOptions,
        single: true,
        preferParent: true,
      });
      const preferredDat = new DATPreferer(options, new ProgressBarFake()).prefer(dummyDat);
      const candidates = await candidateGenerator(options, preferredDat, []);

      const datStatus = new StatusGenerator(new ProgressBarFake()).generate(
        preferredDat,
        candidates,
      );
      await expect(datStatus.toCsv(options)).resolves
        .toEqual(`DAT Name,Game Name,Status,ROM Files,Patched,BIOS,Retail Release,Unlicensed,Debug,Demo,Beta,Sample,Prototype,Program,Aftermarket,Homebrew,Bad
dat,bios,MISSING,,false,true,true,false,false,false,false,false,false,false,false,false,false
dat,device,FOUND,,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,game with multiple roms,MISSING,,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,game with single rom,MISSING,,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,no roms,FOUND,,false,false,true,false,false,false,false,false,false,false,false,false,false`);
    });

    it('should report games without ROMs as found when single:false', async () => {
      const options = new Options({
        ...defaultOptions,
        single: false,
        preferParent: true,
      });
      const preferredDat = new DATPreferer(options, new ProgressBarFake()).prefer(dummyDat);
      const candidates = await candidateGenerator(options, preferredDat, []);

      const datStatus = new StatusGenerator(new ProgressBarFake()).generate(
        preferredDat,
        candidates,
      );
      await expect(datStatus.toCsv(options)).resolves
        .toEqual(`DAT Name,Game Name,Status,ROM Files,Patched,BIOS,Retail Release,Unlicensed,Debug,Demo,Beta,Sample,Prototype,Program,Aftermarket,Homebrew,Bad
dat,bios,MISSING,,false,true,true,false,false,false,false,false,false,false,false,false,false
dat,device,FOUND,,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,game prototype (proto),MISSING,,false,false,false,false,false,false,false,false,true,false,false,false,false
dat,game with multiple roms,MISSING,,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,game with single rom,MISSING,,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,no roms,FOUND,,false,false,true,false,false,false,false,false,false,false,false,false,false`);
    });

    it('should report ArchiveFiles as found', async () => {
      const options = new Options();

      await Promise.all(
        dummyDat.getGames().map(async (game) => {
          const zip = new Zip(`${game.getName()}.zip`);
          const inputFile = new ArchiveFile(zip);

          const outputFile = await File.fileOf({ filePath: zip.getFilePath() });
          return new WriteCandidate(
            new SingleValueGame({ ...game }),
            game.getRoms().map((rom) => new ROMWithFiles(rom, inputFile, outputFile)),
          );
        }),
      );

      const datStatus = new StatusGenerator(new ProgressBarFake()).generate(dummyDat, []);
      await expect(datStatus.toCsv(options)).resolves
        .toEqual(`DAT Name,Game Name,Status,ROM Files,Patched,BIOS,Retail Release,Unlicensed,Debug,Demo,Beta,Sample,Prototype,Program,Aftermarket,Homebrew,Bad
dat,bios,MISSING,,false,true,true,false,false,false,false,false,false,false,false,false,false
dat,device,FOUND,,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,game prototype (proto),MISSING,,false,false,false,false,false,false,false,false,true,false,false,false,false
dat,game with multiple roms,MISSING,,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,game with single rom,MISSING,,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,no roms,FOUND,,false,false,true,false,false,false,false,false,false,false,false,false,false`);
    });

    // NOTE(cemmer): the BIOS game shows here because DATFilter is never run, and this is fine
    it('should not report BIOSes when noBios:true', async () => {
      const options = new Options({ noBios: true });

      const datStatus = new StatusGenerator(new ProgressBarFake()).generate(dummyDat, []);
      await expect(datStatus.toCsv(options)).resolves
        .toEqual(`DAT Name,Game Name,Status,ROM Files,Patched,BIOS,Retail Release,Unlicensed,Debug,Demo,Beta,Sample,Prototype,Program,Aftermarket,Homebrew,Bad
dat,bios,MISSING,,false,true,true,false,false,false,false,false,false,false,false,false,false
dat,device,FOUND,,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,game prototype (proto),MISSING,,false,false,false,false,false,false,false,false,true,false,false,false,false
dat,game with multiple roms,MISSING,,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,game with single rom,MISSING,,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,no roms,FOUND,,false,false,true,false,false,false,false,false,false,false,false,false,false`);
    });

    it('should only report BIOSes when onlyBios:true', async () => {
      const options = new Options({ ...defaultOptions, onlyBios: true });

      const datStatus = new StatusGenerator(new ProgressBarFake()).generate(dummyDat, []);
      await expect(datStatus.toCsv(options)).resolves
        .toEqual(`DAT Name,Game Name,Status,ROM Files,Patched,BIOS,Retail Release,Unlicensed,Debug,Demo,Beta,Sample,Prototype,Program,Aftermarket,Homebrew,Bad
dat,bios,MISSING,,false,true,true,false,false,false,false,false,false,false,false,false,false`);
    });

    // NOTE(cemmer): the device game shows here because DATFilter is never run, and this is fine
    it('should not report devices when noDevice:true', async () => {
      const options = new Options({ ...defaultOptions, noDevice: true });

      const datStatus = new StatusGenerator(new ProgressBarFake()).generate(dummyDat, []);
      await expect(datStatus.toCsv(options)).resolves
        .toEqual(`DAT Name,Game Name,Status,ROM Files,Patched,BIOS,Retail Release,Unlicensed,Debug,Demo,Beta,Sample,Prototype,Program,Aftermarket,Homebrew,Bad
dat,bios,MISSING,,false,true,true,false,false,false,false,false,false,false,false,false,false
dat,device,FOUND,,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,game prototype (proto),MISSING,,false,false,false,false,false,false,false,false,true,false,false,false,false
dat,game with multiple roms,MISSING,,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,game with single rom,MISSING,,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,no roms,FOUND,,false,false,true,false,false,false,false,false,false,false,false,false,false`);
    });

    it('should not report devices when onlyDevice:true', async () => {
      const options = new Options({ ...defaultOptions, onlyDevice: true });

      const datStatus = new StatusGenerator(new ProgressBarFake()).generate(dummyDat, []);
      await expect(datStatus.toCsv(options)).resolves
        .toEqual(`DAT Name,Game Name,Status,ROM Files,Patched,BIOS,Retail Release,Unlicensed,Debug,Demo,Beta,Sample,Prototype,Program,Aftermarket,Homebrew,Bad
dat,device,FOUND,,false,false,true,false,false,false,false,false,false,false,false,false,false`);
    });
  });

  describe('partially missing', () => {
    it('should report the BIOS as found', async () => {
      const options = new Options(defaultOptions);
      const preferredDat = new DATPreferer(options, new ProgressBarFake()).prefer(dummyDat);
      const candidates = await candidateGenerator(options, preferredDat, [gameNameBios]);

      const datStatus = new StatusGenerator(new ProgressBarFake()).generate(
        preferredDat,
        candidates,
      );
      await expect(datStatus.toCsv(options)).resolves
        .toEqual(`DAT Name,Game Name,Status,ROM Files,Patched,BIOS,Retail Release,Unlicensed,Debug,Demo,Beta,Sample,Prototype,Program,Aftermarket,Homebrew,Bad
dat,bios,FOUND,bios.rom,false,true,true,false,false,false,false,false,false,false,false,false,false
dat,device,FOUND,,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,game prototype (proto),MISSING,,false,false,false,false,false,false,false,false,true,false,false,false,false
dat,game with multiple roms,MISSING,,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,game with single rom,MISSING,,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,no roms,FOUND,,false,false,true,false,false,false,false,false,false,false,false,false,false`);
    });

    it('should report on incomplete games', async () => {
      const options = new Options(defaultOptions);

      const candidates = await Promise.all(
        dummyDat
          .getGames()
          .filter((game) => game.getName() === gameNameMultipleRoms)
          .map(async (game) => {
            const romWithFiles = await Promise.all(
              game
                .getRoms()
                // Only the first ROM, not all of them
                .slice(0, 1)
                .map(async (rom) => new ROMWithFiles(rom, await rom.toFile(), await rom.toFile())),
            );
            return new WriteCandidate(new SingleValueGame({ ...game }), romWithFiles);
          }),
      );

      const datStatus = new StatusGenerator(new ProgressBarFake()).generate(dummyDat, candidates);
      await expect(datStatus.toCsv(options)).resolves
        .toEqual(`DAT Name,Game Name,Status,ROM Files,Patched,BIOS,Retail Release,Unlicensed,Debug,Demo,Beta,Sample,Prototype,Program,Aftermarket,Homebrew,Bad
dat,bios,MISSING,,false,true,true,false,false,false,false,false,false,false,false,false,false
dat,device,FOUND,,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,game prototype (proto),MISSING,,false,false,false,false,false,false,false,false,true,false,false,false,false
dat,game with multiple roms,INCOMPLETE,one.rom,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,game with single rom,MISSING,,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,no roms,FOUND,,false,false,true,false,false,false,false,false,false,false,false,false,false`);
    });

    it('should report the prototype as found', async () => {
      const options = new Options(defaultOptions);
      const preferredDat = new DATPreferer(options, new ProgressBarFake()).prefer(dummyDat);
      const candidates = await candidateGenerator(options, preferredDat, [gameNamePrototype]);

      const datStatus = new StatusGenerator(new ProgressBarFake()).generate(
        preferredDat,
        candidates,
      );
      await expect(datStatus.toCsv(options)).resolves
        .toEqual(`DAT Name,Game Name,Status,ROM Files,Patched,BIOS,Retail Release,Unlicensed,Debug,Demo,Beta,Sample,Prototype,Program,Aftermarket,Homebrew,Bad
dat,bios,MISSING,,false,true,true,false,false,false,false,false,false,false,false,false,false
dat,device,FOUND,,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,game prototype (proto),FOUND,game prototype (proto).rom,false,false,false,false,false,false,false,false,true,false,false,false,false
dat,game with multiple roms,MISSING,,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,game with single rom,MISSING,,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,no roms,FOUND,,false,false,true,false,false,false,false,false,false,false,false,false,false`);
    });

    it('should report the game with a single ROM as found', async () => {
      const options = new Options(defaultOptions);
      const preferredDat = new DATPreferer(options, new ProgressBarFake()).prefer(dummyDat);
      const candidates = await candidateGenerator(options, preferredDat, [gameNameSingleRom]);

      const datStatus = new StatusGenerator(new ProgressBarFake()).generate(
        preferredDat,
        candidates,
      );
      await expect(datStatus.toCsv(options)).resolves
        .toEqual(`DAT Name,Game Name,Status,ROM Files,Patched,BIOS,Retail Release,Unlicensed,Debug,Demo,Beta,Sample,Prototype,Program,Aftermarket,Homebrew,Bad
dat,bios,MISSING,,false,true,true,false,false,false,false,false,false,false,false,false,false
dat,device,FOUND,,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,game prototype (proto),MISSING,,false,false,false,false,false,false,false,false,true,false,false,false,false
dat,game with multiple roms,MISSING,,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,game with single rom,FOUND,game.rom,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,no roms,FOUND,,false,false,true,false,false,false,false,false,false,false,false,false,false`);
    });
  });

  it('should always report patched games as found', async () => {
    const options = new Options(defaultOptions);
    const game = new SingleValueGame({ name: 'patched game' });
    const rom = new ROM({ name: 'patched.rom', size: 123, crc32: '00000000' });
    const candidates = [
      new WriteCandidate(game, [
        new ROMWithFiles(
          rom,
          (await rom.toFile()).withPatch(
            IPSPatch.patchFrom(await File.fileOf({ filePath: 'patch 00000000.ips' })),
          ),
          await rom.toFile(),
        ),
      ]),
    ];

    const datStatus = new StatusGenerator(new ProgressBarFake()).generate(dummyDat, candidates);
    await expect(datStatus.toCsv(options)).resolves
      .toEqual(`DAT Name,Game Name,Status,ROM Files,Patched,BIOS,Retail Release,Unlicensed,Debug,Demo,Beta,Sample,Prototype,Program,Aftermarket,Homebrew,Bad
dat,bios,MISSING,,false,true,true,false,false,false,false,false,false,false,false,false,false
dat,device,FOUND,,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,game prototype (proto),MISSING,,false,false,false,false,false,false,false,false,true,false,false,false,false
dat,game with multiple roms,MISSING,,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,game with single rom,MISSING,,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,no roms,FOUND,,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,patched game,FOUND,patched.rom,true,false,true,false,false,false,false,false,false,false,false,false,false`);
  });

  it('should report every game as found when all are present', async () => {
    const options = new Options(defaultOptions);
    const preferredDat = new DATPreferer(options, new ProgressBarFake()).prefer(dummyDat);
    const candidates = await candidateGenerator(options, preferredDat, [
      gameNameBios,
      gameNamePrototype,
      gameNameSingleRom,
      gameNameMultipleRoms,
    ]);

    const datStatus = new StatusGenerator(new ProgressBarFake()).generate(preferredDat, candidates);
    await expect(datStatus.toCsv(options)).resolves
      .toEqual(`DAT Name,Game Name,Status,ROM Files,Patched,BIOS,Retail Release,Unlicensed,Debug,Demo,Beta,Sample,Prototype,Program,Aftermarket,Homebrew,Bad
dat,bios,FOUND,bios.rom,false,true,true,false,false,false,false,false,false,false,false,false,false
dat,device,FOUND,,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,game prototype (proto),FOUND,game prototype (proto).rom,false,false,false,false,false,false,false,false,true,false,false,false,false
dat,game with multiple roms,FOUND,"one.rom|two.rom",false,false,true,false,false,false,false,false,false,false,false,false,false
dat,game with single rom,FOUND,game.rom,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,no roms,FOUND,,false,false,true,false,false,false,false,false,false,false,false,false,false`);
  });

  it('should print only the preferred game as found when none are present and single:true', async () => {
    const options = new Options({
      ...defaultOptions,
      single: true,
      preferParent: true,
    });
    const preferredDat = new DATPreferer(options, new ProgressBarFake()).prefer(dummyDat);
    const candidates = await candidateGenerator(options, preferredDat, []);

    const datStatus = new StatusGenerator(new ProgressBarFake()).generate(preferredDat, candidates);
    await expect(datStatus.toCsv(options)).resolves
      .toEqual(`DAT Name,Game Name,Status,ROM Files,Patched,BIOS,Retail Release,Unlicensed,Debug,Demo,Beta,Sample,Prototype,Program,Aftermarket,Homebrew,Bad
dat,bios,MISSING,,false,true,true,false,false,false,false,false,false,false,false,false,false
dat,device,FOUND,,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,game with multiple roms,MISSING,,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,game with single rom,MISSING,,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,no roms,FOUND,,false,false,true,false,false,false,false,false,false,false,false,false,false`);
  });

  it('should print only the preferred game as found when all are present and single:true', async () => {
    const options = new Options({
      ...defaultOptions,
      single: true,
      preferParent: true,
    });
    const preferredDat = new DATPreferer(options, new ProgressBarFake()).prefer(dummyDat);
    const candidates = await candidateGenerator(options, preferredDat, [
      gameNameBios,
      gameNamePrototype,
      gameNameSingleRom,
      gameNameMultipleRoms,
    ]);

    const datStatus = new StatusGenerator(new ProgressBarFake()).generate(preferredDat, candidates);
    await expect(datStatus.toCsv(options)).resolves
      .toEqual(`DAT Name,Game Name,Status,ROM Files,Patched,BIOS,Retail Release,Unlicensed,Debug,Demo,Beta,Sample,Prototype,Program,Aftermarket,Homebrew,Bad
dat,bios,FOUND,bios.rom,false,true,true,false,false,false,false,false,false,false,false,false,false
dat,device,FOUND,,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,game with multiple roms,FOUND,"one.rom|two.rom",false,false,true,false,false,false,false,false,false,false,false,false,false
dat,game with single rom,FOUND,game.rom,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,no roms,FOUND,,false,false,true,false,false,false,false,false,false,false,false,false,false`);
  });
});
