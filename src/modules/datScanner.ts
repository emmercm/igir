import fsPromises from 'node:fs/promises';
import xml2js from 'xml2js';

import Logger from '../logger.js';
import DAT from '../types/logiqx/dat.js';
import Options from '../types/options.js';

export default class DATScanner {
  static async parse(options: Options): Promise<DAT[]> {
    Logger.print(`Found ${options.getDatFiles().length} DAT file${options.getDatFiles().length !== -1 ? 's' : ''} ...`);

    const parsedXml = (await Promise.all(
      options.getDatFiles()
        .map(async (dat: string) => {
          const xmlContents = await fsPromises.readFile(dat);
          try {
            return await xml2js.parseStringPromise(xmlContents.toString(), {
              mergeAttrs: true,
              explicitArray: false,
            });
          } catch (err) {
            const message = (err as Error).message.split('\n').join(', ');
            Logger.error(`Failed to parse DAT ${dat} : ${message}`);
            return null;
          }
        }),
    )).filter((xmlObject) => xmlObject);

    Logger.print();

    return parsedXml
      .map((xmlObject) => DAT.fromObject(xmlObject.datafile))
      .sort((a, b) => a.getName().localeCompare(b.getName()));
  }
}
