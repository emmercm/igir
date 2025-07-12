import CandidateMergeSplitValidator from '../../../src/modules/candidates/candidateMergeSplitValidator.js';
import type DAT from '../../../src/types/dats/dat.js';
import Game from '../../../src/types/dats/game.js';
import Header from '../../../src/types/dats/logiqx/header.js';
import LogiqxDAT from '../../../src/types/dats/logiqx/logiqxDat.js';
import DeviceRef from '../../../src/types/dats/mame/deviceRef.js';
import ROM from '../../../src/types/dats/rom.js';
import SingleValueGame from '../../../src/types/dats/singleValueGame.js';
import File from '../../../src/types/files/file.js';
import Options, { MergeMode, MergeModeInverted } from '../../../src/types/options.js';
import ROMWithFiles from '../../../src/types/romWithFiles.js';
import WriteCandidate from '../../../src/types/writeCandidate.js';
import ProgressBarFake from '../../console/progressBarFake.js';

async function datToCandidates(dat: DAT): Promise<WriteCandidate[]> {
  const dummyFile = await File.fileOf({ filePath: '' });
  return dat.getGames().map((game) => {
    return new WriteCandidate(
      new SingleValueGame({ ...game }),
      game.getRoms().map((rom) => new ROMWithFiles(rom, dummyFile, dummyFile)),
    );
  });
}

describe('missing parents', () => {
  const dat = new LogiqxDAT({
    header: new Header(),
    games: [
      new Game({
        name: 'solo',
        roms: new ROM(),
      }),
      new Game({
        name: 'parent',
        cloneOf: 'grandparent',
        roms: new ROM(),
      }),
      new Game({
        name: 'child',
        cloneOf: 'parent',
        roms: new ROM(),
      }),
    ],
  });

  test.each(
    Object.values(MergeMode)
      .filter((mode) => mode !== MergeMode.SPLIT)
      .map((mode) => MergeModeInverted[mode].toLowerCase()),
  )('should return no missing games for %s sets', async (mergeRoms) => {
    const options = new Options({ mergeRoms });
    const candidates = await datToCandidates(dat);

    const missingGames = new CandidateMergeSplitValidator(options, new ProgressBarFake()).validate(
      dat,
      candidates,
    );
    expect(missingGames).toEqual([]);
  });

  it('should return missing games for split sets', async () => {
    const options = new Options({
      mergeRoms: MergeModeInverted[MergeMode.SPLIT].toLowerCase(),
    });
    const candidates = await datToCandidates(dat);

    const missingGames = new CandidateMergeSplitValidator(options, new ProgressBarFake()).validate(
      dat,
      candidates,
    );
    expect(missingGames).toEqual(['grandparent']);
  });
});

describe('device refs', () => {
  const dat = new LogiqxDAT({
    header: new Header(),
    games: [
      new Game({
        name: 'game one',
        roms: new ROM(),
        // Invalid device ref, there is no machine of the same name
        deviceRef: new DeviceRef('controller'),
      }),
      new Game({
        name: 'game two',
        roms: new ROM(),
        // Valid device ref, there is a machine of the same name
        deviceRef: new DeviceRef('screen'),
      }),
      new Game({
        name: 'screen',
        roms: new ROM(),
        isDevice: 'yes',
      }),
    ],
  });

  it('should return no missing device refs for fullnonmerged sets', async () => {
    const options = new Options({
      mergeRoms: MergeModeInverted[MergeMode.FULLNONMERGED].toLowerCase(),
    });
    const candidates = (await datToCandidates(dat))
      // Remove all candidates for devices
      .filter((candidate) => !candidate.getGame().getIsDevice());

    const missingGames = new CandidateMergeSplitValidator(options, new ProgressBarFake()).validate(
      dat,
      candidates,
    );
    expect(missingGames).toEqual([]);
  });

  test.each(
    Object.values(MergeMode)
      .filter((mode) => mode !== MergeMode.FULLNONMERGED)
      .map((mode) => MergeModeInverted[mode].toLowerCase()),
  )('should return missing games for %s sets', async (mergeRoms) => {
    const options = new Options({ mergeRoms });
    const candidates = (await datToCandidates(dat))
      // Remove all candidates for devices
      .filter((candidate) => !candidate.getGame().getIsDevice());

    const missingGames = new CandidateMergeSplitValidator(options, new ProgressBarFake()).validate(
      dat,
      candidates,
    );
    expect(missingGames).toEqual(['screen']);
  });
});
