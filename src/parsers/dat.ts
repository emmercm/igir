import fs from 'fs';
import xml2js from 'xml2js';
import {Options} from "../types/options";
import {plainToClass, plainToInstance} from 'class-transformer';
import {DAT} from "../types/dat";

export class DATParser {
    static async parse(options: Options) {
        const parsedXml = await Promise.all(options.dat
            .map((dat: string) => fs.readFileSync(dat))
            .map((xmlContents: Buffer) => xml2js.parseStringPromise(xmlContents.toString(), {
                mergeAttrs: true,
                explicitArray: false
            })));
        const dats = parsedXml
            .map(xmlObject => DAT.fromObject(xmlObject.datafile));

        const i = 0;
    }
}
