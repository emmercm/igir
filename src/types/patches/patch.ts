import path from 'path';

import FilePoly from '../../polyfill/filePoly.js';
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

  protected static getCrcFromPath(filePath: string): string {
    const { name } = path.parse(filePath);

    const beforeMatches = name.match(/^([a-f0-9]{8})[^a-z0-9]/i);
    if (beforeMatches && beforeMatches?.length >= 2) {
      return beforeMatches[1].toLowerCase();
    }

    const afterMatches = name.match(/[^a-z0-9]([a-f0-9]{8})$/i);
    if (afterMatches && afterMatches?.length >= 2) {
      return afterMatches[1].toLowerCase();
    }

    throw new Error(`Couldn't parse base file CRC for patch: ${filePath}`);
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

    /* eslint-disable no-await-in-loop, no-bitwise */
    while (!fp.isEOF()) {
      const x = (await fp.readNext(1)).readUInt8();
      data += (x & 0x7f) * shift; // drop the left-most bit
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

    /* eslint-disable no-await-in-loop, no-bitwise */
    while (!fp.isEOF()) {
      const bits = (await fp.readNext(1)).readUint8();
      num = (num << 7) + (bits & 0x7f);
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
      const bits = buffer.readUint8(lastOffset);
      lastOffset += 1;
      num = (num << 7) + (bits & 0x7f);
      if (!(bits & 0x80)) { // left-most bit is telling us to keep going
        break;
      }
    }

    return [num, lastOffset];
  }
}
