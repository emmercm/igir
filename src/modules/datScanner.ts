import xml2js from 'xml2js';

import { Symbols } from '../console/progressBar.js';
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

    const parsedDataFiles = await this.parseDataFiles(datFilePaths);

    await this.progressBar.logInfo('Deserializing DAT XML to objects');
    const dats = parsedDataFiles
      .filter((xmlObject) => xmlObject)
      .map((xmlObject) => DAT.fromObject(xmlObject.datafile))
      .sort((a, b) => a.getNameShort().localeCompare(b.getNameShort()));
    await this.progressBar.logInfo(dats.map((dat) => `${dat.getName()}: ${dat.getGames().length} games, ${dat.getParents().length} parents parsed`).join('\n'));
    return dats;
  }

  private async parseDataFiles(datFilePaths: string[]): Promise<DataFile[]> {
    const results: DataFile[] = [];

    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < datFilePaths.length; i += 1) {
      const datFilePath = datFilePaths[i];
      await this.progressBar.logDebug(`${datFilePath}: Reading file`);
      await this.progressBar.increment();

      const datFiles = await this.getFilesFromPath(datFilePath);
      for (let j = 0; j < datFiles.length; j += 1) {
        const datFile = datFiles[j];
        const xmlObject = await this.parseDatFile(datFile);
        if (xmlObject) {
          results.push(xmlObject);
        }
      }
    }

    return results;
  }

  private async parseDatFile(datFile: File): Promise<DataFile | undefined> {
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
      return Promise.resolve(undefined);
    }
  }
}
