import fs from 'node:fs';
import stream from 'node:stream';
import zlib from 'node:zlib';

import IOFile from '../../../polyfill/ioFile.js';
import IgirException from '../../exceptions/igirException.js';
import Archive from './archive.js';
import ArchiveEntry from './archiveEntry.js';
import Tar from './tar.js';

interface GzipHeaderFooter {
  fname?: string;
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

  canExtract(): boolean {
    return true;
  }

  hasMeaningfulEntryPaths(): boolean {
    return true;
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
          entryPath: gzipHeaderFooter.fname ?? '', // let CandidateExtensionCorrector sort it out
          size: gzipHeaderFooter.size,
          crc32: gzipHeaderFooter.crc32,
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
        throw new IgirException('missing gzip magic number');
      }
      const flags = header[3];

      let fname = '';
      if (flags & 0x08) {
        let offset = 10;
        if (flags & 0x04) {
          // Skip FEXTRA field
          offset += 2 + (await file.readAt(offset, 2)).readUInt16LE();
        }
        // Parse FNAME header
        while (!file.isEOF()) {
          fname += (await file.readAt(offset, 256)).toString('latin1');
          const nullByteIdx = fname.indexOf('\0');
          if (nullByteIdx !== -1) {
            fname = fname.slice(0, nullByteIdx);
            break;
          }
        }
      }

      const footer = await file.readAt(file.getSize() - 8, 8);
      const crc32 = footer.readUInt32LE().toString(16).toLowerCase();
      const size = footer.readUInt32LE(4);

      return { fname, crc32, size };
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
    const source = fs.createReadStream(this.getFilePath());
    const gunzip = zlib.createGunzip();
    const pipelinePromise = stream.promises.pipeline(source, gunzip);

    try {
      const result = await callback(gunzip);

      gunzip.destroy();
      source.destroy();
      try {
        await pipelinePromise;
      } catch (error) {
        // The .destroy() calls above can cause ABORT_ERR
        if ((error as NodeJS.ErrnoException).code !== 'ABORT_ERR') {
          throw error;
        }
      }

      return result;
    } catch (error) {
      gunzip.destroy();
      source.destroy();
      await pipelinePromise.catch(() => {
        /* ignored */
      });
      throw error;
    }
  }
}
