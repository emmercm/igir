import fg from 'fast-glob';
import fs from 'fs';
import path from 'path';
import util from 'util';

import Constants from '../../src/constants.js';
import ReportGenerator from '../../src/modules/reportGenerator.js';
import fsPoly from '../../src/polyfill/fsPoly.js';
import DATStatus from '../../src/types/datStatus.js';
import File from '../../src/types/files/file.js';
import DAT from '../../src/types/logiqx/dat.js';
import Game from '../../src/types/logiqx/game.js';
import Header from '../../src/types/logiqx/header.js';
import Parent from '../../src/types/logiqx/parent.js';
import ROM from '../../src/types/logiqx/rom.js';
import Options from '../../src/types/options.js';
import ReleaseCandidate from '../../src/types/releaseCandidate.js';
import ROMWithFiles from '../../src/types/romWithFiles.js';
import ProgressBarFake from '../console/progressBarFake.js';

/**
 * NOTE(cemmer): statusGenerator.test.ts has more complicated tests per-DATStatus, this file is to
 *  test the interaction of combining multiple DATStatus.
 */

const datStatusEmpty = new DATStatus(
  new DAT(new Header({ name: 'Empty' }), []),
  new Map(),
);

const gamesSingle = [
  new Game({
    name: 'One',
    rom: [new ROM('One', 123, 'abcdef01')],
  }),
];
async function buildDatStatusSingle(): Promise<DATStatus> {
  const entries = await Promise.all(
    gamesSingle.map(async (game): Promise<[Parent, ReleaseCandidate[]]> => [
      new Parent(game.getName(), game),
      [new ReleaseCandidate(
        game,
        undefined,
        await Promise.all(game.getRoms().map(async (rom) => {
          const romFile = await File.fileOf(`${rom.getName()}.rom`);
          return new ROMWithFiles(rom, romFile, romFile);
        })),
      )],
    ]),
  );
  const parentsToReleaseCandidates = new Map<Parent, ReleaseCandidate[]>(entries);
  return new DATStatus(
    new DAT(new Header({ name: 'Single' }), gamesSingle),
    parentsToReleaseCandidates,
  );
}

const gamesMultiple = [
  new Game({
    name: 'Two',
    rom: [new ROM('Two', 234, 'bcdef012')],
  }),
  new Game({
    name: 'Three',
    rom: [new ROM('Three', 345, 'cdef0123')],
  }),
  new Game({
    name: 'Four',
    rom: [new ROM('Four', 456, 'def01234')],
  }),
];
async function buildDatStatusMultiple(): Promise<DATStatus> {
  const entries = await Promise.all(
    gamesMultiple.map(async (game): Promise<[Parent, ReleaseCandidate[]]> => [
      new Parent(game.getName(), game),
      [new ReleaseCandidate(
        game,
        undefined,
        await Promise.all(game.getRoms().map(async (rom) => {
          const romFile = await File.fileOf(`${rom.getName()}.rom`);
          return new ROMWithFiles(rom, romFile, romFile);
        })),
      )],
    ]),
  );
  const parentsToReleaseCandidates = new Map<Parent, ReleaseCandidate[]>(entries);
  return new DATStatus(
    new DAT(new Header({ name: 'Multiple' }), gamesMultiple),
    parentsToReleaseCandidates,
  );
}

async function wrapReportGenerator(
  options: Options,
  romFiles: string[],
  cleanedOutputFiles: string[],
  datStatuses: DATStatus[],
  callback: (contents: string) => void | Promise<void>,
): Promise<void> {
  await new ReportGenerator(options, new ProgressBarFake())
    .generate(romFiles, cleanedOutputFiles, datStatuses);

  const outputReportPath = (await fg(path.join(
    path.dirname(options.getOutputReportPath()),
    `${Constants.COMMAND_NAME}_*.csv`,
  ).replace(/\\/g, '/'))).slice(-1)[0];
  const contents = (await util.promisify(fs.readFile)(outputReportPath)).toString();

  await callback(contents);

  await fsPoly.rm(outputReportPath);
}

it('should return empty contents for an empty DAT', async () => {
  await wrapReportGenerator(new Options(), [], [], [datStatusEmpty], (contents) => {
    expect(contents).toEqual('');
  });
});

it('should return one row for every game in a single game DAT', async () => {
  await wrapReportGenerator(new Options(), [], [], [await buildDatStatusSingle()], (contents) => {
    expect(contents).toEqual(`DAT Name,Game Name,Status,ROM Files,Patched,BIOS,Retail Release,Unlicensed,Demo,Beta,Sample,Prototype,Test,Aftermarket,Homebrew,Bad
Single,One,FOUND,One.rom,false,false,true,false,false,false,false,false,false,false,false,false`);
  });
});

it('should return one row for every game in a multiple game DAT', async () => {
  await wrapReportGenerator(new Options(), [], [], [await buildDatStatusMultiple()], (contents) => {
    expect(contents).toEqual(`DAT Name,Game Name,Status,ROM Files,Patched,BIOS,Retail Release,Unlicensed,Demo,Beta,Sample,Prototype,Test,Aftermarket,Homebrew,Bad
Multiple,Four,FOUND,Four.rom,false,false,true,false,false,false,false,false,false,false,false,false
Multiple,Three,FOUND,Three.rom,false,false,true,false,false,false,false,false,false,false,false,false
Multiple,Two,FOUND,Two.rom,false,false,true,false,false,false,false,false,false,false,false,false`);
  });
});

it('should return one row for every unmatched file in a multiple game DAT', async () => {
  await wrapReportGenerator(new Options(), [
    'One.rom',
    'Two.rom',
    'Three.rom',
    'Four.rom',
  ], [], [await buildDatStatusMultiple()], (contents) => {
    expect(contents).toEqual(`DAT Name,Game Name,Status,ROM Files,Patched,BIOS,Retail Release,Unlicensed,Demo,Beta,Sample,Prototype,Test,Aftermarket,Homebrew,Bad
Multiple,Four,FOUND,Four.rom,false,false,true,false,false,false,false,false,false,false,false,false
Multiple,Three,FOUND,Three.rom,false,false,true,false,false,false,false,false,false,false,false,false
Multiple,Two,FOUND,Two.rom,false,false,true,false,false,false,false,false,false,false,false,false
,,UNMATCHED,One.rom,false,false,false,false,false,false,false,false,false,false,false,false`);
  });
});

it('should return one row for every cleaned file in a multiple game DAT', async () => {
  await wrapReportGenerator(
    new Options(),
    ['One.rom', 'Two.rom'],
    ['Three.rom', 'Four.rom'],
    [await buildDatStatusMultiple()],
    (contents) => {
      expect(contents).toEqual(`DAT Name,Game Name,Status,ROM Files,Patched,BIOS,Retail Release,Unlicensed,Demo,Beta,Sample,Prototype,Test,Aftermarket,Homebrew,Bad
Multiple,Four,FOUND,Four.rom,false,false,true,false,false,false,false,false,false,false,false,false
Multiple,Three,FOUND,Three.rom,false,false,true,false,false,false,false,false,false,false,false,false
Multiple,Two,FOUND,Two.rom,false,false,true,false,false,false,false,false,false,false,false,false
,,UNMATCHED,One.rom,false,false,false,false,false,false,false,false,false,false,false,false
,,DELETED,Three.rom,false,false,false,false,false,false,false,false,false,false,false,false
,,DELETED,Four.rom,false,false,false,false,false,false,false,false,false,false,false,false`);
    },
  );
});

it('should return one row for every game in multiple DATs', async () => {
  await wrapReportGenerator(new Options(), [], [], [
    datStatusEmpty,
    await buildDatStatusSingle(),
    await buildDatStatusMultiple(),
  ], (contents) => {
    expect(contents).toEqual(`DAT Name,Game Name,Status,ROM Files,Patched,BIOS,Retail Release,Unlicensed,Demo,Beta,Sample,Prototype,Test,Aftermarket,Homebrew,Bad
Multiple,Four,FOUND,Four.rom,false,false,true,false,false,false,false,false,false,false,false,false
Multiple,Three,FOUND,Three.rom,false,false,true,false,false,false,false,false,false,false,false,false
Multiple,Two,FOUND,Two.rom,false,false,true,false,false,false,false,false,false,false,false,false
Single,One,FOUND,One.rom,false,false,true,false,false,false,false,false,false,false,false,false`);
  });
});
