import { promises as fsPromises } from 'fs';
import path from 'path';

import Constants from '../../constants.js';
import FilePoly from '../../polyfill/filePoly.js';
import fsPoly from '../../polyfill/fsPoly.js';
import File from '../files/file.js';
import Patch from './patch.js';

interface UPSRecord {
  relativeOffset: number,
  xorBytes: Buffer,
}

/**
 * @link https://www.romhacking.net/documents/392/
 * @link https://www.gamebrew.org/wiki/Upset
 */
export default class UPSPatch extends Patch {
  static readonly SUPPORTED_EXTENSIONS = ['.ups'];

  private readonly records: UPSRecord[] = [];

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

  async parsePatch(): Promise<void> {
    if (this.records.length) {
      return;
    }

    await this.getFile().extractToFile(async (patchFile) => {
      const fp = await FilePoly.fileFrom(patchFile, 'r');

      const header = (await fp.readNext(4)).toString();
      if (header !== 'UPS1') {
        throw new Error(`UPS patch header is invalid: ${this.getFile().toString()}`);
      }
      await Patch.readVariableLengthNumber(fp); // source size
      await Patch.readVariableLengthNumber(fp); // target size

      /* eslint-disable no-await-in-loop */
      while (fp.getPosition() < fp.getSize() - 12) {
        const offset = await Patch.readVariableLengthNumber(fp);

        const xorBytes: Buffer[] = [];
        while (fp.getPosition() < fp.getSize() - 12) {
          const xorByte = await fp.readNext(1);
          if (!xorByte.readUint8()) { // terminating byte 0x00
            break;
          }
          xorBytes.push(xorByte);
        }

        this.records.push({ relativeOffset: offset, xorBytes: Buffer.concat(xorBytes) });
      }

      await fp.close();
    });
  }

  async apply<T>(file: File, callback: (tempFile: string) => (Promise<T> | T)): Promise<T> {
    await this.parsePatch();

    return file.extractToFile(async (sourceFilePath) => {
      const targetFilePath = fsPoly.mktempSync(path.join(
        Constants.GLOBAL_TEMP_DIR,
        `${path.basename(sourceFilePath)}.ups`,
      ));
      await fsPromises.copyFile(sourceFilePath, targetFilePath);
      const targetFile = await FilePoly.fileFrom(targetFilePath, 'r+');

      const sourceFile = await FilePoly.fileFrom(sourceFilePath, 'r');

      /* eslint-disable no-await-in-loop, no-bitwise */
      for (let i = 0; i < this.records.length; i += 1) {
        const record = this.records[i];
        sourceFile.skipNext(record.relativeOffset);
        targetFile.skipNext(record.relativeOffset);

        for (let j = 0; j < record.xorBytes.length; j += 1) {
          const sourceByte = sourceFile.isEOF() ? 0x00 : (await sourceFile.readNext(1)).readUint8();
          const targetByte = sourceByte ^ record.xorBytes[j];
          await targetFile.write(Buffer.of(targetByte));
        }

        sourceFile.skipNext(1);
        targetFile.skipNext(1);
      }

      await targetFile.close();
      await sourceFile.close();

      const result = await callback(targetFilePath);
      await fsPoly.rm(targetFilePath);
      return result;
    });
  }
}
