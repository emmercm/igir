import File from '../files/file.js';

export default abstract class Patch {
  private readonly file: File;

  private readonly crcBefore: string;

  private readonly crcAfter?: string;

  protected constructor(file: File, crcBefore: string, crcAfter?: string) {
    this.file = file;
    this.crcBefore = crcBefore;
    this.crcAfter = crcAfter;
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

  abstract getRomName(): string;

  abstract apply<T>(
    file: File,
    callback: (tempFile: string) => (T | Promise<T>),
  ): Promise<T>;
}
