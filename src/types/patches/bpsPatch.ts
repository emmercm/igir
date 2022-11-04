import path from 'path';

import Constants from '../../constants.js';
import FilePoly from '../../polyfill/filePoly.js';
import fsPoly from '../../polyfill/fsPoly.js';
import File from '../files/file.js';
import Patch from './patch.js';

enum BPSAction {
  SOURCE_READ = 0,
  TARGET_READ,
  SOURCE_COPY,
  TARGET_COPY,
}

interface BPSRecord {
  action: BPSAction,
  length: number,
  data?: Buffer,
  relativeOffset?: number,
}

/**
 * @link https://github.com/blakesmith/rombp/blob/master/docs/bps_spec.md
 * @link https://github.com/marcrobledo/RomPatcher.js/blob/master/js/formats/bps.js
 */
export default class BPSPatch extends Patch {
  private readonly records: BPSRecord[] = [];

  static async patchFrom(file: File): Promise<Patch> {
    let crcBefore = '';
    let crcAfter = '';
    let targetSize = 0;

    await file.extractToFile(async (patchFile) => {
      const fp = await FilePoly.fileFrom(patchFile, 'r');

      fp.seek(4);
      await BPSPatch.readNumber(fp); // source size
      targetSize = await BPSPatch.readNumber(fp); // target size

      fp.seek(fp.getSize() - 12);
      crcBefore = (await fp.readNext(4)).reverse().toString('hex');
      crcAfter = (await fp.readNext(4)).reverse().toString('hex');

      await fp.close();
    });

    if (crcBefore.length !== 8 || crcAfter.length !== 8) {
      throw new Error(`Couldn't parse base file CRC for patch: ${file.toString()}`);
    }

    return new BPSPatch(file, crcBefore, crcAfter, targetSize);
  }

  async parsePatch(): Promise<void> {
    if (this.records.length) {
      return;
    }

    await this.getFile().extractToFile(async (patchFile) => {
      const fp = await FilePoly.fileFrom(patchFile, 'r');

      // Skip header info
      const header = await fp.readNext(4);
      if (header.toString() !== 'BPS1') {
        throw new Error(`BPS patch header is invalid: ${this.getFile().toString()}`);
      }
      await BPSPatch.readNumber(fp); // source size
      await BPSPatch.readNumber(fp); // target size
      const metadataSize = await BPSPatch.readNumber(fp);
      if (metadataSize) {
        await fp.readNext(metadataSize);
      }

      /* eslint-disable no-constant-condition, no-await-in-loop, no-bitwise */
      while (fp.getPosition() < fp.getSize() - 12) {
        const blockHeader = await BPSPatch.readNumber(fp);
        const action = blockHeader & 3;
        const length = (blockHeader >> 2) + 1;

        if (action === BPSAction.TARGET_READ) {
          const data = await fp.readNext(length);
          this.records.push({ action, length, data });
        } else if (action === BPSAction.SOURCE_COPY || action === BPSAction.TARGET_COPY) {
          const offset = await BPSPatch.readNumber(fp);
          const relativeOffset = (offset & 1 ? -1 : +1) * (offset >> 1);
          this.records.push({ action, length, relativeOffset });
        } else {
          this.records.push(({ action, length }));
        }
      }

      await fp.close();
    });
  }

  private static async readNumber(fp: FilePoly): Promise<number> {
    let data = 0;
    let shift = 1;

    /* eslint-disable no-constant-condition, no-await-in-loop, no-bitwise */
    while (true) {
      const x = (await fp.readNext(1))[0];
      if (x === undefined) { // prevent EOF infinite loop
        break;
      }
      data += (x & 0x7f) * shift; // drop the left-most bit
      if (x & 0x80) { // left-most bit is telling us this is the end
        break;
      }
      shift <<= 7;
      data += shift;
    }

    return data;
  }

  async apply<T>(file: File, callback: (tempFile: string) => (Promise<T> | T)): Promise<T> {
    await this.parsePatch();

    return file.extractToFile(async (sourceFilePath) => {
      const sourceFile = await FilePoly.fileFrom(sourceFilePath, 'r');
      let sourceRelativeOffset = 0;

      const targetFilePath = fsPoly.mktempSync(path.join(
        Constants.GLOBAL_TEMP_DIR,
        `${path.basename(sourceFilePath)}.bps`,
      ));
      const targetFile = await FilePoly.fileOfSize(targetFilePath, 'r+', this.getSizeAfter() as number);
      let targetRelativeOffset = 0;

      for (let i = 0; i < this.records.length; i += 1) {
        const record = this.records[i];
        if (record.action === BPSAction.SOURCE_READ) {
          await targetFile.write(await sourceFile.readAt(targetFile.getPosition(), record.length));
        } else if (record.action === BPSAction.TARGET_READ) {
          await targetFile.write(record.data as Buffer);
        } else if (record.action === BPSAction.SOURCE_COPY) {
          sourceRelativeOffset += record.relativeOffset as number;
          await targetFile.write(await sourceFile.readAt(sourceRelativeOffset, record.length));
          sourceRelativeOffset += record.length;
        } else {
          targetRelativeOffset += record.relativeOffset as number;
          await targetFile.write(await targetFile.readAt(targetRelativeOffset, record.length));
          targetRelativeOffset += record.length;
        }
      }

      await targetFile.close();
      await sourceFile.close();

      const result = await callback(targetFilePath);
      await fsPoly.rm(targetFilePath);
      return result;
    });
  }
}
