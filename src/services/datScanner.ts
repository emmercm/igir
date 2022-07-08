import fs from 'fs';
import xml2js from 'xml2js';

import DAT from '../types/dat/dat';
import Options from '../types/options';

export default class DATScanner {
  static async parse(options: Options): Promise<DAT[]> {
    const parsedXml = await Promise.all(
      options.getDatFiles()
        .map((dat: string) => {
          // TODO(cemmer): CLI progress bar output

          const xmlContents = fs.readFileSync(dat);
          return xml2js.parseStringPromise(xmlContents.toString(), {
            mergeAttrs: true,
            explicitArray: false,
          });
        }),
    );
    return parsedXml.map((xmlObject) => DAT.fromObject(xmlObject.datafile));
  }
}
