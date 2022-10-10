import File from './files/file.js';
import ROM from './logiqx/rom.js';

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
}
