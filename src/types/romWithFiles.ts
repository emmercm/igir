import ROM from './dats/rom.js';
import File from './files/file.js';

/**
 * A container holding a {@link ROM}, a found input {@link File}, and a desired output {@link File}.
 */
export default class ROMWithFiles {
  private readonly rom: ROM;

  private readonly inputFile: File;

  private readonly outputFile: File;

  // TODO(cemmer): information about what checksum algorithm was used to match the input file
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
}
