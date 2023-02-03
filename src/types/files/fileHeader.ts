import path from 'path';
import { Readable } from 'stream';

export default class FileHeader {
  private static readonly HEADERS: { [key: string]:FileHeader } = {
    // http://7800.8bitdev.org/index.php/A78_Header_Specification
    'No-Intro_A7800.xml': new FileHeader(1, '415441524937383030', 128, '.a78'),

    // https://atarigamer.com/lynx/lnxhdrgen
    'No-Intro_LNX.xml': new FileHeader(0, '4C594E58', 64, '.lnx', '.lyx'),

    // https://www.nesdev.org/wiki/INES
    'No-Intro_NES.xml': new FileHeader(0, '4E4553', 16, '.nes'),

    // https://www.nesdev.org/wiki/FDS_file_format
    'No-Intro_FDS.xml': new FileHeader(0, '464453', 16, '.fds'),

    // https://en.wikibooks.org/wiki/Super_NES_Programming/SNES_memory_map#The_SNES_header
    SMC: new FileHeader(3, '00'.repeat(509), 512, '.smc', '.sfc'),
  };

  private static readonly MAX_HEADER_LENGTH_BYTES = Object.values(FileHeader.HEADERS)
    .reduce((max, fileHeader) => Math.max(
      max,
      fileHeader.headerOffsetBytes + fileHeader.headerValue.length / 2,
    ), 0);

  private readonly headerOffsetBytes: number;

  private readonly headerValue: string;

  private readonly dataOffsetBytes: number;

  private readonly headeredFileExtension: string;

  private readonly unheaderedFileExtension: string;

  private constructor(
    headerOffsetBytes: number,
    headerValue: string,
    dataOffset: number,
    headeredFileExtension: string,
    unheaderedFileExtension?: string,
  ) {
    this.headerOffsetBytes = headerOffsetBytes;
    this.headerValue = headerValue;
    this.dataOffsetBytes = dataOffset;
    this.headeredFileExtension = headeredFileExtension;
    this.unheaderedFileExtension = unheaderedFileExtension || headeredFileExtension;
  }

  static getSupportedExtensions(): string[] {
    return Object.values(this.HEADERS).map((header) => header.headeredFileExtension).sort();
  }

  static headerFromFilename(filePath: string): FileHeader | undefined {
    const headers = Object.values(this.HEADERS);
    for (let i = 0; i < headers.length; i += 1) {
      const header = headers[i];
      if (header.headeredFileExtension.toLowerCase() === path.extname(filePath).toLowerCase()
        || (header.unheaderedFileExtension?.toLowerCase() || '') === path.extname(filePath).toLowerCase()
      ) {
        return header;
      }
    }
    return undefined;
  }

  private static async readHeaderHex(
    stream: Readable,
    start: number,
    end: number,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      stream.resume();

      const chunks: Buffer[] = [];
      const resolveHeader: () => void = () => {
        const header = Buffer.concat(chunks)
          .subarray(start, end)
          .toString('hex')
          .toUpperCase();
        resolve(header);
      };

      stream.on('data', (chunk) => {
        chunks.push(Buffer.from(chunk));

        // Stop reading when we get enough data, trigger a 'close' event
        if (chunks.reduce((sum, buff) => sum + buff.length, 0) >= end) {
          resolveHeader();
          stream.destroy();
        }
      });

      stream.on('end', resolveHeader);
      stream.on('error', reject);
    });
  }

  static async headerFromFileStream(stream: Readable): Promise<FileHeader | undefined> {
    const fileHeader = await FileHeader.readHeaderHex(stream, 0, this.MAX_HEADER_LENGTH_BYTES);

    const headers = Object.values(this.HEADERS);
    for (let i = 0; i < headers.length; i += 1) {
      const header = headers[i];
      const headerValue = fileHeader.slice(
        header.headerOffsetBytes * 2,
        header.headerOffsetBytes * 2 + header.headerValue.length,
      );
      if (headerValue === header.headerValue) {
        return header;
      }
    }

    return undefined;
  }

  getDataOffsetBytes(): number {
    return this.dataOffsetBytes;
  }

  getHeaderedFileExtension(): string {
    return this.headeredFileExtension;
  }

  getUnheaderedFileExtension(): string {
    return this.unheaderedFileExtension;
  }

  async fileHasHeader(stream: Readable): Promise<boolean> {
    const header = await FileHeader.readHeaderHex(
      stream,
      this.headerOffsetBytes,
      this.headerOffsetBytes + this.headerValue.length / 2,
    );
    return header.toUpperCase() === this.headerValue.toUpperCase();
  }
}
