import IgirException from '../../exceptions/igirException.js';
import IOFile from '../../models/files/ioFile.js';
import type { FsReadCallback } from '../../streams/fsReadTransform.js';
import FsUtil from '../../utils/fsUtil.js';
import type File from '../files/file.js';
import Patch from './patch.js';

/**
 * @see https://github.com/btimofeev/UniPatcher/wiki/APS-(GBA)
 * @see https://github.com/Gamer2020/Unofficial-A-ptch
 */
export default class APSGBAPatch extends Patch {
  static readonly FILE_SIGNATURE = Buffer.from('APS1');

  /**
   * Parse a GBA-format .aps patch file and return an {@link APSGBAPatch}.
   */
  static async patchFrom(file: File): Promise<APSGBAPatch> {
    const crcBefore = super.getCrcFromPath(file.getExtractedFilePath());
    let targetSize = 0;

    await file.extractToIOFile(async (patchIOFile) => {
      patchIOFile.seek(this.FILE_SIGNATURE.length);
      patchIOFile.skipNext(4); // original file size
      targetSize = (await patchIOFile.readNext(4)).readUInt32LE();
    });

    return new APSGBAPatch(file, crcBefore, undefined, targetSize);
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
      const header = await patchIOFile.readNext(APSGBAPatch.FILE_SIGNATURE.length);
      if (!header.equals(APSGBAPatch.FILE_SIGNATURE)) {
        throw new IgirException(`APS (GBA) patch header is invalid: ${this.getFile().toString()}`);
      }

      const originalSize = (await patchIOFile.readNext(4)).readUInt32LE();
      if (inputRomFile.getSize() !== originalSize) {
        throw new IgirException(
          `APS (GBA) patch expected ROM size of ${FsUtil.sizeReadable(originalSize)}: ${this.getFile().toString()}`,
        );
      }

      const targetSize = (await patchIOFile.readNext(4)).readUInt32LE();

      await APSGBAPatch.writeOutputFile(
        inputRomFile,
        outputRomPath,
        patchIOFile,
        targetSize,
        callback,
      );
    });
  }

  private static async writeOutputFile(
    inputRomFile: File,
    outputRomPath: string,
    patchIOFile: IOFile,
    targetSize: number,
    callback?: FsReadCallback,
  ): Promise<void> {
    await inputRomFile.extractToFile(outputRomPath);
    await inputRomFile.extractToIOFile(async (sourceIOFile) => {
      const targetIOFile = await IOFile.fileFrom(outputRomPath, 'r+');
      try {
        await this.applyPatch(patchIOFile, sourceIOFile, targetIOFile, callback);
        await targetIOFile.truncate(targetSize);
      } finally {
        await targetIOFile.close();
      }
    });
  }

  private static async applyPatch(
    patchIOFile: IOFile,
    sourceIOFile: IOFile,
    targetIOFile: IOFile,
    callback?: FsReadCallback,
  ): Promise<void> {
    while (patchIOFile.getPosition() < patchIOFile.getSize()) {
      const offset = (await patchIOFile.readNext(4)).readUInt32LE();
      patchIOFile.skipNext(2); // CRC16 of original 64KiB block
      patchIOFile.skipNext(2); // CRC16 of patched 64KiB block
      const xorData = await patchIOFile.readNext(64 * 1024);

      const sourceData = await sourceIOFile.readAt(offset, xorData.length);
      // Bytes past the end of the source are 0x00, so they're left as the XOR data
      for (const [i, sourceDatum] of sourceData.entries()) {
        xorData[i] ^= sourceDatum;
      }
      await targetIOFile.writeAt(xorData, offset);

      if (callback === undefined) {
        continue;
      }
      const progressPercentage = patchIOFile.getPosition() / patchIOFile.getSize();
      callback(Math.floor(progressPercentage * targetIOFile.getSize()));
    }
  }
}
