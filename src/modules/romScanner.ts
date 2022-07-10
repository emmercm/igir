import AdmZip from 'adm-zip';
import micromatch from 'micromatch';
import path from 'path';

import DAT from '../types/dat/dat.js';
import Options from '../types/options.js';
import ProgressBar from '../types/progressBar.js';
import ROMFile from '../types/romFile.js';

export default class ROMScanner {
  private static readonly pathToRomFileCache = new Map<string, ROMFile[]>();

  private readonly options: Options;

  private readonly progressBar: ProgressBar;

  constructor(options: Options, progressBar: ProgressBar) {
    this.options = options;
    this.progressBar = progressBar;
  }

  parse(dat: DAT): ROMFile[] {
    const datsRomExtensionGlob = `**/*${dat.getRomExtensions().length > 1
      ? `{${dat.getRomExtensions().join(',')}}`
      : dat.getRomExtensions()}`;
    const archiveExtensionGlob = '**/*.zip';

    const filteredInputFiles = this.options.getInputFiles()
      .filter((file) => micromatch.isMatch(file, [datsRomExtensionGlob, archiveExtensionGlob]));

    this.progressBar.reset(filteredInputFiles.length).setSymbol('🔎');

    const results = filteredInputFiles.flatMap((file) => {
      this.progressBar.increment();

      if (ROMScanner.pathToRomFileCache.has(file)) {
        return ROMScanner.pathToRomFileCache.get(file) as ROMFile[];
      }

      if (path.extname(file) === '.zip') {
        const zip = new AdmZip(file);
        const romFilesInZip = zip.getEntries()
          .filter((entry) => micromatch.isMatch(entry.entryName, datsRomExtensionGlob))
          .map((entry) => new ROMFile(
            file,
            entry.entryName,
            entry.header.crc.toString(16),
          ));
        ROMScanner.pathToRomFileCache.set(file, romFilesInZip);
        return romFilesInZip;
      }

      const romFiles = [new ROMFile(file)];
      ROMScanner.pathToRomFileCache.set(file, romFiles);
      return romFiles;
    });
    // TODO(cemmer): de-duplicate?

    return results;
  }
}
