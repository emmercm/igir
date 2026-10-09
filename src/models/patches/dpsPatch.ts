import IgirException from '../../exceptions/igirException.js';
import IOFile from '../../models/files/ioFile.js';
import type { FsReadCallback } from '../../streams/fsReadTransform.js';
import FsUtil from '../../utils/fsUtil.js';
import type File from '../files/file.js';
import Patch from './patch.js';

/**
 * A record that copies {@link length} bytes from the original ROM (mode 0), or from data enclosed
 * in the patch (mode 1), to {@link outputOffset}.
 */
type DPSRecord =
  | { outputOffset: number; length: number; inputOffset: number }
  | { outputOffset: number; length: number; dataPosition: number };

/**
 * @see http://deufeufeu.free.fr/wiki/index.php?title=DPS (original, dead)
 * @see https://github.com/btimofeev/UniPatcher/wiki/DPS
 */
export default class DPSPatch extends Patch {
  static readonly SUPPORTED_EXTENSIONS = ['.dps'];

  /**
   * Parse a .dps patch file and return a {@link DPSPatch}.
   */
  static patchFrom(file: File): DPSPatch {
    const crcBefore = super.getCrcFromPath(file.getExtractedFilePath());
    return new DPSPatch(file, crcBefore);
  }

  /**
   * Apply this patch to the input ROM file and write the patched result to the output path.
   */
  async createPatchedFile(
    inputRomFile: File,
    outputRomPath: string,
    callback?: FsReadCallback,
  ): Promise<void> {
    await this.getFile().extractToIOFile(async (patchFile) => {
      patchFile.skipNext(64); // patch name
      patchFile.skipNext(64); // patch author
      patchFile.skipNext(64); // patch version
      patchFile.skipNext(1); // patch flag
      patchFile.skipNext(1); // DPS version

      const originalSize = (await patchFile.readNext(4)).readUInt32LE();
      if (inputRomFile.getSize() !== originalSize) {
        throw new IgirException(
          `DPS patch expected ROM size of ${FsUtil.sizeReadable(originalSize)}: ${this.getFile().toString()}`,
        );
      }

      await DPSPatch.writeOutputFile(inputRomFile, outputRomPath, patchFile, callback);
    });
  }

  private static async writeOutputFile(
    inputRomFile: File,
    outputRomPath: string,
    patchFile: IOFile,
    callback?: FsReadCallback,
  ): Promise<void> {
    await inputRomFile.extractToIOFile(async (sourceFile) => {
      // The output only contains what the records write, so size it to the furthest record's end
      const recordsPosition = patchFile.getPosition();
      const outputSize = await this.calculateOutputSize(patchFile);
      patchFile.seek(recordsPosition);
      const targetFile = await IOFile.fileFrom(outputRomPath, 'w+', outputSize);

      try {
        await this.applyPatch(patchFile, sourceFile, targetFile, callback);
        // Zero-fill any gap the records left at the end
        await targetFile.truncate(outputSize);
      } finally {
        await targetFile.close();
      }
    });
  }

  private static async calculateOutputSize(patchFile: IOFile): Promise<number> {
    let outputSize = 0;
    while (patchFile.getPosition() < patchFile.getSize()) {
      const record = await this.readRecord(patchFile);
      outputSize = Math.max(outputSize, record.outputOffset + record.length);
    }
    return outputSize;
  }

  private static async applyPatch(
    patchFile: IOFile,
    sourceFile: IOFile,
    targetFile: IOFile,
    callback?: FsReadCallback,
  ): Promise<void> {
    while (patchFile.getPosition() < patchFile.getSize()) {
      const record = await this.readRecord(patchFile);
      const data =
        'inputOffset' in record
          ? await sourceFile.readAt(record.inputOffset, record.length)
          : await patchFile.readAt(record.dataPosition, record.length);
      await targetFile.writeAt(data, record.outputOffset);

      if (callback === undefined) {
        continue;
      }
      const progressPercentage = patchFile.getPosition() / patchFile.getSize();
      callback(Math.floor(progressPercentage * sourceFile.getSize()));
    }
  }

  /**
   * Read the next record, leaving the patch file positioned at the record after it.
   */
  private static async readRecord(patchFile: IOFile): Promise<DPSRecord> {
    const mode = (await patchFile.readNext(1)).readUInt8();
    const outputOffset = (await patchFile.readNext(4)).readUInt32LE();

    if (mode === 0) {
      const inputOffset = (await patchFile.readNext(4)).readUInt32LE();
      const length = (await patchFile.readNext(4)).readUInt32LE();
      return { outputOffset, length, inputOffset };
    }
    if (mode === 1) {
      const length = (await patchFile.readNext(4)).readUInt32LE();
      const dataPosition = patchFile.getPosition();
      patchFile.skipNext(length);
      return { outputOffset, length, dataPosition };
    }
    throw new IgirException(
      `DPS patch mode type ${mode} isn't supported: ${patchFile.getPathLike().toString()}`,
    );
  }
}
