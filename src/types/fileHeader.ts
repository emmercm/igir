import fs from 'fs';

import Constants from '../constants.js';

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

  readonly headerOffsetBytes: number;

  readonly headerValue: string;

  readonly dataOffsetBytes: number;

  readonly fileExtension: string;

  private constructor(
    headerOffset: number,
    headerValue: string,
    dataOffset: number,
    fileExtension: string,
  ) {
    this.headerOffsetBytes = headerOffset;
    this.headerValue = headerValue;
    this.dataOffsetBytes = dataOffset;
    this.fileExtension = fileExtension;
  }

  static getByName(headerName: string): FileHeader | undefined {
    return this.HEADERS[headerName];
  }

  fileHasHeader(filePath: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const stream = fs.createReadStream(filePath, {
        start: this.headerOffsetBytes,
        end: this.headerOffsetBytes + this.headerValue.length / 2 - 1,
        highWaterMark: Constants.FILE_READING_CHUNK_SIZE,
      });

      const chunks: Buffer[] = [];
      stream.on('data', (chunk) => {
        chunks.push(Buffer.from(chunk));
      });
      stream.on('end', () => {
        const header = Buffer.concat(chunks).toString('hex');
        resolve(header.toUpperCase() === this.headerValue.toUpperCase());
      });

      stream.on('error', (err) => reject(err));
    });
  }
}
