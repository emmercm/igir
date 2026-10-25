/**
 * A ROM file header (e.g. iNES, A78, LNX, SMC) that can be stripped from a ROM file. Known
 * headers are defined and detected by `FileSignature`.
 */
export default class ROMHeader {
  private readonly dataOffsetBytes: number;

  private readonly headerlessFileExtension: string;

  constructor(dataOffsetBytes: number, headerlessFileExtension: string) {
    this.dataOffsetBytes = dataOffsetBytes;
    this.headerlessFileExtension = headerlessFileExtension;
  }

  getDataOffsetBytes(): number {
    return this.dataOffsetBytes;
  }

  getHeaderlessFileExtension(): string {
    return this.headerlessFileExtension;
  }
}
