import type ROM from './dats/rom.js';
import type File from './files/file.js';

/**
 * A container holding a {@link ROM}, a found input {@link File}, and a desired output {@link File}.
 */
export default class ROMWithFiles {
  private readonly rom: ROM;

  private readonly inputFile: File;

  private readonly outputFile: File;

  constructor(rom: ROM, inputFile: File, outputFile: File) {
    this.rom = rom;
    this.inputFile = inputFile;
    this.outputFile = outputFile;
  }

  getRom(): ROM {
    return this.rom;
  }

  getInputFile(): File {
    return this.inputFile;
  }

  getOutputFile(): File {
    return this.outputFile;
  }

  // Immutable setters

  withRom(rom: ROM): ROMWithFiles {
    if (rom === this.rom) {
      return this;
    }
    return new ROMWithFiles(rom, this.inputFile, this.outputFile);
  }

  withInputFile(inputFile: File): ROMWithFiles {
    if (inputFile === this.inputFile) {
      return this;
    }
    return new ROMWithFiles(this.rom, inputFile, this.outputFile);
  }

  withOutputFile(outputFile: File): ROMWithFiles {
    if (outputFile === this.outputFile) {
      return this;
    }
    return new ROMWithFiles(this.rom, this.inputFile, outputFile);
  }

  /**
   * Return true if this and the other {@link ROMWithFiles} would write the same contents to the
   * same output location.
   */
  writesSameOutputAs(other: ROMWithFiles): boolean {
    if (this.outputFile.getLocationKey() !== other.getOutputFile().getLocationKey()) {
      return false;
    }

    // The same input file with the same header, paddings, and patch will always produce the same
    // output contents. Check this first, as an output file's checksums may not be known yet.
    if (this.inputFile.equals(other.getInputFile())) {
      return true;
    }

    // Different input files can still produce the same output contents, such as duplicate files,
    // or symlinks to them
    if (this.outputFile.getSize() !== other.getOutputFile().getSize()) {
      return false;
    }
    const checksumPairs = [
      [this.outputFile.getCrc32(), other.getOutputFile().getCrc32()],
      [this.outputFile.getMd5(), other.getOutputFile().getMd5()],
      [this.outputFile.getSha1(), other.getOutputFile().getSha1()],
      [this.outputFile.getSha256(), other.getOutputFile().getSha256()],
    ].filter(([checksum, otherChecksum]) => checksum !== undefined && otherChecksum !== undefined);
    return (
      checksumPairs.length > 0 &&
      checksumPairs.every(([checksum, otherChecksum]) => checksum === otherChecksum)
    );
  }

  // Pseudo Built-Ins

  /**
   * A string hash code to uniquely identify this {@link ROMWithFiles}.
   */
  hashCode(): string {
    return `${this.rom.hashCode()}|${this.outputFile.getLocationKey()}`;
  }
}
