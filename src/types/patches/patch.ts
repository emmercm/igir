import path from 'node:path';

import FilePoly from '../../polyfill/filePoly.js';
import ExpectedError from '../expectedError.js';
import File from '../files/file.js';

export default abstract class Patch {
  private readonly file: File;

  private readonly crcBefore: string;

  private readonly crcAfter?: string;

  private readonly sizeAfter?: number;

  protected constructor(file: File, crcBefore: string, crcAfter?: string, sizeAfter?: number) {
    this.file = file;
    this.crcBefore = crcBefore;
    this.crcAfter = crcAfter;
    this.sizeAfter = sizeAfter;
  }

  protected static getCrcFromPath(fileBasename: string): string {
    const matches = fileBasename.match(/(^|[^a-z0-9])([a-f0-9]{8})([^a-z0-9]|$)/i);
    if (matches && matches?.length >= 3) {
      return matches[2].toLowerCase();
    }

    throw new ExpectedError(`couldn't parse base file CRC for patch: ${fileBasename}`);
  }

  getFile(): File {
    return this.file;
  }

  getCrcBefore(): string {
    return this.crcBefore;
  }

  getCrcAfter(): string | undefined {
    return this.crcAfter;
  }

  getSizeAfter(): number | undefined {
    return this.sizeAfter;
  }

  getRomName(): string {
    return path.parse(this.getFile().getExtractedFilePath()).name
      .replace(new RegExp(this.getCrcBefore(), 'gi'), '')
      .replace(/  +/g, ' ')
      .trim();
  }

  abstract createPatchedFile(inputRomFile: File, outputRomPath: string): Promise<void>;

  protected static async readUpsUint(fp: FilePoly): Promise<number> {
    let data = 0;
    let shift = 1;

    while (!fp.isEOF()) {
      const x = (await fp.readNext(1)).readUInt8();
      data += (x & 0x7F) * shift; // drop the left-most bit
      if (x & 0x80) { // left-most bit is telling us this is the end
        break;
      }
      shift <<= 7;
      data += shift;
    }

    return data;
  }

  static async readVcdiffUintFromFile(fp: FilePoly): Promise<number> {
    let num = 0;

    while (!fp.isEOF()) {
      const bits = (await fp.readNext(1)).readUInt8();
      num = (num << 7) + (bits & 0x7F);
      if (!(bits & 0x80)) { // left-most bit is telling us to keep going
        break;
      }
    }

    return num;
  }

  static readVcdiffUintFromBuffer(buffer: Buffer, offset = 0): [number, number] {
    let num = 0;

    let lastOffset = offset;
    while (lastOffset < buffer.length) {
      const bits = buffer.readUInt8(lastOffset);
      lastOffset += 1;
      num = (num << 7) + (bits & 0x7F);
      if (!(bits & 0x80)) { // left-most bit is telling us to keep going
        break;
      }
    }

    return [num, lastOffset];
  }
}
