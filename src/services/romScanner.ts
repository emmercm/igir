import AdmZip from 'adm-zip';
import micromatch from 'micromatch';
import path from 'path';

import DAT from '../types/dat/dat';
import Options from '../types/options';
import ProgressBar from '../types/progressBar';
import ROMFile from '../types/romFile';

export default class ROMScanner {
  static parse(options: Options, progressBar: ProgressBar, dat: DAT): ROMFile[] {
    const datsRomExtensionGlob = `**/*${dat.getRomExtensions().length > 1
      ? `{${dat.getRomExtensions().join(',')}}`
      : dat.getRomExtensions()}`;
    const archiveExtensionGlob = '**/*.zip';

    const filteredInputFiles = options.getInputFiles()
      .filter((file) => micromatch.isMatch(file, [datsRomExtensionGlob, archiveExtensionGlob]));

    progressBar.reset(filteredInputFiles.length).setSymbol('🔎');

    const romFiles = filteredInputFiles.flatMap((file) => {
      progressBar.increment();

      if (path.extname(file) === '.zip') {
        const zip = new AdmZip(file);
        return zip.getEntries()
          .filter((entry) => micromatch.isMatch(entry.entryName, datsRomExtensionGlob))
          .map((entry) => new ROMFile(file, {
            entryPath: entry.entryName,
            crc: entry.header.crc.toString(16),
          }));
      }

      return [new ROMFile(file)];
    });
    // TODO(cemmer): de-duplicate?

    return romFiles;
  }
}
