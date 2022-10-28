import fg from 'fast-glob';
import { promises as fsPromises } from 'fs';
import path from 'path';

import Constants from '../../src/constants.js';
import ReportGenerator from '../../src/modules/reportGenerator.js';
import fsPoly from '../../src/polyfill/fsPoly.js';
import DATStatus from '../../src/types/datStatus.js';
import DAT from '../../src/types/logiqx/dat.js';
import Game from '../../src/types/logiqx/game.js';
import Header from '../../src/types/logiqx/header.js';
import Parent from '../../src/types/logiqx/parent.js';
import Options from '../../src/types/options.js';
import ReleaseCandidate from '../../src/types/releaseCandidate.js';
import ProgressBarFake from '../console/progressBarFake.js';

const datStatusEmpty = new DATStatus(
  new DAT(new Header({ name: 'Empty' }), []),
  new Map(),
);

const gamesSingle = [
  new Game({
    name: 'One',
    rom: [],
  }),
];
const datStatusSingle = new DATStatus(
  new DAT(new Header({ name: 'Single' }), gamesSingle),
  new Map<Parent, ReleaseCandidate[]>(gamesSingle.map((game) => [
    new Parent(game.getName(), game),
    [new ReleaseCandidate(game, undefined, [])],
  ])),
);

const gamesMultiple = [
  new Game({
    name: 'Two',
    rom: [],
  }),
  new Game({
    name: 'Three',
    rom: [],
  }),
  new Game({
    name: 'Four',
    rom: [],
  }),
];
const datStatusMultiple = new DATStatus(
  new DAT(new Header({ name: 'Multiple' }), gamesMultiple),
  new Map<Parent, ReleaseCandidate[]>(gamesMultiple.map((game) => [
    new Parent(game.getName(), game),
    [new ReleaseCandidate(game, undefined, [])],
  ])),
);

async function wrapReportGenerator(
  options: Options,
  datStatuses: DATStatus[],
  callback: (contents: string) => void | Promise<void>,
): Promise<void> {
  await new ReportGenerator(options, new ProgressBarFake()).generate(datStatuses);

  console.log(options.getOutputReportPath());
  const outputReportPath = (await fg(`${path.dirname(options.getOutputReportPath())}/${Constants.COMMAND_NAME}_*.csv`)).slice(-1)[0];
  console.log(outputReportPath);
  const contents = (await fsPromises.readFile(outputReportPath)).toString();

  await callback(contents);

  await fsPoly.rm(outputReportPath);
}

it('should return empty contents for an empty DAT', async () => {
  await wrapReportGenerator(new Options(), [datStatusEmpty], (contents) => {
    expect(contents).toEqual('');
  });
});

it('should return one row for a single game DAT', async () => {
  await wrapReportGenerator(new Options(), [datStatusSingle], (contents) => {
    expect(contents).toEqual(`DAT Name,Game Name,Status,ROM Files,BIOS,Retail Release,Unlicensed,Demo,Beta,Sample,Prototype,Test,Aftermarket,Homebrew,Bad
Single,One,FOUND,,false,true,false,false,false,false,false,false,false,false,false`);
  });
});

it('should return multiple rows for a multiple game DAT', async () => {
  await wrapReportGenerator(new Options(), [datStatusMultiple], (contents) => {
    expect(contents).toEqual(`DAT Name,Game Name,Status,ROM Files,BIOS,Retail Release,Unlicensed,Demo,Beta,Sample,Prototype,Test,Aftermarket,Homebrew,Bad
Multiple,Four,FOUND,,false,true,false,false,false,false,false,false,false,false,false
Multiple,Three,FOUND,,false,true,false,false,false,false,false,false,false,false,false
Multiple,Two,FOUND,,false,true,false,false,false,false,false,false,false,false,false`);
  });
});

it('should return multiple rows for multiple DATs', async () => {
  await wrapReportGenerator(new Options(), [
    datStatusEmpty, datStatusSingle, datStatusMultiple,
  ], (contents) => {
    expect(contents).toEqual(`DAT Name,Game Name,Status,ROM Files,BIOS,Retail Release,Unlicensed,Demo,Beta,Sample,Prototype,Test,Aftermarket,Homebrew,Bad
Multiple,Four,FOUND,,false,true,false,false,false,false,false,false,false,false,false
Multiple,Three,FOUND,,false,true,false,false,false,false,false,false,false,false,false
Multiple,Two,FOUND,,false,true,false,false,false,false,false,false,false,false,false
Single,One,FOUND,,false,true,false,false,false,false,false,false,false,false,false`);
  });
});
