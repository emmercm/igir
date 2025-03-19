import path from 'node:path';
import { Readable } from 'node:stream';

import { Memoize } from 'typescript-memoize';

import ArrayPoly from '../../polyfill/arrayPoly.js';

export default class ROMHeader {
  private static readonly HEADERS: Record<string, ROMHeader> = {
    // http://7800.8bitdev.org/index.php/A78_Header_Specification
    'No-Intro_A7800.xml': new ROMHeader(1, '415441524937383030', 128, '.a78'),

    // https://atarigamer.com/lynx/lnxhdrgen
    'No-Intro_LNX.xml': new ROMHeader(0, '4C594E58', 64, '.lnx', '.lyx'),

    // https://www.nesdev.org/wiki/INES
    'No-Intro_NES.xml': new ROMHeader(0, '4E4553', 16, '.nes'),

    // https://www.nesdev.org/wiki/FDS_file_format
    'No-Intro_FDS.xml': new ROMHeader(0, '464453', 16, '.fds'),

    // https://en.wikibooks.org/wiki/Super_NES_Programming/SNES_memory_map#The_SNES_header
    SMC: new ROMHeader(3, '00'.repeat(509), 512, '.smc', '.sfc'),
    // https://file-extension.net/seeker/file_extension_smc
    // https://wiki.superfamicom.org/game-doctor
    SMC_GAME_DOCTOR_1: new ROMHeader(0, '00014D4520444F43544F522053462033', 512, '.smc', '.sfc'),
    SMC_GAME_DOCTOR_2: new ROMHeader(0, '47414D4520444F43544F522053462033', 512, '.smc', '.sfc'),
  };

  private static readonly MAX_HEADER_LENGTH_BYTES = Object.values(ROMHeader.HEADERS).reduce(
    (max, fileHeader) =>
      Math.max(max, fileHeader.headerOffsetBytes + fileHeader.headerValue.length / 2),
    0,
  );

  private readonly headerOffsetBytes: number;

  private readonly headerValue: string;

  private readonly dataOffsetBytes: number;

  private readonly headeredFileExtension: string;

  private readonly headerlessFileExtension: string;

  private constructor(
    headerOffsetBytes: number,
    headerValue: string,
    dataOffset: number,
    headeredFileExtension: string,
    headerlessFileExtension?: string,
  ) {
    this.headerOffsetBytes = headerOffsetBytes;
    this.headerValue = headerValue;
    this.dataOffsetBytes = dataOffset;
    this.headeredFileExtension = headeredFileExtension;
    this.headerlessFileExtension = headerlessFileExtension ?? headeredFileExtension;
  }

  static getSupportedExtensions(): string[] {
    return Object.values(this.HEADERS)
      .map((header) => header.headeredFileExtension)
      .reduce(ArrayPoly.reduceUnique(), [])
      .sort();
  }

  static getKnownHeaderCount(): number {
    return Object.keys(this.HEADERS).length;
  }

  static headerFromName(name: string): ROMHeader | undefined {
    return this.HEADERS[name];
  }

  static headerFromFilename(filePath: string): ROMHeader | undefined {
    const headers = Object.values(this.HEADERS);
    for (const header of headers) {
      if (
        header.headeredFileExtension.toLowerCase() === path.extname(filePath).toLowerCase() ||
        (header.headerlessFileExtension?.toLowerCase() ?? '') ===
          path.extname(filePath).toLowerCase()
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
        const header = Buffer.concat(chunks).subarray(start, end).toString('hex').toUpperCase();
        resolve(header);
      };

      stream.on('data', (chunk: Buffer) => {
        chunks.push(chunk);

        // Stop reading when we get enough data, trigger a 'close' event
        if (chunks.reduce((sum, buff) => sum + buff.length, 0) >= end) {
          resolveHeader();
          // WARN(cemmer): whatever created the stream may need to drain it!
        }
      });

      stream.on('end', resolveHeader);
      stream.on('error', reject);
    });
  }

  static async headerFromFileStream(stream: Readable): Promise<ROMHeader | undefined> {
    const fileHeader = await ROMHeader.readHeaderHex(stream, 0, this.MAX_HEADER_LENGTH_BYTES);

    const headers = Object.values(this.HEADERS);
    for (const header of headers) {
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

  @Memoize()
  getName(): string {
    return Object.keys(ROMHeader.HEADERS).find((name) => ROMHeader.HEADERS[name] === this)!;
  }

  getDataOffsetBytes(): number {
    return this.dataOffsetBytes;
  }

  getHeaderedFileExtension(): string {
    return this.headeredFileExtension;
  }

  getHeaderlessFileExtension(): string {
    return this.headerlessFileExtension;
  }
}
