import async, { AsyncResultCallback } from 'async';

import ProgressBar, { ProgressBarSymbol } from '../console/progressBar.js';
import Constants from '../constants.js';
import File from '../types/files/file.js';
import Options from '../types/options.js';
import Patch from '../types/patches/patch.js';
import PatchFactory from '../types/patches/patchFactory.js';
import Scanner from './scanner.js';

export default class PatchScanner extends Scanner {
  constructor(options: Options, progressBar: ProgressBar) {
    super(options, progressBar, PatchScanner.name);
  }

  async scan(): Promise<Patch[]> {
    await this.progressBar.logInfo('Scanning patch files');

    await this.progressBar.setSymbol(ProgressBarSymbol.SEARCHING);
    await this.progressBar.reset(this.options.getPatchFileCount());

    const patchFilePaths = await this.options.scanPatchFiles();
    await this.progressBar.logDebug(`Found ${patchFilePaths.length} patch file${patchFilePaths.length !== 1 ? 's' : ''}`);
    await this.progressBar.reset(patchFilePaths.length);

    const files = await this.getFilesFromPaths(
      patchFilePaths,
      Constants.PATCH_SCANNER_THREADS,
    );

    const patches = (await async.mapLimit(
      files,
      Constants.PATCH_SCANNER_THREADS,
      async (file, callback: AsyncResultCallback<Patch, Error>) => {
        await this.progressBar.increment();

        try {
          const patch = await this.patchFromFile(file);
          callback(null, patch);
        } catch (e) {
          await this.progressBar.logWarn(`${file.toString()}: Failed to parse patch : ${e}`);
          callback(null, undefined);
        }
      },
    )).filter((patch) => patch);

    await this.progressBar.doneItems(patches.length, 'unique patch', 'found');

    await this.progressBar.logInfo('Done scanning patch files');
    return patches;
  }

  private async patchFromFile(file: File): Promise<Patch | undefined> {
    const patchForFilename = await PatchFactory.patchFromFilename(file);
    if (patchForFilename) {
      await this.progressBar.logTrace(`${file.toString()}: found patch by extension: ${typeof patchForFilename}`);
      return patchForFilename;
    }

    const patchForFileContents = await PatchFactory.patchFromFileContents(file);
    if (patchForFileContents) {
      await this.progressBar.logTrace(`${file.toString()}: found patch by contents: ${typeof patchForFileContents}`);
      return patchForFileContents;
    }

    return undefined;
  }
}
