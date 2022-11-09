import { promises as fsPromises } from 'fs';
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
 * @link https://www.gamebrew.org/wiki/Upset
 */
export default class UPSPatch extends Patch {
  static readonly SUPPORTED_EXTENSIONS = ['.ups'];

  static async patchFrom(file: File): Promise<UPSPatch> {
    let crcBefore = '';
    let crcAfter = '';
    let targetSize = 0;

    await file.extractToFile(async (patchFile) => {
      const fp = await FilePoly.fileFrom(patchFile, 'r');

      fp.seek(4); // header
      await Patch.readVariableLengthNumber(fp); // source size
      targetSize = await Patch.readVariableLengthNumber(fp); // target size

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

  async apply<T>(file: File, callback: (tempFile: string) => (Promise<T> | T)): Promise<T> {
    return this.getFile().extractToFile(async (patchFilePath) => {
      const patchFile = await FilePoly.fileFrom(patchFilePath, 'r');

      const header = (await patchFile.readNext(4)).toString();
      if (header !== 'UPS1') {
        await patchFile.close();
        throw new Error(`UPS patch header is invalid: ${this.getFile().toString()}`);
      }
      await Patch.readVariableLengthNumber(patchFile); // source size
      await Patch.readVariableLengthNumber(patchFile); // target size

      const result = await file.extractToFile(async (sourceFilePath) => {
        const targetFilePath = fsPoly.mktempSync(path.join(
          Constants.GLOBAL_TEMP_DIR,
          `${path.basename(sourceFilePath)}.ups`,
        ));
        await fsPromises.copyFile(sourceFilePath, targetFilePath);
        const targetFile = await FilePoly.fileFrom(targetFilePath, 'r+');

        const sourceFile = await FilePoly.fileFrom(sourceFilePath, 'r');

        /* eslint-disable no-await-in-loop, no-bitwise */
        while (patchFile.getPosition() < patchFile.getSize() - 12) {
          const relativeOffset = await Patch.readVariableLengthNumber(patchFile);
          sourceFile.skipNext(relativeOffset);
          targetFile.skipNext(relativeOffset);

          while (patchFile.getPosition() < patchFile.getSize() - 12) {
            const xorByte = (await patchFile.readNext(1)).readUint8();
            if (!xorByte) { // terminating byte 0x00
              break;
            }

            const sourceByte = sourceFile.isEOF()
              ? 0x00
              : (await sourceFile.readNext(1)).readUint8();
            const targetByte = sourceByte ^ xorByte;
            await targetFile.write(Buffer.of(targetByte));
          }

          sourceFile.skipNext(1);
          targetFile.skipNext(1);
        }

        await targetFile.close();
        await sourceFile.close();

        const callbackResult = await callback(targetFilePath);
        await fsPoly.rm(targetFilePath);
        return callbackResult;
      });

      await patchFile.close();

      return result;
    });
  }
}
