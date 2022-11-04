import path from 'path';

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
    return path.parse(this.getFile().getExtractedFilePath()).name;
  }

  abstract apply<T>(
    file: File,
    callback: (tempFile: string) => (T | Promise<T>),
  ): Promise<T>;
}
