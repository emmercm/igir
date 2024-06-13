import ProgressBar, { ProgressBarSymbol } from '../console/progressBar.js';
import DriveSemaphore from '../driveSemaphore.js';
import ArrayPoly from '../polyfill/arrayPoly.js';
import File from '../types/files/file.js';
import { ChecksumBitmask } from '../types/files/fileChecksums.js';
import Options from '../types/options.js';
import Patch from '../types/patches/patch.js';
import PatchFactory from '../types/patches/patchFactory.js';
import Scanner from './scanner.js';

/**
 * Scan for {@link Patch}es and parse them into the correct supported type.
 */
export default class PatchScanner extends Scanner {
  constructor(options: Options, progressBar: ProgressBar) {
    super(options, progressBar, PatchScanner.name);
  }

  /**
   * Scan & process {@link Patch}es.
   */
  async scan(): Promise<Patch[]> {
    this.progressBar.logTrace('scanning patch files');
    await this.progressBar.setSymbol(ProgressBarSymbol.SEARCHING);
    await this.progressBar.reset(0);

    const patchFilePaths = await this.options.scanPatchFilesWithoutExclusions(async (increment) => {
      await this.progressBar.incrementTotal(increment);
    });
    this.progressBar.logTrace(`found ${patchFilePaths.length.toLocaleString()} patch file${patchFilePaths.length !== 1 ? 's' : ''}`);
    await this.progressBar.reset(patchFilePaths.length);

    const files = await this.getUniqueFilesFromPaths(
      patchFilePaths,
      this.options.getReaderThreads(),
      ChecksumBitmask.NONE,
    );
    await this.progressBar.reset(files.length);

    const patches = (await new DriveSemaphore(this.options.getReaderThreads()).map(
      files,
      async (file) => {
        await this.progressBar.incrementProgress();
        const waitingMessage = `${file.toString()} ...`;
        this.progressBar.addWaitingMessage(waitingMessage);

        try {
          return await this.patchFromFile(file);
        } catch (error) {
          this.progressBar.logWarn(`${file.toString()}: failed to parse patch: ${error}`);
          return undefined;
        } finally {
          await this.progressBar.incrementDone();
          this.progressBar.removeWaitingMessage(waitingMessage);
        }
      },
    )).filter(ArrayPoly.filterNotNullish);

    this.progressBar.logTrace('done scanning patch files');
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
