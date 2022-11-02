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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected static patchFrom(file: File): Patch | Promise<Patch> {
    throw new Error('You should not have gotten here!');
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
