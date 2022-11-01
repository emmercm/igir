import fs from 'fs';
import path from 'path';
import util from 'util';

import Constants from '../../constants.js';
import File from '../files/file.js';
import Patch from './patch.js';

interface IPSRecord {
  offset: number,
  data: Buffer,
}

export default class IPSPatch extends Patch {
  private readonly records: IPSRecord[] = [];

  constructor(file: File) {
    const crcBefore = IPSPatch.getCrcFromPath(file.getExtractedFilePath());
    super(file, crcBefore);
  }

  private static getCrcFromPath(filePath: string): string {
    const { name } = path.parse(filePath);

    const beforeMatches = name.match(/^([a-f0-9]{8})[^a-z0-9]/i);
    if (beforeMatches && beforeMatches?.length >= 2) {
      return beforeMatches[1].toUpperCase();
    }

    const afterMatches = name.match(/[^a-z0-9]([a-f0-9]{8})$/i);
    if (afterMatches && afterMatches?.length >= 2) {
      return afterMatches[1].toUpperCase();
    }

    throw new Error(`Couldn't parse base file CRC for patch: ${filePath}`);
  }

  // TODO(cemmer): make private
  async parsePatch(): Promise<void> {
    if (this.records.length) {
      return;
    }

    await this.getFile().extractToFile(async (patchFile) => {
      const fd = await util.promisify(fs.open)(patchFile, 'r');

      let readOffset = 0;
      const buffer = Buffer.alloc(Constants.FILE_READING_CHUNK_SIZE);
      const read = async (size: number): Promise<Buffer> => {
        const bytes = (await util.promisify(fs.read)(fd, buffer, 0, size, readOffset)).bytesRead;
        readOffset += size;
        // Make a copy for the return
        const result = Buffer.alloc(bytes);
        buffer.copy(result);
        return result;
      };

      const header = await read(5);
      if (header.toString() !== 'PATCH') {
        throw new Error(`IPS patch header is invalid: ${this.getFile()
          .toString()}`);
      }

      /* eslint-disable no-await-in-loop */
      while (true) {
        const offset = await read(3);
        if (offset === null || offset.toString() === 'EOF') {
          break;
        }

        const offsetInt = parseInt(offset.toString('hex'), 16);
        const size = parseInt((await read(2)).toString('hex'), 16);
        if (size === 0) {
          // Run-length encoding record
          const rleSize = parseInt((await read(2)).toString('hex'), 16);
          const data = Buffer.from((await read(1)).toString('hex')
            .repeat(rleSize), 'hex');
          this.records.push({ offset: offsetInt, data });
        } else {
          // Standard record
          const data = await read(size);
          this.records.push({ offset: offsetInt, data });
        }
      }

      await util.promisify(fs.close)(fd);
    });
  }

  async apply(file: File): Promise<void> {
    await this.parsePatch();

    await file.extractToFile(async (tempFile) => {
      const fd = await util.promisify(fs.open)(tempFile, 'a');

      /* eslint-disable no-await-in-loop */
      for (let i = 0; i < this.records.length; i += 1) {
        const record = this.records[i];
        await util.promisify(fs.write)(fd, record.data, 0, record.data.length, record.offset);
      }

      await util.promisify(fs.close)(fd);
    }, true);
  }
}
