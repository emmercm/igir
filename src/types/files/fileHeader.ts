import fs from 'fs';
import path from 'path';

import Constants from '../../constants.js';

export default class FileHeader {
  private static readonly HEADERS: { [key: string]:FileHeader } = {
    // http://7800.8bitdev.org/index.php/A78_Header_Specification
    'No-Intro_A7800.xml': new FileHeader(1, '415441524937383030', 128, '.a78'),

    // https://atarigamer.com/lynx/lnxhdrgen
    'No-Intro_LNX.xml': new FileHeader(0, '4C594E58', 64, '.lnx'),

    // https://www.nesdev.org/wiki/INES
    'No-Intro_NES.xml': new FileHeader(0, '4E4553', 16, '.nes'),

    // https://www.nesdev.org/wiki/FDS_file_format
    'No-Intro_FDS.xml': new FileHeader(0, '464453', 16, '.fds'),
  };

  private static readonly MAX_HEADER_LENGTH = Object.values(FileHeader.HEADERS)
    .reduce((max, fileHeader) => Math.max(
      max,
      fileHeader.headerOffsetBytes + fileHeader.headerValue.length / 2,
    ), 0);

  readonly headerOffsetBytes: number;

  readonly headerValue: string;

  readonly dataOffsetBytes: number;

  readonly fileExtension: string;

  private constructor(
    headerOffsetBytes: number,
    headerValue: string,
    dataOffset: number,
    fileExtension: string,
  ) {
    this.headerOffsetBytes = headerOffsetBytes;
    this.headerValue = headerValue;
    this.dataOffsetBytes = dataOffset;
    this.fileExtension = fileExtension;
  }

  static getForName(headerName: string): FileHeader | undefined {
    return this.HEADERS[headerName];
  }

  static getForFilename(filePath: string): FileHeader | undefined {
    const headers = Object.values(this.HEADERS);
    for (let i = 0; i < headers.length; i += 1) {
      const header = headers[i];
      if (header.fileExtension.toLowerCase() === path.extname(filePath).toLowerCase()) {
        return header;
      }
    }
    return undefined;
  }

  private static async readHeader(filePath: string, start: number, end: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const stream = fs.createReadStream(filePath, {
        start,
        end,
        highWaterMark: Constants.FILE_READING_CHUNK_SIZE,
      });

      const chunks: Buffer[] = [];
      stream.on('data', (chunk) => {
        chunks.push(Buffer.from(chunk));
      });
      stream.on('end', () => {
        const header = Buffer.concat(chunks).toString('hex');
        resolve(header.toUpperCase());
      });

      stream.on('error', (err) => reject(err));
    });
  }

  static async getForFileContents(filePath: string): Promise<FileHeader | undefined> {
    const fileHeader = await FileHeader.readHeader(filePath, 0, this.MAX_HEADER_LENGTH);

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

  async fileHasHeader(filePath: string): Promise<boolean> {
    const header = await FileHeader.readHeader(
      filePath,
      this.headerOffsetBytes,
      this.headerOffsetBytes + this.headerValue.length / 2 - 1,
    );
    return header.toUpperCase() === this.headerValue.toUpperCase();
  }
}
