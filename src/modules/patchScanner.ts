import async, { AsyncResultCallback } from 'async';

import ProgressBar, { ProgressBarSymbol } from '../console/progressBar.js';
import Constants from '../constants.js';
import ArrayPoly from '../polyfill/arrayPoly.js';
import File from '../types/files/file.js';
import Options from '../types/options.js';
import Patch from '../types/patches/patch.js';
import PatchFactory from '../types/patches/patchFactory.js';
import Scanner from './scanner.js';

/**
 * Scan for {@link Patch}es and parse them into the correct supported type.
 *
 * This class will not be run concurrently with any other class.
 */
export default class PatchScanner extends Scanner {
  constructor(options: Options, progressBar: ProgressBar) {
    super(options, progressBar, PatchScanner.name);
  }

  /**
   * Scan & process {@link Patch}es.
   */
  async scan(): Promise<Patch[]> {
    this.progressBar.logInfo('scanning patch files');

    await this.progressBar.setSymbol(ProgressBarSymbol.SEARCHING);
    await this.progressBar.reset(0);

    const patchFilePaths = await this.options.scanPatchFilesWithoutExclusions(async (increment) => {
      await this.progressBar.incrementTotal(increment);
    });
    this.progressBar.logDebug(`found ${patchFilePaths.length.toLocaleString()} patch file${patchFilePaths.length !== 1 ? 's' : ''}`);
    await this.progressBar.reset(patchFilePaths.length);

    const files = await this.getFilesFromPaths(
      patchFilePaths,
      Constants.PATCH_SCANNER_THREADS,
    );

    const patches = (await async.mapLimit(
      files,
      Constants.PATCH_SCANNER_THREADS,
      async (file, callback: AsyncResultCallback<Patch | undefined, Error>) => {
        await using disposableStack = new AsyncDisposableStack();

        await this.progressBar.incrementProgress();
        disposableStack.defer(async () => this.progressBar.incrementDone());

        const waitingMessage = `${file.toString()} ...`;
        this.progressBar.addWaitingMessage(waitingMessage);
        disposableStack.defer(() => this.progressBar.removeWaitingMessage(waitingMessage));

        try {
          const patch = await this.patchFromFile(file);
          callback(null, patch);
        } catch (e) {
          this.progressBar.logWarn(`${file.toString()}: failed to parse patch: ${e}`);
          callback(null, undefined);
        }
      },
    )).filter(ArrayPoly.filterNotNullish);

    this.progressBar.logInfo('done scanning patch files');
    return patches;
  }

  private async patchFromFile(file: File): Promise<Patch | undefined> {
    const patchForFilename = await PatchFactory.patchFromFilename(file);
    if (patchForFilename) {
      this.progressBar.logTrace(`${file.toString()}: found patch by extension: ${typeof patchForFilename}`);
      return patchForFilename;
    }

    const patchForFileContents = await PatchFactory.patchFromFileContents(file);
    if (patchForFileContents) {
      this.progressBar.logTrace(`${file.toString()}: found patch by contents: ${typeof patchForFileContents}`);
      return patchForFileContents;
    }

    return undefined;
  }
}
