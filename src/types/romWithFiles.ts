import ROM from './dats/rom.js';
import File from './files/file.js';

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

  // Pseudo Built-Ins

  /**
   * A string hash code to uniquely identify this {@link ROMWithFiles}.
   */
  hashCode(): string {
    return `${this.rom.hashCode()}|${this.inputFile.toString()}|${this.outputFile.toString()}`;
  }
}
