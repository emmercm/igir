import path from 'path';

import Constants from '../../constants.js';
import FilePoly from '../../polyfill/filePoly.js';
import fsPoly from '../../polyfill/fsPoly.js';
import File from '../files/file.js';
import Patch from './patch.js';

/**
 * WARN(cemmer): because UPS patches use nul-byte termination for records rather than some kind of
 *  length identifier, which forces patchers to read both the UPS file and ROM file byte-by-byte,
 *  large patches can perform tremendously poorly if they contain many small records.
 *
 * @link https://www.romhacking.net/documents/392/
 * @link https://github.com/btimofeev/UniPatcher/wiki/UPS
 * @link https://www.gamebrew.org/wiki/Upset
 */
export default class UPSPatch extends Patch {
  static readonly SUPPORTED_EXTENSIONS = ['.ups'];

  static readonly FILE_SIGNATURE = Buffer.from('UPS1');

  static async patchFrom(file: File): Promise<UPSPatch> {
    let crcBefore = '';
    let crcAfter = '';
    let targetSize = 0;

    await file.extractToFile(async (patchFile) => {
      const fp = await FilePoly.fileFrom(patchFile, 'r');

      fp.seek(4); // header
      await Patch.readUpsUint(fp); // source size
      targetSize = await Patch.readUpsUint(fp); // target size

      fp.seek(fp.getSize() - 12);
      crcBefore = (await fp.readNext(4)).reverse().toString('hex');
      crcAfter = (await fp.readNext(4)).reverse().toString('hex');

      await fp.close();
    });

    if (crcBefore.length !== 8 || crcAfter.length !== 8) {
      throw new Error(`Couldn't parse base file CRC for patch: ${file.toString()}`);
    }

    return new UPSPatch(file, crcBefore, crcAfter, targetSize);
  }

  async apply<T>(inputFile: File, callback: (tempFile: string) => (Promise<T> | T)): Promise<T> {
    return this.getFile().extractToFilePoly('r', async (patchFile) => {
      const header = await patchFile.readNext(4);
      if (!header.equals(UPSPatch.FILE_SIGNATURE)) {
        await patchFile.close();
        throw new Error(`UPS patch header is invalid: ${this.getFile().toString()}`);
      }
      await Patch.readUpsUint(patchFile); // source size
      await Patch.readUpsUint(patchFile); // target size

      return UPSPatch.writeOutputFile(inputFile, callback, patchFile);
    });
  }

  private static async writeOutputFile<T>(
    inputFile: File,
    callback: (tempFile: string) => (Promise<T> | T),
    patchFile: FilePoly,
  ): Promise<T> {
    return inputFile.extractToFile(async (sourceFilePath) => {
      const sourceFile = await FilePoly.fileFrom(sourceFilePath, 'r');

      const targetFilePath = await fsPoly.mktemp(path.join(
        Constants.GLOBAL_TEMP_DIR,
        `${path.basename(sourceFilePath)}.ups`,
      ));
      await fsPoly.copyFile(sourceFilePath, targetFilePath);
      const targetFile = await FilePoly.fileFrom(targetFilePath, 'r+');

      try {
        await UPSPatch.applyPatch(patchFile, sourceFile, targetFile);
      } finally {
        await targetFile.close();
        await sourceFile.close();
      }

      const callbackResult = await callback(targetFilePath);
      await fsPoly.rm(targetFilePath);
      return callbackResult;
    });
  }

  private static async applyPatch(
    patchFile: FilePoly,
    sourceFile: FilePoly,
    targetFile: FilePoly,
  ): Promise<void> {
    /* eslint-disable no-await-in-loop, no-bitwise */
    while (patchFile.getPosition() < patchFile.getSize() - 12) {
      const relativeOffset = await Patch.readUpsUint(patchFile);
      sourceFile.skipNext(relativeOffset);
      targetFile.skipNext(relativeOffset);

      const data = await this.readPatchBlock(patchFile, sourceFile);
      await targetFile.write(data);

      sourceFile.skipNext(1);
      targetFile.skipNext(1);
    }
  }

  private static async readPatchBlock(
    patchFile: FilePoly,
    sourceFile: FilePoly,
  ): Promise<Buffer> {
    const buffer: Buffer[] = [];

    while (patchFile.getPosition() < patchFile.getSize() - 12) {
      const xorByte = (await patchFile.readNext(1)).readUint8();
      if (!xorByte) { // terminating byte 0x00
        return Buffer.concat(buffer);
      }

      const sourceByte = sourceFile.isEOF()
        ? 0x00
        : (await sourceFile.readNext(1)).readUint8();
      buffer.push(Buffer.of(sourceByte ^ xorByte));
    }

    throw new Error(`UPS patch failed to read 0x00 block termination: ${patchFile.getPathLike()}`);
  }
}
