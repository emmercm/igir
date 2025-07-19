import FsPoly from '../../polyfill/fsPoly.js';
import IOFile from '../../polyfill/ioFile.js';
import IgirException from '../exceptions/igirException.js';
import type File from '../files/file.js';
import Patch from './patch.js';

/**
 * @see https://github.com/btimofeev/UniPatcher/wiki/APS-(GBA)
 * @see https://github.com/Gamer2020/Unofficial-A-ptch
 */
export default class APSGBAPatch extends Patch {
  static readonly FILE_SIGNATURE = Buffer.from('APS1');

  static async patchFrom(file: File): Promise<APSGBAPatch> {
    const crcBefore = Patch.getCrcFromPath(file.getExtractedFilePath());
    let targetSize = 0;

    await file.extractToTempIOFile('r', async (patchFile) => {
      patchFile.seek(APSGBAPatch.FILE_SIGNATURE.length);
      patchFile.skipNext(4); // original file size
      targetSize = (await patchFile.readNext(4)).readUInt32LE();
    });

    return new APSGBAPatch(file, crcBefore, undefined, targetSize);
  }

  async createPatchedFile(inputRomFile: File, outputRomPath: string): Promise<void> {
    return this.getFile().extractToTempIOFile('r', async (patchFile) => {
      const header = await patchFile.readNext(APSGBAPatch.FILE_SIGNATURE.length);
      if (!header.equals(APSGBAPatch.FILE_SIGNATURE)) {
        throw new IgirException(`APS (GBA) patch header is invalid: ${this.getFile().toString()}`);
      }

      const originalSize = (await patchFile.readNext(4)).readUInt32LE();
      if (inputRomFile.getSize() !== originalSize) {
        throw new IgirException(
          `APS (GBA) patch expected ROM size of ${FsPoly.sizeReadable(originalSize)}: ${this.getFile().toString()}`,
        );
      }

      patchFile.skipNext(4); // patched size

      return APSGBAPatch.writeOutputFile(inputRomFile, outputRomPath, patchFile);
    });
  }

  private static async writeOutputFile(
    inputRomFile: File,
    outputRomPath: string,
    patchFile: IOFile,
  ): Promise<void> {
    return inputRomFile.extractToTempFile(async (tempRomFile) => {
      const sourceFile = await IOFile.fileFrom(tempRomFile, 'r');

      await FsPoly.copyFile(tempRomFile, outputRomPath);
      const targetFile = await IOFile.fileFrom(outputRomPath, 'r+');

      try {
        await APSGBAPatch.applyPatch(patchFile, sourceFile, targetFile);
      } finally {
        await targetFile.close();
        await sourceFile.close();
      }
    });
  }

  private static async applyPatch(
    patchFile: IOFile,
    sourceFile: IOFile,
    targetFile: IOFile,
  ): Promise<void> {
    while (patchFile.getPosition() < patchFile.getSize()) {
      const offset = (await patchFile.readNext(4)).readUInt32LE();
      patchFile.skipNext(2); // CRC16 of original 64KiB block
      patchFile.skipNext(2); // CRC16 of patched 64KiB block
      const xorData = await patchFile.readNext(1024 * 1024);

      const sourceData = await sourceFile.readAt(offset, xorData.length);
      const targetData = Buffer.allocUnsafe(xorData.length);
      for (const [idx, xorDatum] of xorData.entries()) {
        targetData[idx] = (idx < sourceData.length ? sourceData[idx] : 0x00) ^ xorDatum;
      }
      await targetFile.writeAt(targetData, offset);
    }
  }
}
