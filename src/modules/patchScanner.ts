import type MappableSemaphore from '../async/mappableSemaphore.js';
import type ProgressBar from '../console/progressBar.js';
import { ProgressBarSymbol } from '../console/progressBar.js';
import type FileFactory from '../factories/fileFactory.js';
import PatchFactory from '../factories/patchFactory.js';
import type File from '../models/files/file.js';
import { ChecksumBitmask } from '../models/files/fileChecksums.js';
import type Options from '../models/options.js';
import type Patch from '../models/patches/patch.js';
import FsUtil from '../utils/fsUtil.js';
import IntlUtil from '../utils/intlUtil.js';
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
    this.prefixedLogger.trace('scanning patch files');
    this.progressBar.setSymbol(ProgressBarSymbol.FILE_SCANNING);
    this.progressBar.resetProgress(0);

    const patchFilePaths = await this.options.scanPatchFilesWithoutExclusions((increment) => {
      this.progressBar.incrementTotal(increment);
    });
    this.prefixedLogger.trace(
      `found ${IntlUtil.toLocaleString(patchFilePaths.length)} patch file${patchFilePaths.length === 1 ? '' : 's'}`,
    );
    this.progressBar.resetProgress(patchFilePaths.length);

    const patchFiles = await this.getUniqueFilesFromPaths(patchFilePaths, ChecksumBitmask.CRC32);
    this.progressBar.resetProgress(patchFiles.length);

    const patches = await this.parsePatchFiles(patchFiles);
    patches.forEach((patch) => {
      if (patch.getCrcBefore() === '00000000') {
        this.prefixedLogger.warn(`${patch.toString()}: couldn't parse base file CRC`);
      }
    });

    this.prefixedLogger.trace('done scanning patch files');
    return patches;
  }

  private async parsePatchFiles(patchFiles: File[]): Promise<Patch[]> {
    this.prefixedLogger.trace(
      `parsing ${IntlUtil.toLocaleString(patchFiles.length)} patch file${patchFiles.length === 1 ? '' : 's'}`,
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
          progressFormatter: FsUtil.sizeReadable.bind(FsUtil),
        });
        try {
          return await this.patchFromFile(patchFile);
        } catch (error) {
          this.prefixedLogger.warn(`${patchFile.toString()}: failed to parse patch: ${error}`);
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
      this.prefixedLogger.trace(
        `${patchForFilename.toString()}: found ${patchForFilename.constructor.name} from patch filename extension`,
      );
      return patchForFilename;
    }

    const patchForFileContents = await PatchFactory.patchFromFileContents(file);
    if (patchForFileContents) {
      this.prefixedLogger.trace(
        `${patchForFileContents.toString()}: found ${patchForFileContents.constructor.name} from patch file contents`,
      );
      return patchForFileContents;
    }

    this.prefixedLogger.trace(`${file.toString()}: is not a known patch file`);
    return undefined;
  }
}
