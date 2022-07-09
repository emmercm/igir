import fs from 'fs';
import xml2js from 'xml2js';

import Logger from '../logger';
import DAT from '../types/dat/dat';
import Options from '../types/options';

export default class DATScanner {
  static async parse(options: Options): Promise<DAT[]> {
    Logger.out(`Parsing ${options.getDatFiles().length} DAT files ...`);

    const parsedXml = await Promise.all(
      options.getDatFiles()
        .map((dat: string) => {
          const xmlContents = fs.readFileSync(dat);
          return xml2js.parseStringPromise(xmlContents.toString(), {
            mergeAttrs: true,
            explicitArray: false,
          });
        }),
    );

    Logger.out();

    return parsedXml.map((xmlObject) => DAT.fromObject(xmlObject.datafile));
  }
}
