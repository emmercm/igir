import Parent from '../types/logiqx/parent.js';
import Options from '../types/options.js';
import ROMFile from '../types/romFile.js';
import ProgressBarCLI from './progressBar/progressBarCLI.js';

export default class StatusGenerator {
  private readonly options: Options;

  private readonly progressBar: ProgressBarCLI;

  constructor(options: Options, progressBar: ProgressBarCLI) {
    this.options = options;
    this.progressBar = progressBar;
  }

  async output(parentsToRomFiles: Map<Parent, ROMFile[]>) {
    const allRoms: Parent[] = [];
    const foundRoms: Parent[] = [];

    const allBios: Parent[] = [];
    const foundBios: Parent[] = [];

    const allReleases: Parent[] = [];
    const foundReleases: Parent[] = [];

    const allPrototypes: Parent[] = [];
    const foundPrototypes: Parent[] = [];

    parentsToRomFiles.forEach((romFiles, parent) => {
      allRoms.push(parent);
      if (parent.isBios()) {
        allBios.push(parent);
      } else if (parent.isRelease()) {
        allReleases.push(parent);
      } else if (parent.isPrototype()) {
        allPrototypes.push(parent);
      }

      if (romFiles.length) {
        foundRoms.push(parent);
        if (parent.isBios()) {
          foundBios.push(parent);
        } else if (parent.isRelease()) {
          foundReleases.push(parent);
        } else if (parent.isPrototype()) {
          foundPrototypes.push(parent);
        }
      }
    });

    let message = '';
    if (!this.options.getSingle() && !this.options.getOnlyBios()) {
      message += `, ${foundRoms.length}/${allRoms.length} known`;
    }
    if (this.options.getOnlyBios() || !this.options.getNoBios()) {
      message += `, ${foundBios.length}/${allBios.length} BIOSes`;
    }
    if (!this.options.getOnlyBios()) {
      message += `, ${foundReleases.length}/${allReleases.length} releases`;
    }
    if (!this.options.getOnlyBios() && !this.options.getNoPrototype()) {
      message += `, ${foundPrototypes.length}/${allPrototypes.length} prototypes`;
    }
    message += ' processed';

    await this.progressBar.done(message.replace(/^, /, ''));
  }
}
