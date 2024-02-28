import stripAnsi from 'strip-ansi';

import CandidatePreferer from '../../src/modules/candidatePreferer.js';
import StatusGenerator from '../../src/modules/statusGenerator.js';
import Game from '../../src/types/dats/game.js';
import Header from '../../src/types/dats/logiqx/header.js';
import LogiqxDAT from '../../src/types/dats/logiqx/logiqxDat.js';
import Parent from '../../src/types/dats/parent.js';
import ROM from '../../src/types/dats/rom.js';
import File from '../../src/types/files/file.js';
import Options, { OptionsProps } from '../../src/types/options.js';
import IPSPatch from '../../src/types/patches/ipsPatch.js';
import ReleaseCandidate from '../../src/types/releaseCandidate.js';
import ROMWithFiles from '../../src/types/romWithFiles.js';
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
    bios: 'yes',
    rom: new ROM({ name: 'bios.rom', size: 123, crc: '11111111' }),
  }),
  new Game({
    name: gameNamePrototype,
    cloneOf: gameNameSingleRom,
    rom: new ROM({ name: 'game prototype (proto).rom', size: 123, crc: '22222222' }),
  }),
  new Game({
    name: gameNameSingleRom,
    rom: new ROM({ name: 'game.rom', size: 123, crc: '33333333' }),
  }),
  new Game({
    name: gameNameMultipleRoms,
    rom: [
      new ROM({ name: 'one.rom', size: 123, crc: '44444444' }),
      new ROM({ name: 'two.rom', size: 123, crc: '55555555' }),
    ],
  }),
  new Game({
    name: gameNameDevice,
    device: 'yes',
    // (a game can't count as "missing" if it has no ROMs)
  }),
];

const dummyDat = new LogiqxDAT(new Header({
  name: 'dat',
}), games);

const parentsToReleaseCandidatesWithoutFiles = new Map(dummyDat.getParents().map((parent) => ([
  parent,
  [] as ReleaseCandidate[], // no candidates
])));

async function candidateGenerator(
  options: Options,
  gameNames: string[],
): Promise<Map<Parent, ReleaseCandidate[]>> {
  const candidates = new Map(await Promise.all([...parentsToReleaseCandidatesWithoutFiles.entries()]
    .map(async ([parent]): Promise<[Parent, ReleaseCandidate[]]> => {
      const releaseCandidatesWithFiles = (await Promise.all(
        parent.getGames()
          .filter((game) => gameNames.includes(game.getName()))
          .map(async (game) => {
            const releases = game.getReleases().length > 0 ? game.getReleases() : [undefined];
            return Promise.all(releases.map(async (release) => {
              const romWithFiles = await Promise.all(game.getRoms()
                .map(async (rom) => new ROMWithFiles(
                  rom,
                  await rom.toFile(),
                  await rom.toFile(),
                )));
              return new ReleaseCandidate(game, release, romWithFiles);
            }));
          }),
      )).flat();
      return [parent, releaseCandidatesWithFiles];
    })));

  return new CandidatePreferer(options, new ProgressBarFake()).prefer(dummyDat, candidates);
}

describe('toConsole', () => {
  describe('no candidates', () => {
    test.each([true, false, undefined])('should print games without ROMs as found when single:%s', async (single) => {
      const options = new Options({
        ...defaultOptions,
        single,
        preferParent: true,
      });
      const map = await candidateGenerator(options, []);
      const datStatus = new StatusGenerator(options, new ProgressBarFake())
        .generate(dummyDat, map);
      expect(stripAnsi(datStatus.toConsole(options))).toEqual('2/6 games, 0/1 BIOSes, 1/1 devices, 2/5 retail releases found');
    });

    it('should not print BIOS count when noBios:true', () => {
      const options = new Options({ ...defaultOptions, noBios: true });
      const datStatus = new StatusGenerator(options, new ProgressBarFake())
        .generate(dummyDat, parentsToReleaseCandidatesWithoutFiles);
      expect(stripAnsi(datStatus.toConsole(options))).toEqual('2/6 games, 1/1 devices, 2/5 retail releases found');
    });

    it('should only print BIOS count when onlyBios:true', () => {
      const options = new Options({ ...defaultOptions, onlyBios: true });
      const datStatus = new StatusGenerator(options, new ProgressBarFake())
        .generate(dummyDat, parentsToReleaseCandidatesWithoutFiles);
      expect(stripAnsi(datStatus.toConsole(options))).toEqual('0/1 BIOSes found');
    });

    it('should not print device count when noDevice:true', () => {
      const options = new Options({ ...defaultOptions, noDevice: true });
      const datStatus = new StatusGenerator(options, new ProgressBarFake())
        .generate(dummyDat, parentsToReleaseCandidatesWithoutFiles);
      expect(stripAnsi(datStatus.toConsole(options))).toEqual('2/6 games, 0/1 BIOSes, 2/5 retail releases found');
    });

    it('should not print device count when onlyDevice:true', () => {
      const options = new Options({ ...defaultOptions, onlyDevice: true });
      const datStatus = new StatusGenerator(options, new ProgressBarFake())
        .generate(dummyDat, parentsToReleaseCandidatesWithoutFiles);
      expect(stripAnsi(datStatus.toConsole(options))).toEqual('1/1 devices found');
    });
  });

  describe('partially missing', () => {
    it('should print games without ROMS and BIOSes as found', async () => {
      const options = new Options(defaultOptions);
      const map = await candidateGenerator(options, [gameNameBios]);
      const datStatus = new StatusGenerator(options, new ProgressBarFake())
        .generate(dummyDat, map);
      expect(stripAnsi(datStatus.toConsole(options))).toEqual('3/6 games, 1/1 BIOSes, 1/1 devices, 3/5 retail releases found');
    });

    it('should print prototypes as found', async () => {
      const options = new Options(defaultOptions);
      const map = await candidateGenerator(options, [gameNamePrototype]);
      const datStatus = new StatusGenerator(options, new ProgressBarFake())
        .generate(dummyDat, map);
      expect(stripAnsi(datStatus.toConsole(options))).toEqual('3/6 games, 0/1 BIOSes, 1/1 devices, 2/5 retail releases found');
    });

    it('should print the game with single rom as found', async () => {
      const options = new Options(defaultOptions);
      const map = await candidateGenerator(options, [gameNameSingleRom]);
      const datStatus = new StatusGenerator(options, new ProgressBarFake())
        .generate(dummyDat, map);
      expect(stripAnsi(datStatus.toConsole(options))).toEqual('3/6 games, 0/1 BIOSes, 1/1 devices, 3/5 retail releases found');
    });
  });

  it('should always print patched games as found', async () => {
    const game = new Game({ name: 'patched game' });
    const rom = new ROM({ name: 'patched.rom', size: 123, crc: '00000000' });
    const map = new Map([
      ...parentsToReleaseCandidatesWithoutFiles,
      [
        new Parent(game),
        [new ReleaseCandidate(game, undefined, [new ROMWithFiles(
          rom,
          (await rom.toFile()).withPatch(IPSPatch.patchFrom(await File.fileOf('patch 00000000.ips'))),
          await rom.toFile(),
        )])],
      ],
    ]);

    const options = new Options(defaultOptions);
    const datStatus = new StatusGenerator(options, new ProgressBarFake())
      .generate(dummyDat, map);
    expect(stripAnsi(datStatus.toConsole(options))).toEqual('2/6 games, 0/1 BIOSes, 1/1 devices, 2/5 retail releases, 1 patched games found');
  });

  it('should print every game as found when all are present', async () => {
    const options = new Options(defaultOptions);
    const map = await candidateGenerator(options, [
      gameNameBios,
      gameNamePrototype,
      gameNameSingleRom,
      gameNameMultipleRoms,
    ]);
    const datStatus = new StatusGenerator(options, new ProgressBarFake())
      .generate(dummyDat, map);
    expect(stripAnsi(datStatus.toConsole(options))).toEqual('6/6 games, 1/1 BIOSes, 1/1 devices, 5/5 retail releases found');
  });

  it('should print only the preferred game as found when all are present and single:true', async () => {
    const options = new Options({
      ...defaultOptions,
      single: true,
      preferParent: true,
    });
    let map = await candidateGenerator(options, [
      gameNameBios,
      gameNamePrototype,
      gameNameSingleRom,
      gameNameMultipleRoms,
    ]);
    map = await new CandidatePreferer(options, new ProgressBarFake()).prefer(dummyDat, map);
    const datStatus = new StatusGenerator(options, new ProgressBarFake())
      .generate(dummyDat, map);
    expect(stripAnsi(datStatus.toConsole(options))).toEqual('5/5 games, 1/1 BIOSes, 1/1 devices, 5/5 retail releases found');
  });
});

describe('toCSV', () => {
  describe('no candidates', () => {
    test.each([true, false, undefined])('should report games without ROMs as found', async (single) => {
      const options = new Options({
        ...defaultOptions,
        single,
        preferParent: true,
      });
      const map = await candidateGenerator(options, []);
      const datStatus = new StatusGenerator(options, new ProgressBarFake())
        .generate(dummyDat, map);
      await expect(datStatus.toCsv(options)).resolves.toEqual(`DAT Name,Game Name,Status,ROM Files,Patched,BIOS,Retail Release,Unlicensed,Debug,Demo,Beta,Sample,Prototype,Program,Aftermarket,Homebrew,Bad
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
      const datStatus = new StatusGenerator(options, new ProgressBarFake())
        .generate(dummyDat, parentsToReleaseCandidatesWithoutFiles);
      await expect(datStatus.toCsv(options)).resolves.toEqual(`DAT Name,Game Name,Status,ROM Files,Patched,BIOS,Retail Release,Unlicensed,Debug,Demo,Beta,Sample,Prototype,Program,Aftermarket,Homebrew,Bad
dat,bios,MISSING,,false,true,true,false,false,false,false,false,false,false,false,false,false
dat,device,FOUND,,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,game prototype (proto),MISSING,,false,false,false,false,false,false,false,false,true,false,false,false,false
dat,game with multiple roms,MISSING,,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,game with single rom,MISSING,,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,no roms,FOUND,,false,false,true,false,false,false,false,false,false,false,false,false,false`);
    });

    it('should only report BIOSes when onlyBios:true', async () => {
      const options = new Options({ ...defaultOptions, onlyBios: true });
      const datStatus = new StatusGenerator(options, new ProgressBarFake())
        .generate(dummyDat, parentsToReleaseCandidatesWithoutFiles);
      await expect(datStatus.toCsv(options)).resolves.toEqual(`DAT Name,Game Name,Status,ROM Files,Patched,BIOS,Retail Release,Unlicensed,Debug,Demo,Beta,Sample,Prototype,Program,Aftermarket,Homebrew,Bad
dat,bios,MISSING,,false,true,true,false,false,false,false,false,false,false,false,false,false`);
    });

    // NOTE(cemmer): the device game shows here because DATFilter is never run, and this is fine
    it('should not report devices when noDevice:true', async () => {
      const options = new Options({ ...defaultOptions, noDevice: true });
      const datStatus = new StatusGenerator(options, new ProgressBarFake())
        .generate(dummyDat, parentsToReleaseCandidatesWithoutFiles);
      await expect(datStatus.toCsv(options)).resolves.toEqual(`DAT Name,Game Name,Status,ROM Files,Patched,BIOS,Retail Release,Unlicensed,Debug,Demo,Beta,Sample,Prototype,Program,Aftermarket,Homebrew,Bad
dat,bios,MISSING,,false,true,true,false,false,false,false,false,false,false,false,false,false
dat,device,FOUND,,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,game prototype (proto),MISSING,,false,false,false,false,false,false,false,false,true,false,false,false,false
dat,game with multiple roms,MISSING,,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,game with single rom,MISSING,,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,no roms,FOUND,,false,false,true,false,false,false,false,false,false,false,false,false,false`);
    });

    it('should not report devices when onlyDevice:true', async () => {
      const options = new Options({ ...defaultOptions, onlyDevice: true });
      const datStatus = new StatusGenerator(options, new ProgressBarFake())
        .generate(dummyDat, parentsToReleaseCandidatesWithoutFiles);
      await expect(datStatus.toCsv(options)).resolves.toEqual(`DAT Name,Game Name,Status,ROM Files,Patched,BIOS,Retail Release,Unlicensed,Debug,Demo,Beta,Sample,Prototype,Program,Aftermarket,Homebrew,Bad
dat,device,FOUND,,false,false,true,false,false,false,false,false,false,false,false,false,false`);
    });
  });

  describe('partially missing', () => {
    it('should report the BIOS as found', async () => {
      const options = new Options(defaultOptions);
      const map = await candidateGenerator(options, [gameNameBios]);
      const datStatus = new StatusGenerator(options, new ProgressBarFake())
        .generate(dummyDat, map);
      await expect(datStatus.toCsv(options)).resolves.toEqual(`DAT Name,Game Name,Status,ROM Files,Patched,BIOS,Retail Release,Unlicensed,Debug,Demo,Beta,Sample,Prototype,Program,Aftermarket,Homebrew,Bad
dat,bios,FOUND,bios.rom,false,true,true,false,false,false,false,false,false,false,false,false,false
dat,device,FOUND,,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,game prototype (proto),MISSING,,false,false,false,false,false,false,false,false,true,false,false,false,false
dat,game with multiple roms,MISSING,,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,game with single rom,MISSING,,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,no roms,FOUND,,false,false,true,false,false,false,false,false,false,false,false,false,false`);
    });

    it('should report on incomplete games', async () => {
      const options = new Options(defaultOptions);

      const map = new Map(await Promise.all([...parentsToReleaseCandidatesWithoutFiles.entries()]
        .map(async ([parent]): Promise<[Parent, ReleaseCandidate[]]> => {
          // Only the game with multiple ROMs
          if (parent.getName() !== gameNameMultipleRoms) {
            return [parent, []];
          }

          const releaseCandidatesWithFiles = (await Promise.all(
            parent.getGames().map(async (game) => {
              const releases = game.getReleases().length > 0 ? game.getReleases() : [undefined];
              return Promise.all(releases.map(async (release) => {
                const romWithFiles = await Promise.all(game.getRoms()
                  // Only the first ROM, not all of them
                  .slice(0, 1)
                  .map(async (rom) => new ROMWithFiles(
                    rom,
                    await rom.toFile(),
                    await rom.toFile(),
                  )));
                return new ReleaseCandidate(game, release, romWithFiles);
              }));
            }),
          )).flat();
          return [parent, releaseCandidatesWithFiles];
        })));

      const datStatus = new StatusGenerator(options, new ProgressBarFake())
        .generate(dummyDat, map);
      await expect(datStatus.toCsv(options)).resolves.toEqual(`DAT Name,Game Name,Status,ROM Files,Patched,BIOS,Retail Release,Unlicensed,Debug,Demo,Beta,Sample,Prototype,Program,Aftermarket,Homebrew,Bad
dat,bios,MISSING,,false,true,true,false,false,false,false,false,false,false,false,false,false
dat,device,FOUND,,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,game prototype (proto),MISSING,,false,false,false,false,false,false,false,false,true,false,false,false,false
dat,game with multiple roms,INCOMPLETE,one.rom,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,game with single rom,MISSING,,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,no roms,FOUND,,false,false,true,false,false,false,false,false,false,false,false,false,false`);
    });

    it('should report the prototype as found', async () => {
      const options = new Options(defaultOptions);
      const map = await candidateGenerator(options, [gameNamePrototype]);
      const datStatus = new StatusGenerator(options, new ProgressBarFake())
        .generate(dummyDat, map);
      await expect(datStatus.toCsv(options)).resolves.toEqual(`DAT Name,Game Name,Status,ROM Files,Patched,BIOS,Retail Release,Unlicensed,Debug,Demo,Beta,Sample,Prototype,Program,Aftermarket,Homebrew,Bad
dat,bios,MISSING,,false,true,true,false,false,false,false,false,false,false,false,false,false
dat,device,FOUND,,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,game prototype (proto),FOUND,game prototype (proto).rom,false,false,false,false,false,false,false,false,true,false,false,false,false
dat,game with multiple roms,MISSING,,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,game with single rom,MISSING,,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,no roms,FOUND,,false,false,true,false,false,false,false,false,false,false,false,false,false`);
    });

    it('should report the game with a single ROM as found', async () => {
      const options = new Options(defaultOptions);
      const map = await candidateGenerator(options, [gameNameSingleRom]);
      const datStatus = new StatusGenerator(options, new ProgressBarFake())
        .generate(dummyDat, map);
      await expect(datStatus.toCsv(options)).resolves.toEqual(`DAT Name,Game Name,Status,ROM Files,Patched,BIOS,Retail Release,Unlicensed,Debug,Demo,Beta,Sample,Prototype,Program,Aftermarket,Homebrew,Bad
dat,bios,MISSING,,false,true,true,false,false,false,false,false,false,false,false,false,false
dat,device,FOUND,,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,game prototype (proto),MISSING,,false,false,false,false,false,false,false,false,true,false,false,false,false
dat,game with multiple roms,MISSING,,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,game with single rom,FOUND,game.rom,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,no roms,FOUND,,false,false,true,false,false,false,false,false,false,false,false,false,false`);
    });
  });

  it('should always report patched games as found', async () => {
    const game = new Game({ name: 'patched game' });
    const rom = new ROM({ name: 'patched.rom', size: 123, crc: '00000000' });
    const map = new Map([
      ...parentsToReleaseCandidatesWithoutFiles,
      [
        new Parent(game),
        [new ReleaseCandidate(game, undefined, [new ROMWithFiles(
          rom,
          (await rom.toFile()).withPatch(IPSPatch.patchFrom(await File.fileOf('patch 00000000.ips'))),
          await rom.toFile(),
        )])],
      ],
    ]);

    const options = new Options(defaultOptions);
    const datStatus = new StatusGenerator(options, new ProgressBarFake())
      .generate(dummyDat, map);
    await expect(datStatus.toCsv(options)).resolves.toEqual(`DAT Name,Game Name,Status,ROM Files,Patched,BIOS,Retail Release,Unlicensed,Debug,Demo,Beta,Sample,Prototype,Program,Aftermarket,Homebrew,Bad
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
    const map = await candidateGenerator(options, [
      gameNameBios,
      gameNamePrototype,
      gameNameSingleRom,
      gameNameMultipleRoms,
    ]);
    const datStatus = new StatusGenerator(options, new ProgressBarFake())
      .generate(dummyDat, map);
    await expect(datStatus.toCsv(options)).resolves.toEqual(`DAT Name,Game Name,Status,ROM Files,Patched,BIOS,Retail Release,Unlicensed,Debug,Demo,Beta,Sample,Prototype,Program,Aftermarket,Homebrew,Bad
dat,bios,FOUND,bios.rom,false,true,true,false,false,false,false,false,false,false,false,false,false
dat,device,FOUND,,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,game prototype (proto),FOUND,game prototype (proto).rom,false,false,false,false,false,false,false,false,true,false,false,false,false
dat,game with multiple roms,FOUND,"one.rom|two.rom",false,false,true,false,false,false,false,false,false,false,false,false,false
dat,game with single rom,FOUND,game.rom,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,no roms,FOUND,,false,false,true,false,false,false,false,false,false,false,false,false,false`);
  });

  it('should print only the preferred game as found when all are present and single:true', async () => {
    const options = new Options({
      ...defaultOptions,
      single: true,
      preferParent: true,
    });
    const map = await candidateGenerator(options, [
      gameNameBios,
      gameNamePrototype,
      gameNameSingleRom,
      gameNameMultipleRoms,
    ]);
    const datStatus = new StatusGenerator(options, new ProgressBarFake())
      .generate(dummyDat, map);
    await expect(datStatus.toCsv(options)).resolves.toEqual(`DAT Name,Game Name,Status,ROM Files,Patched,BIOS,Retail Release,Unlicensed,Debug,Demo,Beta,Sample,Prototype,Program,Aftermarket,Homebrew,Bad
dat,bios,FOUND,bios.rom,false,true,true,false,false,false,false,false,false,false,false,false,false
dat,device,FOUND,,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,game prototype (proto),IGNORED,,false,false,false,false,false,false,false,false,true,false,false,false,false
dat,game with multiple roms,FOUND,"one.rom|two.rom",false,false,true,false,false,false,false,false,false,false,false,false,false
dat,game with single rom,FOUND,game.rom,false,false,true,false,false,false,false,false,false,false,false,false,false
dat,no roms,FOUND,,false,false,true,false,false,false,false,false,false,false,false,false,false`);
  });
});
