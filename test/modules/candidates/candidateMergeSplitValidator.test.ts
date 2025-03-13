import CandidateMergeSplitValidator from '../../../src/modules/candidates/candidateMergeSplitValidator.js';
import DAT from '../../../src/types/dats/dat.js';
import Header from '../../../src/types/dats/logiqx/header.js';
import LogiqxDAT from '../../../src/types/dats/logiqx/logiqxDat.js';
import DeviceRef from '../../../src/types/dats/mame/deviceRef.js';
import Machine from '../../../src/types/dats/mame/machine.js';
import Parent from '../../../src/types/dats/parent.js';
import ROM from '../../../src/types/dats/rom.js';
import File from '../../../src/types/files/file.js';
import Options, { MergeMode } from '../../../src/types/options.js';
import ReleaseCandidate from '../../../src/types/releaseCandidate.js';
import ROMWithFiles from '../../../src/types/romWithFiles.js';
import ProgressBarFake from '../../console/progressBarFake.js';

async function datToCandidates(dat: DAT): Promise<Map<Parent, ReleaseCandidate[]>> {
  const dummyFile = await File.fileOf({ filePath: '' });
  return dat.getParents().reduce((map, parent) => {
    const releaseCandidates = parent.getGames().flatMap((game) =>
      (game.getReleases().length > 0 ? game.getReleases() : [undefined]).map(
        (release) =>
          new ReleaseCandidate(
            game,
            release,
            game.getRoms().map((rom) => new ROMWithFiles(rom, dummyFile, dummyFile)),
          ),
      ),
    );
    map.set(parent, releaseCandidates);
    return map;
  }, new Map<Parent, ReleaseCandidate[]>());
}

describe('missing parents', () => {
  const dat = new LogiqxDAT(new Header(), [
    new Machine({
      name: 'solo',
      rom: new ROM(),
    }),
    new Machine({
      name: 'parent',
      cloneOf: 'grandparent',
      rom: new ROM(),
    }),
    new Machine({
      name: 'child',
      cloneOf: 'parent',
      rom: new ROM(),
    }),
  ]);

  test.each(
    Object.keys(MergeMode)
      .filter((mode) => Number.isNaN(Number(mode)))
      .filter((mode) => mode !== MergeMode[MergeMode.SPLIT])
      .map((mode) => [mode.toLowerCase()]),
  )('should return no missing parents for %s sets', async (mergeRoms) => {
    const options = new Options({ mergeRoms });
    const parentsToCandidates = await datToCandidates(dat);

    const missingGames = new CandidateMergeSplitValidator(options, new ProgressBarFake()).validate(
      dat,
      parentsToCandidates,
    );
    expect(missingGames).toEqual([]);
  });

  it('should return missing parents for split sets', async () => {
    const options = new Options({
      mergeRoms: MergeMode[MergeMode.SPLIT].toLowerCase(),
    });
    const parentsToCandidates = await datToCandidates(dat);

    const missingGames = new CandidateMergeSplitValidator(options, new ProgressBarFake()).validate(
      dat,
      parentsToCandidates,
    );
    expect(missingGames).toEqual(['grandparent']);
  });
});

describe('device refs', () => {
  const dat = new LogiqxDAT(new Header(), [
    new Machine({
      name: 'game one',
      rom: new ROM(),
      // Invalid device ref, there is no machine of the same name
      deviceRef: new DeviceRef('controller'),
    }),
    new Machine({
      name: 'game two',
      rom: new ROM(),
      // Valid device ref, there is a machine of the same name
      deviceRef: new DeviceRef('screen'),
    }),
    new Machine({
      name: 'screen',
      rom: new ROM(),
      isDevice: 'yes',
    }),
  ]);

  it('should return no missing device refs for fullnonmerged sets', async () => {
    const options = new Options({
      mergeRoms: MergeMode[MergeMode.FULLNONMERGED].toLowerCase(),
    });
    const parentsToCandidates = new Map(
      [...(await datToCandidates(dat)).entries()]
        // Remove all candidates for devices
        .filter(([, candidate]) => candidate.some((rc) => !rc.getGame().getIsDevice())),
    );

    const missingGames = new CandidateMergeSplitValidator(options, new ProgressBarFake()).validate(
      dat,
      parentsToCandidates,
    );
    expect(missingGames).toEqual([]);
  });

  test.each(
    Object.keys(MergeMode)
      .filter((mode) => Number.isNaN(Number(mode)))
      .filter((mode) => mode !== MergeMode[MergeMode.FULLNONMERGED])
      .map((mode) => [mode.toLowerCase()]),
  )('should return missing parents for %s sets', async (mergeRoms) => {
    const options = new Options({ mergeRoms });
    const parentsToCandidates = new Map(
      [...(await datToCandidates(dat)).entries()]
        // Remove all candidates for devices
        .filter(([, candidate]) => candidate.some((rc) => !rc.getGame().getIsDevice())),
    );

    const missingGames = new CandidateMergeSplitValidator(options, new ProgressBarFake()).validate(
      dat,
      parentsToCandidates,
    );
    expect(missingGames).toEqual(['screen']);
  });
});
