import { promises as fsPromises } from 'fs';
import xml2js from 'xml2js';

import ProgressBar from '../console/progressBar.js';
import DAT from '../types/logiqx/dat.js';
import Options from '../types/options.js';

export default class DATScanner {
  private readonly options: Options;

  private readonly progressBar: ProgressBar;

  constructor(options: Options, progressBar: ProgressBar) {
    this.options = options;
    this.progressBar = progressBar;
  }

  async scan(): Promise<DAT[]> {
    await this.progressBar.logInfo('Scanning DAT files');
    const datFiles = await this.options.scanDatFiles();
    if (!datFiles.length) {
      return [];
    }
    await this.progressBar.logInfo(datFiles.map((file) => `Found DAT file: ${file}`).join('\n'));
    await this.progressBar.logInfo(`Found ${datFiles.length} DAT file${datFiles.length !== 1 ? 's' : ''}`);

    await this.progressBar.setSymbol('🔎');
    await this.progressBar.reset(datFiles.length);

    const parsedXml = [];

    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < datFiles.length; i += 1) {
      const dat = datFiles[i];
      await this.progressBar.logDebug(`${dat}: Reading file`);

      await this.progressBar.increment();

      const xmlContents = await fsPromises.readFile(dat);

      try {
        await this.progressBar.logDebug(`${dat}: parsing XML`);
        const xmlObject = await xml2js.parseStringPromise(xmlContents.toString(), {
          mergeAttrs: true,
          explicitArray: false,
        });
        parsedXml.push(xmlObject);
      } catch (err) {
        const message = (err as Error).message.split('\n').join(', ');
        await this.progressBar.logError(`Failed to parse DAT ${dat} : ${message}`);
      }
    }

    await this.progressBar.logInfo('Deserializing DAT XML to objects');
    const dats = parsedXml
      .filter((xmlObject) => xmlObject)
      .map((xmlObject) => DAT.fromObject(xmlObject.datafile))
      .sort((a, b) => a.getNameShort().localeCompare(b.getNameShort()));
    await this.progressBar.logInfo(dats.map((dat) => `${dat.getName()}: ${dat.getGames().length} games, ${dat.getParents().length} parents parsed`).join('\n'));
    return dats;
  }
}
