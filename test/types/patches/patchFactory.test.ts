import File from '../../../src/types/files/file.js';
import Options from '../../../src/types/options.js';
import PatchFactory from '../../../src/types/patches/patchFactory.js';

describe('patchFromFilename', () => {
  it('should do nothing if extension not found', async () => {
    const inputPatchFilePaths = await new Options({
      patch: ['./test/fixtures/roms'],
    }).scanPatchFilesWithoutExclusions();

    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < inputPatchFilePaths.length; i += 1) {
      const inputPatchFile = await File.fileOf(inputPatchFilePaths[i]);
      const patch = await PatchFactory.patchFromFilename(inputPatchFile);
      expect(patch).toBeUndefined();
    }
  });

  it('should process patch files', async () => {
    const inputPatchFilePaths = await new Options({
      patch: ['./test/fixtures/patches'],
    }).scanPatchFilesWithoutExclusions();

    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < inputPatchFilePaths.length; i += 1) {
      const inputPatchFile = await File.fileOf(inputPatchFilePaths[i]);
      const patch = await PatchFactory.patchFromFilename(inputPatchFile);
      expect(patch).toBeDefined();
    }
  });
});

describe('patchFromFileContents', () => {
  it('should do nothing if header not recognized', async () => {
    const inputPatchFilePaths = await new Options({
      patch: ['./test/fixtures/roms'],
    }).scanPatchFilesWithoutExclusions();

    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < inputPatchFilePaths.length; i += 1) {
      const inputPatchFile = await File.fileOf(inputPatchFilePaths[i]);
      const patch = await PatchFactory.patchFromFileContents(inputPatchFile);
      expect(patch).toBeUndefined();
    }
  });

  it('should process patch files', async () => {
    const inputPatchFilePaths = await new Options({
      patch: ['./test/fixtures/patches'],
    }).scanPatchFilesWithoutExclusions();

    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < inputPatchFilePaths.length; i += 1) {
      const inputPatchFile = await File.fileOf(inputPatchFilePaths[i]);
      const patch = await PatchFactory.patchFromFileContents(inputPatchFile);
      expect(patch).toBeDefined();
    }
  });
});
