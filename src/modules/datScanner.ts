import fsPromises from 'node:fs/promises';
import xml2js from 'xml2js';

import DAT from '../types/logiqx/dat.js';
import Options from '../types/options.js';
import ProgressBar from '../types/progressBar.js';

export default class DATScanner {
  private readonly options: Options;

  private readonly progressBar: ProgressBar;

  constructor(options: Options, progressBar: ProgressBar) {
    this.options = options;
    this.progressBar = progressBar;
  }

  async parse(): Promise<DAT[]> {
    const datFiles = await this.options.scanDatFiles();
    if (!datFiles.length) {
      return [];
    }

    this.progressBar.reset(datFiles.length).setSymbol('🔎');

    const parsedXml = [];

    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < datFiles.length; i += 1) {
      const dat = datFiles[i];

      this.progressBar.increment();

      const xmlContents = await fsPromises.readFile(dat);

      try {
        const xmlObject = await xml2js.parseStringPromise(xmlContents.toString(), {
          mergeAttrs: true,
          explicitArray: false,
        });
        parsedXml.push(xmlObject);
      } catch (err) {
        const message = (err as Error).message.split('\n').join(', ');
        ProgressBar.logError(`Failed to parse DAT ${dat} : ${message}`);
      }
    }

    return parsedXml
      .map((xmlObject) => DAT.fromObject(xmlObject.datafile))
      .sort((a, b) => a.getName().localeCompare(b.getName()));
  }
}
