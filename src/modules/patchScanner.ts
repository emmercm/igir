import type MappableSemaphore from '../async/mappableSemaphore.js';
import type ProgressBar from '../console/progressBar.js';
import { ProgressBarSymbol } from '../console/progressBar.js';
import FsPoly from '../polyfill/fsPoly.js';
import IntlPoly from '../polyfill/intlPoly.js';
import type File from '../types/files/file.js';
import { ChecksumBitmask } from '../types/files/fileChecksums.js';
import type FileFactory from '../types/files/fileFactory.js';
import type Options from '../types/options.js';
import type Patch from '../types/patches/patch.js';
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
    mappableSemaphore: MappableSemaphore,
  ) {
    super(options, progressBar, fileFactory, mappableSemaphore, PatchScanner.name);
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
      `found ${IntlPoly.toLocaleString(patchFilePaths.length)} patch file${patchFilePaths.length === 1 ? '' : 's'}`,
    );
    this.progressBar.resetProgress(patchFilePaths.length);

    const patchFiles = await this.getUniqueFilesFromPaths(patchFilePaths, ChecksumBitmask.CRC32);
    this.progressBar.resetProgress(patchFiles.length);

    const patches = await this.parsePatchFiles(patchFiles);
    patches.forEach((patch) => {
      if (patch.getCrcBefore() === '00000000') {
        this.progressBar.logWarn(`failed to parse CRC32 for patch: ${patch.getFile().toString()}`);
      }
    });

    this.progressBar.logTrace('done scanning patch files');
    return patches;
  }

  private async parsePatchFiles(patchFiles: File[]): Promise<Patch[]> {
    this.progressBar.logTrace(
      `parsing ${IntlPoly.toLocaleString(patchFiles.length)} patch file${patchFiles.length === 1 ? '' : 's'}`,
    );
    if (patchFiles.length === 0) {
      return [];
    }
    this.progressBar.setName('Parsing patches');
    this.progressBar.setSymbol(ProgressBarSymbol.PATCH_PARSING);

    return (
      await this.mappableSemaphore.map(patchFiles, async (patchFile) => {
        this.progressBar.incrementInProgress();

        const childBar = this.progressBar.addChildBar({
          name: patchFile.toString(),
          total: patchFile.getSize(),
          progressFormatter: FsPoly.sizeReadable,
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
  }

  private async patchFromFile(file: File): Promise<Patch | undefined> {
    const patchForFilename = await PatchFactory.patchFromFilename(file);
    if (patchForFilename) {
      this.progressBar.logTrace(
        `${file.toString()}: found patch type by extension: ${patchForFilename.constructor.name}`,
      );
      return patchForFilename;
    }

    const patchForFileContents = await PatchFactory.patchFromFileContents(file);
    if (patchForFileContents) {
      this.progressBar.logTrace(
        `${file.toString()}: found patch type by contents: ${patchForFileContents.constructor.name}`,
      );
      return patchForFileContents;
    }

    return undefined;
  }
}
