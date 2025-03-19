import CandidateMergeSplitValidator from '../../../src/modules/candidates/candidateMergeSplitValidator.js';
import DAT from '../../../src/types/dats/dat.js';
import Header from '../../../src/types/dats/logiqx/header.js';
import LogiqxDAT from '../../../src/types/dats/logiqx/logiqxDat.js';
import DeviceRef from '../../../src/types/dats/mame/deviceRef.js';
import Machine from '../../../src/types/dats/mame/machine.js';
import ROM from '../../../src/types/dats/rom.js';
import File from '../../../src/types/files/file.js';
import Options, { MergeMode } from '../../../src/types/options.js';
import ROMWithFiles from '../../../src/types/romWithFiles.js';
import WriteCandidate from '../../../src/types/writeCandidate.js';
import ProgressBarFake from '../../console/progressBarFake.js';

async function datToCandidates(dat: DAT): Promise<WriteCandidate[]> {
  const dummyFile = await File.fileOf({ filePath: '' });
  return dat.getGames().map((game) => {
    return new WriteCandidate(
      game,
      game.getRoms().map((rom) => new ROMWithFiles(rom, dummyFile, dummyFile)),
    );
  });
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
      mergeRoms: MergeMode[MergeMode.SPLIT].toLowerCase(),
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
    Object.keys(MergeMode)
      .filter((mode) => Number.isNaN(Number(mode)))
      .filter((mode) => mode !== MergeMode[MergeMode.FULLNONMERGED])
      .map((mode) => [mode.toLowerCase()]),
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
