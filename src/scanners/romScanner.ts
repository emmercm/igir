import {Options} from "../types/options";
import {DATs} from "../types/dat";
import AdmZip from "adm-zip";
import micromatch from 'micromatch';
import path from 'path';
import {ROMFile} from "../types/romFile";

export class ROMScanner {
    static parse(options: Options, dats: DATs): ROMFile[] {
        const datsRomExtensionGlob = `**/*{${dats.getRomExtensions().join(',')}}`;
        const archiveExtensionGlob = '**/*.zip';

        return options.getInputFiles()
            .filter((file: string) => micromatch.isMatch(file, datsRomExtensionGlob) || micromatch.isMatch(file, archiveExtensionGlob))
            .flatMap((file: string) => {
                // TODO(cemmer): CLI progress bar output

                if (path.extname(file) === '.zip') {
                    const zip = new AdmZip(file);
                    return zip.getEntries()
                        .filter((entry) => micromatch.isMatch(entry.entryName, datsRomExtensionGlob))
                        .map((entry) => new ROMFile(file, {
                            entryPath: entry.entryName,
                            crc: entry.header.crc.toString(16)
                        }));
                }

                return [new ROMFile(file)];
            });
        // TODO(cemmer): de-duplicate?
    }
}
