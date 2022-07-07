import fs from 'fs';
import xml2js from 'xml2js';
import {Options} from "../types/options";
import {DAT, DATs} from "../types/dat";

export class DATScanner {
    static async parse(options: Options): Promise<DATs> {
        const parsedXml = await Promise.all(
            options.getDatFiles()
                .map((dat: string) => {
                    // TODO(cemmer): CLI progress bar output

                    const xmlContents = fs.readFileSync(dat);
                    return xml2js.parseStringPromise(xmlContents.toString(), {
                        mergeAttrs: true,
                        explicitArray: false
                    });
                })
        );
        const dats = parsedXml.map(xmlObject => DAT.fromObject(xmlObject.datafile));
        return new DATs(dats);
    }
}
