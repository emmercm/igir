import ProgressBar, { Symbols } from '../console/progressBar.js';
import Constants from '../constants.js';
import Options from '../types/options.js';
import Patch from '../types/patches/patch.js';
import PatchFactory from '../types/patches/patchFactory.js';
import Scanner from './scanner.js';

export default class PatchScanner extends Scanner {
  constructor(options: Options, progressBar: ProgressBar) {
    super(options, progressBar, PatchScanner.name);
  }

  async scan(): Promise<Patch[]> {
    await this.progressBar.logInfo('Scanning patch files');

    await this.progressBar.setSymbol(Symbols.SEARCHING);
    await this.progressBar.reset(this.options.getPatchFileCount());

    const patchFilePaths = await this.options.scanPatchFiles();
    await this.progressBar.logDebug(`Found ${patchFilePaths.length} patch file${patchFilePaths.length !== 1 ? 's' : ''}`);
    await this.progressBar.reset(patchFilePaths.length);

    const files = await this.getFilesFromPaths(
      patchFilePaths,
      Constants.PATCH_SCANNER_THREADS,
    );
    const patches = (await Promise.all(files.map(async (file) => {
      try {
        return await PatchFactory.patchFrom(file);
      } catch (e) {
        await this.progressBar.logWarn(`${file.toString()}: Failed to parse patch : ${e}`);
        return undefined;
      }
    }))).filter((file) => file) as Patch[];

    await this.progressBar.doneItems(patches.length, 'unique patch', 'found');

    await this.progressBar.logInfo('Done scanning patch files');
    return patches;
  }
}
