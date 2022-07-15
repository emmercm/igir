import Logger from '../logger.js';
import DAT from '../types/logiqx/dat.js';
import Parent from '../types/logiqx/parent.js';
import Options from '../types/options.js';
import ROMFile from '../types/romFile.js';

export default class ReportGenerator {
  private readonly options: Options;

  constructor(options: Options) {
    this.options = options;
  }

  write(writtenRoms: Map<DAT, Map<Parent, ROMFile[]>>) {
    if (writtenRoms.size) {
      Logger.out();
    }

    [...writtenRoms.entries()]
      .sort((a, b) => a[0].getName().localeCompare(b[0].getName()))
      .forEach((entry) => {
        const dat = entry[0];
        const parentToRomFiles = entry[1];

        const allBios: Parent[] = [];
        const missingBios: Parent[] = [];

        const allReleases: Parent[] = [];
        const missingReleases: Parent[] = [];

        const allPrototypes: Parent[] = [];
        const missingPrototypes: Parent[] = [];

        parentToRomFiles.forEach((romFiles, parent) => {
          if (parent.isBios()) {
            allBios.push(parent);
          } else if (parent.isRelease()) {
            allReleases.push(parent);
          } else if (parent.isPrototype()) {
            allPrototypes.push(parent);
          }

          if (!romFiles.length) {
            if (parent.isBios()) {
              missingBios.push(parent);
            } else if (parent.isRelease()) {
              missingReleases.push(parent);
            } else if (parent.isPrototype()) {
              missingPrototypes.push(parent);
            }
          }
        });

        let message = `${dat.getName()}:`;
        message += ` ${parentToRomFiles.size} parent${parentToRomFiles.size !== 1 ? 's' : ''} defined`;
        if (this.options.getOnlyBios() || !this.options.getNoBios()) {
          message += `\n  ${missingBios.length}/${allBios.length} BIOS missing`;
          missingBios.forEach((bios) => { message += `\n    ${bios.getName()}`; });
        }
        if (!this.options.getOnlyBios()) {
          message += `\n  ${missingReleases.length}/${allReleases.length} releases missing`;
          missingReleases.forEach((release) => { message += `\n    ${release.getName()}`; });
        }
        if (!this.options.getNoPrototype()) {
          message += `\n  ${missingPrototypes.length}/${allPrototypes.length} prototypes missing`;
          missingPrototypes.forEach((prototype) => { message += `\n    ${prototype.getName()}`; });
        }
        Logger.out(message);
      });
  }
}
