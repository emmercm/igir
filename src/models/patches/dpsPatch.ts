import IgirException from '../../exceptions/igirException.js';
import IOFile from '../../models/files/ioFile.js';
import type { FsReadCallback } from '../../streams/fsReadTransform.js';
import FsUtil from '../../utils/fsUtil.js';
import type File from '../files/file.js';
import Patch from './patch.js';

/**
 * A record that copies {@link length} bytes from the original ROM (mode 0), or from data enclosed
 * in the patch right after the record (mode 1), to {@link outputOffset}.
 */
type DPSRecord =
  | { outputOffset: number; length: number; inputOffset: number }
  | { outputOffset: number; length: number };

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
    await this.getFile().extractToIOFile(async (patchIOFile) => {
      patchIOFile.skipNext(64); // patch name
      patchIOFile.skipNext(64); // patch author
      patchIOFile.skipNext(64); // patch version
      patchIOFile.skipNext(1); // patch flag
      patchIOFile.skipNext(1); // DPS version

      const originalSize = (await patchIOFile.readNext(4)).readUInt32LE();
      if (inputRomFile.getSize() !== originalSize) {
        throw new IgirException(
          `DPS patch expected ROM size of ${FsUtil.sizeReadable(originalSize)}: ${this.getFile().toString()}`,
        );
      }

      await DPSPatch.writeOutputFile(inputRomFile, outputRomPath, patchIOFile, callback);
    });
  }

  private static async writeOutputFile(
    inputRomFile: File,
    outputRomPath: string,
    patchIOFile: IOFile,
    callback?: FsReadCallback,
  ): Promise<void> {
    await inputRomFile.extractToIOFile(async (sourceIOFile) => {
      // The output only contains what the records write, so size it to the furthest record's end
      const recordsPosition = patchIOFile.getPosition();
      const outputSize = await this.calculateOutputSize(patchIOFile);
      patchIOFile.seek(recordsPosition);
      const targetIOFile = await IOFile.fileFrom(outputRomPath, 'w+', outputSize);

      try {
        await this.applyPatch(patchIOFile, sourceIOFile, targetIOFile, callback);
        // Zero-fill any gap the records left at the end
        await targetIOFile.truncate(outputSize);
      } finally {
        await targetIOFile.close();
      }
    });
  }

  private static async calculateOutputSize(patchIOFile: IOFile): Promise<number> {
    let outputSize = 0;
    while (!patchIOFile.isEOF()) {
      const record = await this.readRecord(patchIOFile);
      if (!('inputOffset' in record)) {
        patchIOFile.skipNext(record.length);
      }
      outputSize = Math.max(outputSize, record.outputOffset + record.length);
    }
    return outputSize;
  }

  private static async applyPatch(
    patchIOFile: IOFile,
    sourceIOFile: IOFile,
    targetIOFile: IOFile,
    callback?: FsReadCallback,
  ): Promise<void> {
    while (!patchIOFile.isEOF()) {
      const record = await this.readRecord(patchIOFile);
      if ('inputOffset' in record) {
        await sourceIOFile.copyRange(
          targetIOFile,
          record.outputOffset,
          record.inputOffset,
          record.inputOffset + record.length,
        );
      } else {
        await patchIOFile.copyNext(targetIOFile, record.outputOffset, record.length);
      }

      if (callback === undefined) {
        continue;
      }
      const progressPercentage = patchIOFile.getPosition() / patchIOFile.getSize();
      callback(Math.floor(progressPercentage * sourceIOFile.getSize()));
    }
  }

  /**
   * Read the next record's header, leaving the patch positioned at the record's enclosed data
   * (mode 1), or at the record after it (mode 0).
   */
  private static async readRecord(patchIOFile: IOFile): Promise<DPSRecord> {
    const mode = (await patchIOFile.readNext(1)).readUInt8();
    const outputOffset = (await patchIOFile.readNext(4)).readUInt32LE();

    if (mode === 0) {
      const inputOffset = (await patchIOFile.readNext(4)).readUInt32LE();
      const length = (await patchIOFile.readNext(4)).readUInt32LE();
      return { outputOffset, length, inputOffset };
    }
    if (mode === 1) {
      const length = (await patchIOFile.readNext(4)).readUInt32LE();
      return { outputOffset, length };
    }
    throw new IgirException(
      `DPS patch mode type ${mode} isn't supported: ${patchIOFile.getPathLike().toString()}`,
    );
  }
}
