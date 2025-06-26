import DriveSemaphore from '../async/driveSemaphore.js';
import ProgressBar, { ProgressBarSymbol } from '../console/progressBar.js';
import File from '../types/files/file.js';
import { ChecksumBitmask } from '../types/files/fileChecksums.js';
import FileFactory from '../types/files/fileFactory.js';
import Options from '../types/options.js';
import Patch from '../types/patches/patch.js';
import PatchFactory from '../types/patches/patchFactory.js';
import Scanner from './scanner.js';

/**
 * Scan for {@link Patch}es and parse them into the correct supported type.
 */
export default class PatchScanner extends Scanner {
  constructor(
    options: Options,
    progressBar: ProgressBar,
    fileFactory: FileFactory,
    driveSemaphore: DriveSemaphore,
  ) {
    super(options, progressBar, fileFactory, driveSemaphore, PatchScanner.name);
  }

  /**
   * Scan & process {@link Patch}es.
   */
  async scan(): Promise<Patch[]> {
    this.progressBar.logTrace('scanning patch files');
    this.progressBar.setSymbol(ProgressBarSymbol.FILE_SCANNING);
    this.progressBar.resetProgress(0);

    const patchFilePaths = await this.options.scanPatchFilesWithoutExclusions((increment) => {
      this.progressBar.incrementTotal(increment);
    });
    this.progressBar.logTrace(
      `found ${patchFilePaths.length.toLocaleString()} patch file${patchFilePaths.length === 1 ? '' : 's'}`,
    );
    this.progressBar.resetProgress(patchFilePaths.length);

    const patchFiles = await this.getUniqueFilesFromPaths(patchFilePaths, ChecksumBitmask.CRC32);
    this.progressBar.resetProgress(patchFiles.length);

    const patches = (
      await this.driveSemaphore.map(patchFiles, async (patchFile) => {
        this.progressBar.incrementInProgress();

        const childBar = this.progressBar.addChildBar({
          name: patchFile.toString(),
        });
        try {
          return await this.patchFromFile(patchFile);
        } catch (error) {
          this.progressBar.logWarn(`${patchFile.toString()}: failed to parse patch: ${error}`);
          return undefined;
        } finally {
          childBar.delete();
          this.progressBar.incrementCompleted();
        }
      })
    ).filter((patch) => patch !== undefined);

    this.progressBar.logTrace('done scanning patch files');
    return patches;
  }

  private async patchFromFile(file: File): Promise<Patch | undefined> {
    const patchForFilename = await PatchFactory.patchFromFilename(file);
    if (patchForFilename) {
      this.progressBar.logTrace(
        `${file.toString()}: found patch by extension: ${typeof patchForFilename}`,
      );
      return patchForFilename;
    }

    const patchForFileContents = await PatchFactory.patchFromFileContents(file);
    if (patchForFileContents) {
      this.progressBar.logTrace(
        `${file.toString()}: found patch by contents: ${typeof patchForFileContents}`,
      );
      return patchForFileContents;
    }

    return undefined;
  }
}
