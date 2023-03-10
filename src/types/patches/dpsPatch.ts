import FilePoly from '../../polyfill/filePoly.js';
import fsPoly from '../../polyfill/fsPoly.js';
import File from '../files/file.js';
import Patch from './patch.js';

/**
 * @see http://deufeufeu.free.fr/wiki/index.php?title=DPS (original, dead)
 * @see https://github.com/btimofeev/UniPatcher/wiki/DPS
 */
export default class DPSPatch extends Patch {
  static readonly SUPPORTED_EXTENSIONS = ['.dps'];

  static patchFrom(file: File): DPSPatch {
    const crcBefore = Patch.getCrcFromPath(file.getExtractedFilePath());
    return new DPSPatch(file, crcBefore);
  }

  async createPatchedFile(inputRomFile: File, outputRomPath: string): Promise<void> {
    return this.getFile().extractToTempFilePoly('r', async (patchFile) => {
      patchFile.skipNext(64); // patch name
      patchFile.skipNext(64); // patch author
      patchFile.skipNext(64); // patch version
      patchFile.skipNext(1); // patch flag
      patchFile.skipNext(1); // DPS version

      const originalSize = (await patchFile.readNext(4)).readUInt32LE();
      if (inputRomFile.getSize() !== originalSize) {
        throw new Error(`DPS patch expected ROM size of ${fsPoly.sizeReadable(originalSize)}: ${this.getFile().toString()}`);
      }

      return DPSPatch.writeOutputFile(inputRomFile, outputRomPath, patchFile);
    });
  }

  private static async writeOutputFile(
    inputRomFile: File,
    outputRomPath: string,
    patchFile: FilePoly,
  ): Promise<void> {
    return inputRomFile.extractToTempFile(async (tempRomFile) => {
      const sourceFile = await FilePoly.fileFrom(tempRomFile, 'r');

      await fsPoly.copyFile(tempRomFile, outputRomPath);
      const targetFile = await FilePoly.fileFrom(outputRomPath, 'r+');

      try {
        await DPSPatch.applyPatch(patchFile, sourceFile, targetFile);
      } finally {
        await targetFile.close();
        await sourceFile.close();
      }
    });
  }

  private static async applyPatch(
    patchFile: FilePoly,
    sourceFile: FilePoly,
    targetFile: FilePoly,
  ): Promise<void> {
    /* eslint-disable no-await-in-loop, no-bitwise */
    while (patchFile.getPosition() < patchFile.getSize()) {
      const mode = (await patchFile.readNext(1)).readUInt8();
      const outputOffset = (await patchFile.readNext(4)).readUInt32LE();

      let data: Buffer;
      if (mode === 0) {
        const inputOffset = (await patchFile.readNext(4)).readUInt32LE();
        const inputLength = (await patchFile.readNext(4)).readUInt32LE();
        data = await sourceFile.readAt(inputOffset, inputLength);
      } else if (mode === 1) {
        const dataLength = (await patchFile.readNext(4)).readUInt32LE();
        data = await patchFile.readNext(dataLength);
      } else {
        throw new Error(`DPS patch mode type ${mode} isn't supported: ${patchFile.getPathLike()}`);
      }

      await targetFile.writeAt(data, outputOffset);
    }
  }
}
