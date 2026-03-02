import fs from 'node:fs';
import stream from 'node:stream';
import zlib from 'node:zlib';

import IOFile from '../../../polyfill/ioFile.js';
import Archive from './archive.js';
import ArchiveEntry from './archiveEntry.js';
import Tar from './tar.js';

interface GzipHeaderFooter {
  filename?: string;
  crc32?: string;
  size?: number;
}

export default class Gzip extends Archive {
  protected new(filePath: string): Gzip {
    return new Gzip(filePath);
  }

  static getExtensions(): string[] {
    return ['.gz', '.gzip'];
  }

  getExtension(): string {
    return Gzip.getExtensions()[0];
  }

  async getArchiveEntries(checksumBitmask: number): Promise<ArchiveEntry<Archive>[]> {
    // See if this file is actually a .tar.gz
    try {
      return await new Tar(this.getFilePath()).getArchiveEntries(checksumBitmask);
    } catch {
      /* ignored */
    }

    const gzipHeaderFooter = await this.getHeaderFooterInfo();
    return [
      await ArchiveEntry.entryOf(
        {
          archive: this,
          entryPath: '', // let CandidateExtensionCorrector sort it out
          ...gzipHeaderFooter,
        },
        checksumBitmask,
      ),
    ];
  }

  private async getHeaderFooterInfo(): Promise<GzipHeaderFooter> {
    const file = await IOFile.fileFrom(this.getFilePath(), 'r');
    try {
      const header = await file.readAt(0, 10);
      if (header[0] !== 0x1f || header[1] !== 0x8b) {
        // Not a valid gzip file
        return {};
      }
      const flags = header[3];

      let filename = '';
      if (flags & 0x08) {
        let offset = 10;
        if (flags & 0x04) {
          // Skip FEXTRA field
          offset += 2 + (await file.readAt(offset, 2)).readUInt16LE();
        }
        // Parse FNAME header
        while (!file.isEOF()) {
          filename += (await file.readAt(offset, 256)).toString('latin1');
          const nullByteIdx = filename.indexOf('\0');
          if (nullByteIdx !== -1) {
            filename = filename.slice(0, nullByteIdx);
            break;
          }
        }
      }

      const footer = await file.readAt(file.getSize() - 8, 8);
      const crc32 = footer.readUInt32LE().toString(16).toLowerCase();
      const size = footer.readUInt32LE(4);

      return { filename, crc32, size };
    } finally {
      await file.close();
    }
  }

  async extractEntryToFile(_entryPath: string, extractedFilePath: string): Promise<void> {
    await stream.promises.pipeline(
      fs.createReadStream(this.getFilePath()),
      zlib.createGunzip(),
      fs.createWriteStream(extractedFilePath),
    );
  }

  async extractEntryToStream<T>(
    _entryPath: string,
    callback: (readable: stream.Readable) => Promise<T> | T,
  ): Promise<T> {
    const readable = stream.pipeline(
      fs.createReadStream(this.getFilePath()),
      zlib.createGunzip(),
      (err) => {
        // The manual .destroy() call below will cause an error here
        if (err && err.code !== 'ABORT_ERR') {
          throw err;
        }
      },
    );
    try {
      return await callback(readable);
    } finally {
      readable.destroy();
    }
  }
}
