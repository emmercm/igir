import IgirException from '../../exceptions/igirException.js';
import IOFile from '../../models/files/ioFile.js';
import type { FsReadCallback } from '../../streams/fsReadTransform.js';
import FsUtil from '../../utils/fsUtil.js';
import type File from '../files/file.js';
import Patch from './patch.js';

/**
 * The parsed header of a PPF (PlayStation Patch File), used to interpret the rest of the
 * patch body.
 */
class PPFHeader {
  static readonly FILE_SIGNATURE = Buffer.from('PPF');

  readonly version: number;

  readonly undoDataAvailable: boolean;

  constructor(version: number, undoDataAvailable: boolean) {
    this.version = version;
    this.undoDataAvailable = undoDataAvailable;
  }

  /**
   * Read and validate the PPF header from the patch file, advancing the read position past it.
   */
  static async fromIOFile(inputRomFile: File, patchFile: IOFile): Promise<PPFHeader> {
    const header = (await patchFile.readNext(5)).toString();
    if (!header.startsWith(this.FILE_SIGNATURE.toString())) {
      throw new IgirException(`PPF patch header is invalid: ${patchFile.getPathLike().toString()}`);
    }
    const encoding = (await patchFile.readNext(1)).readUInt8();
    const version = encoding + 1;
    if (!header.endsWith(`${version}0`)) {
      throw new IgirException(
        `PPF patch header has an invalid version: ${patchFile.getPathLike().toString()}`,
      );
    }
    patchFile.skipNext(50); // description

    let isBlockCheckEnabled: boolean;
    let isUndoDataAvailable = false;
    if (version === 2) {
      const sourceSize = (await patchFile.readNext(4)).readUInt32LE();
      if (inputRomFile.getSize() !== sourceSize) {
        throw new IgirException(
          `PPF patch expected ROM size of ${FsUtil.sizeReadable(sourceSize)}: ${patchFile.getPathLike().toString()}`,
        );
      }
      isBlockCheckEnabled = true;
    } else if (version === 3) {
      patchFile.skipNext(1); // image type
      isBlockCheckEnabled = (await patchFile.readNext(1)).readUInt8() === 0x01;
      isUndoDataAvailable = (await patchFile.readNext(1)).readUInt8() === 0x01;
      patchFile.skipNext(1); // dummy
    } else {
      throw new IgirException(
        `PPF v${version} isn't supported: ${patchFile.getPathLike().toString()}`,
      );
    }
    if (isBlockCheckEnabled) {
      patchFile.skipNext(1024);
    }

    return new PPFHeader(version, isUndoDataAvailable);
  }
}

/**
 * @see https://winningeleven-games.com/thread-9609-post-29416.html#pid29416
 * @see https://github.com/meunierd/ppf/blob/master/ppfdev/PPF3.txt
 */
export default class PPFPatch extends Patch {
  static readonly SUPPORTED_EXTENSIONS = ['.ppf'];

  static readonly FILE_SIGNATURE = PPFHeader.FILE_SIGNATURE;

  /**
   * Parse a .ppf patch file and return a {@link PPFPatch}.
   */
  static patchFrom(file: File): PPFPatch {
    const crcBefore = super.getCrcFromPath(file.getExtractedFilePath());
    return new PPFPatch(file, crcBefore);
  }

  /**
   * Apply this patch to the input ROM file and write the patched result to the output path.
   */
  async createPatchedFile(
    inputRomFile: File,
    outputRomPath: string,
    callback?: FsReadCallback,
  ): Promise<void> {
    await this.getFile().extractToTempIOFile('r', async (patchFile) => {
      const header = await PPFHeader.fromIOFile(inputRomFile, patchFile);

      await PPFPatch.writeOutputFile(inputRomFile, outputRomPath, patchFile, header, callback);
    });
  }

  private static async writeOutputFile(
    inputRomFile: File,
    outputRomPath: string,
    patchFile: IOFile,
    header: PPFHeader,
    callback?: FsReadCallback,
  ): Promise<void> {
    await inputRomFile.extractToFile(outputRomPath);
    const targetFile = await IOFile.fileFrom(outputRomPath, 'r+');

    try {
      while (!patchFile.isEOF()) {
        await this.applyPatchBlock(patchFile, targetFile, header);

        if (callback !== undefined) {
          const progressPercentage = patchFile.getPosition() / patchFile.getSize();
          callback(Math.floor(progressPercentage * targetFile.getSize()));
        }
      }
    } finally {
      await targetFile.close();
    }
  }

  private static async applyPatchBlock(
    patchFile: IOFile,
    targetFile: IOFile,
    header: PPFHeader,
  ): Promise<void> {
    const peek = (await patchFile.peekNext(18)).toString();
    if (!peek) {
      // End of file
      return;
    }
    if (peek === '@BEGIN_FILE_ID.DIZ') {
      // TODO(cemmer): handle?
      return;
    }

    let offset = 0;
    if (header.version === 2) {
      offset = (await patchFile.readNext(4)).readUInt32LE();
    } else if (header.version === 3) {
      offset =
        (await patchFile.readNext(4)).readUInt32LE() +
        (await patchFile.readNext(4)).readUInt32LE() * 0x1_00_00_00_00;
    }

    const bytesToChange = (await patchFile.readNext(1)).readUInt8();
    const data = await patchFile.readNext(bytesToChange);
    if (header.undoDataAvailable) {
      patchFile.skipNext(bytesToChange);
    }

    await targetFile.writeAt(data, offset);
  }
}
