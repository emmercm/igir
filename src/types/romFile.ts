import crc32 from 'crc/crc32';
import fs from 'fs';

export class ROMFile {
    private filePath!: string
    private entryPath?: string
    private crc!: string

    constructor(filePath: string, options: {entryPath?: string, crc?: string} = {}) {
        this.filePath = filePath;
        this.entryPath = options.entryPath;
        this.crc = (options.crc || crc32(fs.readFileSync(filePath)).toString(16)).padStart(8, '0');
    }

    getCrc(): string {
        return this.crc;
    }
}
