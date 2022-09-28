import async, { AsyncResultCallback } from 'async';
import xml2js from 'xml2js';

import { Symbols } from '../console/progressBar.js';
import Constants from '../constants.js';
import bufferPoly from '../polyfill/bufferPoly.js';
import File from '../types/files/file.js';
import DAT from '../types/logiqx/dat.js';
import DataFile from '../types/logiqx/dataFile.js';
import Scanner from './scanner.js';

/**
 * Scan the {@link OptionsProps.dat} input directory for DAT files and return the internal model
 * representation.
 *
 * This class will not be run concurrently with any other class.
 */
export default class DATScanner extends Scanner {
  async scan(): Promise<DAT[]> {
    await this.progressBar.logInfo('Scanning DAT files');
    const datFilePaths = await this.options.scanDatFiles();
    if (!datFilePaths.length) {
      return [];
    }
    await this.progressBar.logInfo(datFilePaths.map((file) => `Found DAT file: ${file}`).join('\n'));
    await this.progressBar.logInfo(`Found ${datFilePaths.length} DAT file${datFilePaths.length !== 1 ? 's' : ''}`);

    await this.progressBar.setSymbol(Symbols.SEARCHING);
    await this.progressBar.reset(datFilePaths.length);

    const datFiles = await this.getDatFiles(datFilePaths);
    await this.progressBar.reset(datFiles.length);

    await this.progressBar.logInfo('Deserializing DAT XML to objects');
    const dats = await this.parseDatFiles(datFiles);

    await this.progressBar.logInfo(dats.map((dat) => `${dat.getName()}: ${dat.getGames().length} games, ${dat.getParents().length} parents parsed`).join('\n'));
    return dats;
  }

  // Scan files on disk for DATs (archives may yield more than one DAT)
  private async getDatFiles(datFilePaths: string[]): Promise<File[]> {
    await this.progressBar.logDebug('Enumerating DAT archives');
    return (await async.mapLimit(
      datFilePaths,
      Constants.DAT_SCANNER_THREADS,
      async (datFilePath: string, callback: AsyncResultCallback<File[], Error>) => {
        await this.progressBar.logDebug(`${datFilePath}: Reading file`);
        const datFiles = await this.getFilesFromPath(datFilePath);
        callback(null, datFiles);
      },
    )).flatMap((datFiles) => datFiles);
  }

  // Parse each file into a DAT
  private async parseDatFiles(datFiles: File[]): Promise<DAT[]> {
    await this.progressBar.logDebug('Parsing DAT files');
    const results = (await async.mapLimit(
      datFiles,
      Constants.DAT_SCANNER_THREADS,
      async (datFile: File, callback: AsyncResultCallback<DAT | undefined, Error>) => {
        await this.progressBar.increment();
        const xmlObject = await this.parseDatFile(datFile);
        if (xmlObject) {
          const dat = DAT.fromObject(xmlObject.datafile);
          return callback(null, dat);
        }
        return callback(null, undefined);
      },
    )).filter((xmlObject) => xmlObject) as DAT[];

    return results.sort((a, b) => a.getNameShort().localeCompare(b.getNameShort()));
  }

  private async parseDatFile(datFile: File): Promise<DataFile | void> {
    try {
      await this.progressBar.logDebug(`${datFile.toString()}: parsing XML`);
      return await datFile.extractToStream(async (stream) => {
        const xmlContents = await bufferPoly.fromReadable(stream);
        return xml2js.parseStringPromise(xmlContents.toString(), {
          mergeAttrs: true,
          explicitArray: false,
        });
      });
    } catch (err) {
      const message = (err as Error).message.split('\n').join(', ');
      await this.progressBar.logError(`Failed to parse DAT ${datFile.toString()} : ${message}`);
      return Promise.resolve();
    }
  }
}
