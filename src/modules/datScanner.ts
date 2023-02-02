import async, { AsyncResultCallback } from 'async';
import xml2js from 'xml2js';

import ProgressBar, { ProgressBarSymbol } from '../console/progressBar.js';
import Constants from '../constants.js';
import bufferPoly from '../polyfill/bufferPoly.js';
import fsPoly from '../polyfill/fsPoly.js';
import File from '../types/files/file.js';
import DAT from '../types/logiqx/dat.js';
import DataFile from '../types/logiqx/dataFile.js';
import Options from '../types/options.js';
import Scanner from './scanner.js';

/**
 * Scan the {@link OptionsProps.dat} input directory for DAT files and return the internal model
 * representation.
 *
 * This class will not be run concurrently with any other class.
 */
export default class DATScanner extends Scanner {
  constructor(options: Options, progressBar: ProgressBar) {
    super(options, progressBar, DATScanner.name);
  }

  async scan(): Promise<DAT[]> {
    await this.progressBar.logInfo('Scanning DAT files');

    await this.progressBar.setSymbol(ProgressBarSymbol.SEARCHING);
    await this.progressBar.reset(this.options.getDatFileCount());

    const datFilePaths = await this.options.scanDatFiles();
    if (!datFilePaths.length) {
      return [];
    }
    await this.progressBar.logTrace(datFilePaths.map((file) => `Found DAT file: ${file}`).join('\n'));
    await this.progressBar.logDebug(`Found ${datFilePaths.length} DAT file${datFilePaths.length !== 1 ? 's' : ''}`);
    await this.progressBar.reset(datFilePaths.length);

    await this.progressBar.logDebug('Enumerating DAT archives');
    const datFiles = await this.getFilesFromPaths(datFilePaths, Constants.DAT_SCANNER_THREADS);
    await this.progressBar.reset(datFiles.length);

    await this.progressBar.logDebug('Deserializing DAT XML to objects');
    const dats = await this.parseDatFiles(datFiles);

    await this.progressBar.logTrace(dats.map((dat) => {
      const size = dat.getGames()
        .flatMap((game) => game.getRoms())
        .reduce((sum, rom) => sum + rom.getSize(), 0);
      return `${dat.getName()}: ${fsPoly.sizeReadable(size)} of ROMs, ${dat.getGames().length.toLocaleString()} game${dat.getGames().length !== 1 ? 's' : ''}, ${dat.getParents().length.toLocaleString()} parent${dat.getParents().length !== 1 ? 's' : ''} parsed`;
    }).join('\n'));
    await this.progressBar.logInfo('Done scanning DAT files');
    return dats;
  }

  // Parse each file into a DAT
  private async parseDatFiles(datFiles: File[]): Promise<DAT[]> {
    await this.progressBar.logDebug('Parsing DAT files');
    const results = (await async.mapLimit(
      datFiles,
      Constants.DAT_SCANNER_THREADS,
      async (datFile: File, callback: AsyncResultCallback<DAT | undefined, Error>) => {
        const xmlObject = await this.parseDatFile(datFile);
        if (xmlObject) {
          try {
            const dat = DAT.fromObject(xmlObject.datafile);
            return callback(null, dat);
          } catch (e) {
            await this.progressBar.logWarn(`${datFile.toString()}: failed to parse DAT object : ${e}`);
          }
        }

        await this.progressBar.increment();
        return callback(null);
      },
    )).filter((xmlObject) => xmlObject) as DAT[];

    return results.sort((a, b) => a.getNameShort().localeCompare(b.getNameShort()));
  }

  private async parseDatFile(datFile: File): Promise<DataFile | undefined> {
    await this.progressBar.logTrace(`${datFile.toString()}: parsing XML`);
    return datFile.extractToStream(async (stream) => {
      try {
        const xmlContents = await bufferPoly.fromReadable(stream);
        return await xml2js.parseStringPromise(xmlContents.toString(), {
          mergeAttrs: true,
          explicitArray: false,
        });
      } catch (e) {
        const message = (e as Error).message.split('\n').join(', ');
        await this.progressBar.logWarn(`${datFile.toString()}: failed to parse DAT XML : ${message}`);
        return undefined;
      }
    });
  }
}
