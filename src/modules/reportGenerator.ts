import DAT from '../types/dat/dat.js';
import Parent from '../types/dat/parent.js';
import Options from '../types/options.js';
import ROMFile from '../types/romFile.js';

export default class ReportGenerator {
  private readonly options: Options;

  constructor(options: Options) {
    this.options = options;
  }

  write(writtenRoms: Map<DAT, Map<Parent, ROMFile[]>>) {
    writtenRoms.forEach((parentToRomFiles, dat) => {
      parentToRomFiles.forEach((romFiles, parent) => {
        // Does parent have release?
      });
    });
  }
}
