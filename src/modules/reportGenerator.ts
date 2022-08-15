import fs from 'fs';
import moment from 'moment';

import ProgressBarCLI from '../console/progressBarCLI.js';
import Constants from '../constants.js';
import DAT from '../types/logiqx/dat.js';
import Parent from '../types/logiqx/parent.js';
import Options from '../types/options.js';
import ROMFile from '../types/romFile.js';

export default class ReportGenerator {
  private readonly options: Options;

  private readonly progressBar: ProgressBarCLI;

  constructor(options: Options, progressBar: ProgressBarCLI) {
    this.options = options;
    this.progressBar = progressBar;
  }

  async generate(datsToResults: Map<DAT, Map<Parent, ROMFile[]>>) {
    const report = this.options.getOutputReport();
    const append = (message: string) => fs.appendFileSync(report, `${message.trimEnd()}\n`);

    append(`// ${Constants.COMMAND_NAME}, ${moment().format()}\n// ${report}`);

    datsToResults.forEach((parentsToRomFiles, dat) => {
      let message = `\n// ${dat.getNameLong()}: ${dat.getGames().length} games, ${dat.getParents().length} parents defined`;

      // TODO(cemmer): rewrite this
      const items = [
        !this.options.getOnlyBios() ? 'roms' : '',
        this.options.getOnlyBios() || !this.options.getNoBios() ? 'bios' : '',
        !this.options.getNoSample() ? 'samples' : '',
        'disks',
      ].filter((val) => val);
      message += `\n// You are missing _ of _ known ${dat.getNameLong()} items (${items.join(', ')})`;

      append(message);
    });

    await this.progressBar.done(report);
  }
}
