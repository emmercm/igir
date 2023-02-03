import FilePoly from '../../polyfill/filePoly.js';
import File from '../files/file.js';
import Patch from './patch.js';

enum NinjaCommand {
  TERMINATE = 0x00,
  OPEN = 0x01,
  XOR = 0x02,
}

enum NinjaFileType {
  RAW = 0,
  NES = 1,
  FDS = 2,
  SNES = 3,
  N64 = 4,
  GB = 5,
  SMS = 6,
  MEGA = 7,
  PCE = 8,
  LYNX = 9,
}

/**
 * @link https://www.romhacking.net/utilities/329/
 */
export default class NinjaPatch extends Patch {
  static readonly SUPPORTED_EXTENSIONS = ['.rup'];

  static readonly FILE_SIGNATURE = Buffer.from('NINJA');

  static patchFrom(file: File): NinjaPatch {
    const crcBefore = Patch.getCrcFromPath(file.getExtractedFilePath());
    return new NinjaPatch(file, crcBefore);
  }

  async applyToTempFile<T>(
    inputRomFile: File,
    callback: (tempFile: string) => (Promise<T> | T),
  ): Promise<T> {
    return this.getFile().extractToFilePoly('r', async (patchFile) => {
      const header = await patchFile.readNext(5);
      if (!header.equals(NinjaPatch.FILE_SIGNATURE)) {
        await patchFile.close();
        throw new Error(`NINJA patch header is invalid: ${this.getFile().toString()}`);
      }
      const version = parseInt((await patchFile.readNext(1)).toString(), 10);
      if (version !== 2) {
        await patchFile.close();
        throw new Error(`NINJA v${version} isn't supported: ${this.getFile().toString()}`);
      }

      patchFile.skipNext(1); // encoding
      patchFile.skipNext(84); // author
      patchFile.skipNext(11); // version
      patchFile.skipNext(256); // title
      patchFile.skipNext(48); // genre
      patchFile.skipNext(48); // language
      patchFile.skipNext(8); // date
      patchFile.skipNext(512); // website
      patchFile.skipNext(1074); // info

      return this.writeOutputFile(inputRomFile, patchFile, callback);
    });
  }

  private async writeOutputFile<T>(
    inputRomFile: File,
    patchFile: FilePoly,
    callback: (tempFile: string) => (Promise<T> | T),
  ): Promise<T> {
    return inputRomFile.copyToTempFile(async (tempRomFile) => {
      const targetFile = await FilePoly.fileFrom(tempRomFile, 'r+');

      try {
        /* eslint-disable no-await-in-loop */
        while (!patchFile.isEOF()) {
          await this.applyCommand(patchFile, targetFile);
        }
      } finally {
        await targetFile.close();
      }

      return callback(tempRomFile);
    });
  }

  private async applyCommand(patchFile: FilePoly, targetFile: FilePoly): Promise<void> {
    const command = (await patchFile.readNext(1)).readUint8();

    if (command === NinjaCommand.TERMINATE) {
      // Nothing
    } else if (command === NinjaCommand.OPEN) {
      await this.applyCommandOpen(patchFile, targetFile);
    } else if (command === NinjaCommand.XOR) {
      await NinjaPatch.applyCommandXor(patchFile, targetFile);
    }
  }

  private async applyCommandOpen(patchFile: FilePoly, targetFile: FilePoly): Promise<void> {
    const multiFile = (await patchFile.readNext(1)).readUint8();
    if (multiFile > 0) {
      throw new Error(`Multi-file NINJA patches aren't supported: ${this.getFile().toString()}`);
    }

    const fileNameLength = multiFile > 0
      ? (await patchFile.readNext(multiFile)).readUIntLE(0, multiFile)
      : 0;
    patchFile.skipNext(fileNameLength); // file name
    const fileType = (await patchFile.readNext(1)).readUint8();
    if (fileType > 0) {
      throw new Error(`Unsupported NINJA file type ${NinjaFileType[fileType]}: ${this.getFile().toString()}`);
    }
    const sourceFileSizeLength = (await patchFile.readNext(1)).readUint8();
    const sourceFileSize = (await patchFile.readNext(sourceFileSizeLength))
      .readUIntLE(0, sourceFileSizeLength);
    const modifiedFileSizeLength = (await patchFile.readNext(1)).readUint8();
    const modifiedFileSize = (await patchFile.readNext(modifiedFileSizeLength))
      .readUIntLE(0, modifiedFileSizeLength);
    patchFile.skipNext(16); // source MD5
    patchFile.skipNext(16); // modified MD5

    if (sourceFileSize !== modifiedFileSize) {
      patchFile.skipNext(1); // "M" or "A"
      const overflowSizeLength = (await patchFile.readNext(1)).readUint8();
      const overflowSize = overflowSizeLength > 0
        ? (await patchFile.readNext(overflowSizeLength)).readUIntLE(0, overflowSizeLength)
        : 0;
      const overflow = overflowSize > 0
        ? await patchFile.readNext(overflowSize)
        : Buffer.alloc(overflowSize);
      /* eslint-disable no-bitwise */
      for (let i = 0; i < overflow.length; i += 1) {
        overflow[i] ^= 255; // NOTE(cemmer): this isn't documented anywhere
      }
      if (modifiedFileSize > sourceFileSize) {
        await targetFile.writeAt(overflow, targetFile.getSize());
      }
    }
  }

  private static async applyCommandXor(patchFile: FilePoly, targetFile: FilePoly): Promise<void> {
    const offsetLength = (await patchFile.readNext(1)).readUint8();
    const offset = (await patchFile.readNext(offsetLength)).readUIntLE(0, offsetLength);
    targetFile.seek(offset);

    const lengthLength = (await patchFile.readNext(1)).readUint8();
    const length = (await patchFile.readNext(lengthLength)).readUIntLE(0, lengthLength);
    const sourceData = await targetFile.readNext(length);

    const xorData = await patchFile.readNext(length);
    const targetData = Buffer.allocUnsafe(length);
    /* eslint-disable no-bitwise */
    for (let i = 0; i < length; i += 1) {
      targetData[i] = (i < sourceData.length ? sourceData[i] : 0x00) ^ xorData[i];
    }
    await targetFile.writeAt(targetData, offset);
  }
}
