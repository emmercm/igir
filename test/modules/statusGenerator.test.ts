import StatusGenerator from '../../src/modules/statusGenerator.js';
import DAT from '../../src/types/logiqx/dat.js';
import Game from '../../src/types/logiqx/game.js';
import Header from '../../src/types/logiqx/header.js';
import Parent from '../../src/types/logiqx/parent.js';
import Release from '../../src/types/logiqx/release.js';
import ROM from '../../src/types/logiqx/rom.js';
import Options from '../../src/types/options.js';
import ReleaseCandidate from '../../src/types/releaseCandidate.js';
import ROMWithFiles from '../../src/types/romWithFiles.js';
import ProgressBarFake from '../console/progressBarFake.js';

const gameNameNoRoms = 'no roms';
const gameNameBios = 'bios';
const gameNamePrototype = 'game prototype (proto)';
const gameNameSingleRom = 'game with single rom';
const gameNameMultipleRoms = 'game with multiple roms';

const dat = new DAT(new Header({
  name: 'dat',
}), [
  new Game({
    name: gameNameNoRoms,
    // (a game can't count as "missing" if it has no ROMs)
  }),
  new Game({
    name: gameNameBios,
    bios: 'yes',
    rom: new ROM('bios.rom', 123, '11111111'),
  }),
  new Game({
    name: gameNamePrototype,
    rom: new ROM('game prototype (proto).rom', 123, '22222222'),
  }),
  new Game({
    name: gameNameSingleRom,
    rom: new ROM('game.rom', 123, '33333333'),
  }),
  new Game({
    name: gameNameMultipleRoms,
    rom: [
      new ROM('one.rom', 123, '44444444'),
      new ROM('two.rom', 123, '55555555'),
    ],
  }),
]);

async function getParentToReleaseCandidates(
  parentName: string,
): Promise<[Parent, ReleaseCandidate[]]> {
  const parent = dat.getParents().filter((p) => p.getName() === parentName)[0];
  const releaseCandidates = await Promise.all(parent.getGames()
    .map(async (game) => new ReleaseCandidate(
      game,
      new Release(parent.getName(), 'UNK', 'EN'),
      await Promise.all(game.getRoms().map(async (rom) => new ROMWithFiles(
        rom,
        await rom.toFile(),
        await rom.toFile(),
      ))),
    )));
  return [parent, releaseCandidates];
}

describe('toString', () => {
  describe('no candidates', () => {
    it('should return games, bioses, and retail as missing', async () => {
      const options = new Options();
      const datStatus = await new StatusGenerator(options, new ProgressBarFake())
        .output(dat, new Map());
      expect(datStatus.toString(options)).toEqual('1/5 games, 0/1 bioses, 1/4 retail releases found');
    });

    it('should return games and retail as missing', async () => {
      const options = new Options({ noBios: true });
      const datStatus = await new StatusGenerator(options, new ProgressBarFake())
        .output(dat, new Map());
      expect(datStatus.toString(options)).toEqual('1/5 games, 1/4 retail releases found');
    });

    it('should return bioses as missing', async () => {
      const options = new Options({ onlyBios: true });
      const datStatus = await new StatusGenerator(options, new ProgressBarFake())
        .output(dat, new Map());
      expect(datStatus.toString(options)).toEqual('0/1 bioses found');
    });

    it('should return bioses and retail as missing', async () => {
      const options = new Options({ single: true });
      const datStatus = await new StatusGenerator(options, new ProgressBarFake())
        .output(dat, new Map());
      expect(datStatus.toString(options)).toEqual('0/1 bioses, 1/4 retail releases found');
    });
  });

  describe('partially missing', () => {
    it('should return bios as found', async () => {
      const options = new Options();
      const map = new Map([
        await getParentToReleaseCandidates(gameNameBios),
      ]);
      const datStatus = await new StatusGenerator(options, new ProgressBarFake())
        .output(dat, map);
      expect(datStatus.toString(options)).toEqual('2/5 games, 1/1 bioses, 2/4 retail releases found');
    });

    it('should return prototype as found', async () => {
      const options = new Options();
      const map = new Map([
        await getParentToReleaseCandidates(gameNamePrototype),
      ]);
      const datStatus = await new StatusGenerator(options, new ProgressBarFake())
        .output(dat, map);
      expect(datStatus.toString(options)).toEqual('2/5 games, 0/1 bioses, 1/4 retail releases found');
    });

    it('should return game with single rom as found', async () => {
      const options = new Options();
      const map = new Map([
        await getParentToReleaseCandidates(gameNameSingleRom),
      ]);
      const datStatus = await new StatusGenerator(options, new ProgressBarFake())
        .output(dat, map);
      expect(datStatus.toString(options)).toEqual('2/5 games, 0/1 bioses, 2/4 retail releases found');
    });
  });

  it('should return none missing', async () => {
    const options = new Options();
    const map = new Map([
      await getParentToReleaseCandidates(gameNameBios),
      await getParentToReleaseCandidates(gameNamePrototype),
      await getParentToReleaseCandidates(gameNameSingleRom),
      await getParentToReleaseCandidates(gameNameMultipleRoms),
    ]);
    const datStatus = await new StatusGenerator(options, new ProgressBarFake())
      .output(dat, map);
    expect(datStatus.toString(options)).toEqual('5/5 games, 1/1 bioses, 4/4 retail releases found');
  });
});

describe('toCSV', () => {
  describe('no candidates', () => {
    it('should return games, bioses, and retail as missing', async () => {
      const options = new Options();
      const datStatus = await new StatusGenerator(options, new ProgressBarFake())
        .output(dat, new Map());
      await expect(datStatus.toCSV(options)).resolves.toEqual(`DAT Name,Game Name,Status,BIOS,Retail Release,Unlicensed,Demo,Beta,Sample,Prototype,Test,Aftermarket,Homebrew,Bad
dat,no roms,FOUND,false,true,false,false,false,false,false,false,false,false,false
dat,bios,MISSING,true,true,false,false,false,false,false,false,false,false,false
dat,game prototype (proto),MISSING,false,false,false,false,false,false,true,false,false,false,false
dat,game with single rom,MISSING,false,true,false,false,false,false,false,false,false,false,false
dat,game with multiple roms,MISSING,false,true,false,false,false,false,false,false,false,false,false`);
    });

    it('should return games and retail as missing', async () => {
      const options = new Options({ noBios: true });
      const datStatus = await new StatusGenerator(options, new ProgressBarFake())
        .output(dat, new Map());
      await expect(datStatus.toCSV(options)).resolves.toEqual(`DAT Name,Game Name,Status,BIOS,Retail Release,Unlicensed,Demo,Beta,Sample,Prototype,Test,Aftermarket,Homebrew,Bad
dat,no roms,FOUND,false,true,false,false,false,false,false,false,false,false,false
dat,bios,MISSING,true,true,false,false,false,false,false,false,false,false,false
dat,game prototype (proto),MISSING,false,false,false,false,false,false,true,false,false,false,false
dat,game with single rom,MISSING,false,true,false,false,false,false,false,false,false,false,false
dat,game with multiple roms,MISSING,false,true,false,false,false,false,false,false,false,false,false`);
    });

    it('should return bioses as missing', async () => {
      const options = new Options({ onlyBios: true });
      const datStatus = await new StatusGenerator(options, new ProgressBarFake())
        .output(dat, new Map());
      await expect(datStatus.toCSV(options)).resolves.toEqual(`DAT Name,Game Name,Status,BIOS,Retail Release,Unlicensed,Demo,Beta,Sample,Prototype,Test,Aftermarket,Homebrew,Bad
dat,bios,MISSING,true,true,false,false,false,false,false,false,false,false,false`);
    });

    it('should return bioses and retail as missing', async () => {
      const options = new Options({ single: true });
      const datStatus = await new StatusGenerator(options, new ProgressBarFake())
        .output(dat, new Map());
      await expect(datStatus.toCSV(options)).resolves.toEqual(`DAT Name,Game Name,Status,BIOS,Retail Release,Unlicensed,Demo,Beta,Sample,Prototype,Test,Aftermarket,Homebrew,Bad
dat,bios,MISSING,true,true,false,false,false,false,false,false,false,false,false
dat,no roms,FOUND,false,true,false,false,false,false,false,false,false,false,false
dat,game with single rom,MISSING,false,true,false,false,false,false,false,false,false,false,false
dat,game with multiple roms,MISSING,false,true,false,false,false,false,false,false,false,false,false`);
    });
  });

  describe('partially missing', () => {
    it('should return bios as found', async () => {
      const options = new Options();
      const map = new Map([
        await getParentToReleaseCandidates(gameNameBios),
      ]);
      const datStatus = await new StatusGenerator(options, new ProgressBarFake())
        .output(dat, map);
      await expect(datStatus.toCSV(options)).resolves.toEqual(`DAT Name,Game Name,Status,BIOS,Retail Release,Unlicensed,Demo,Beta,Sample,Prototype,Test,Aftermarket,Homebrew,Bad
dat,no roms,FOUND,false,true,false,false,false,false,false,false,false,false,false
dat,bios,FOUND,true,true,false,false,false,false,false,false,false,false,false
dat,game prototype (proto),MISSING,false,false,false,false,false,false,true,false,false,false,false
dat,game with single rom,MISSING,false,true,false,false,false,false,false,false,false,false,false
dat,game with multiple roms,MISSING,false,true,false,false,false,false,false,false,false,false,false`);
    });

    it('should return prototype as found', async () => {
      const options = new Options();
      const map = new Map([
        await getParentToReleaseCandidates(gameNamePrototype),
      ]);
      const datStatus = await new StatusGenerator(options, new ProgressBarFake())
        .output(dat, map);
      await expect(datStatus.toCSV(options)).resolves.toEqual(`DAT Name,Game Name,Status,BIOS,Retail Release,Unlicensed,Demo,Beta,Sample,Prototype,Test,Aftermarket,Homebrew,Bad
dat,no roms,FOUND,false,true,false,false,false,false,false,false,false,false,false
dat,bios,MISSING,true,true,false,false,false,false,false,false,false,false,false
dat,game prototype (proto),FOUND,false,false,false,false,false,false,true,false,false,false,false
dat,game with single rom,MISSING,false,true,false,false,false,false,false,false,false,false,false
dat,game with multiple roms,MISSING,false,true,false,false,false,false,false,false,false,false,false`);
    });

    it('should return game with single rom as found', async () => {
      const options = new Options();
      const map = new Map([
        await getParentToReleaseCandidates(gameNameSingleRom),
      ]);
      const datStatus = await new StatusGenerator(options, new ProgressBarFake())
        .output(dat, map);
      await expect(datStatus.toCSV(options)).resolves.toEqual(`DAT Name,Game Name,Status,BIOS,Retail Release,Unlicensed,Demo,Beta,Sample,Prototype,Test,Aftermarket,Homebrew,Bad
dat,no roms,FOUND,false,true,false,false,false,false,false,false,false,false,false
dat,bios,MISSING,true,true,false,false,false,false,false,false,false,false,false
dat,game prototype (proto),MISSING,false,false,false,false,false,false,true,false,false,false,false
dat,game with single rom,FOUND,false,true,false,false,false,false,false,false,false,false,false
dat,game with multiple roms,MISSING,false,true,false,false,false,false,false,false,false,false,false`);
    });
  });

  it('should return none missing', async () => {
    const options = new Options();
    const map = new Map([
      await getParentToReleaseCandidates(gameNameBios),
      await getParentToReleaseCandidates(gameNamePrototype),
      await getParentToReleaseCandidates(gameNameSingleRom),
      await getParentToReleaseCandidates(gameNameMultipleRoms),
    ]);
    const datStatus = await new StatusGenerator(options, new ProgressBarFake())
      .output(dat, map);
    await expect(datStatus.toCSV(options)).resolves.toEqual(`DAT Name,Game Name,Status,BIOS,Retail Release,Unlicensed,Demo,Beta,Sample,Prototype,Test,Aftermarket,Homebrew,Bad
dat,no roms,FOUND,false,true,false,false,false,false,false,false,false,false,false
dat,bios,FOUND,true,true,false,false,false,false,false,false,false,false,false
dat,game prototype (proto),FOUND,false,false,false,false,false,false,true,false,false,false,false
dat,game with single rom,FOUND,false,true,false,false,false,false,false,false,false,false,false
dat,game with multiple roms,FOUND,false,true,false,false,false,false,false,false,false,false,false`);
  });
});
