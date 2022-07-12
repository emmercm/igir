import fg from 'fast-glob';
import trash from 'trash';

import DAT from '../types/dat/dat.js';
import Parent from '../types/dat/parent.js';
import Options from '../types/options.js';
import ProgressBar from '../types/progressBar.js';
import ROMFile from '../types/romFile.js';

export default class OutputCleaner {
  private readonly options: Options;

  private readonly progressBar: ProgressBar;

  constructor(options: Options, progressBar: ProgressBar) {
    this.options = options;
    this.progressBar = progressBar;
  }

  async clean(dat: DAT, writtenRoms: Map<Parent, ROMFile[]>) {
    if (!this.options.getClean()) {
      return;
    }

    // If nothing was written, then don't clean anything
    const outputRomPaths = [...writtenRoms.values()]
      .flatMap((romFiles) => romFiles)
      .map((romFile) => romFile.getFilePath());
    if (!outputRomPaths.length) {
      return;
    }

    // TODO(cemmer): remove empty directories

    // If there is nothing to clean, then don't do anything
    const filesToClean = (await fg(`${this.options.getOutput(dat)}/**`))
      .filter((file) => outputRomPaths.indexOf(file) === -1);
    if (!filesToClean) {
      return;
    }

    this.progressBar.reset(filesToClean.length).setSymbol('♻️');

    await trash(filesToClean);

    this.progressBar.done();
  }
}
