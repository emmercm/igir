import { Readable } from 'stream';

import File from '../files/file.js';
import BPSPatch from './bpsPatch.js';
import IPSPatch from './ipsPatch.js';
import NinjaPatch from './ninjaPatch.js';
import Patch from './patch.js';
import PPFPatch from './ppfPatch.js';
import UPSPatch from './upsPatch.js';
import VcdiffPatch from './vcdiffPatch.js';

interface PatchParser {
  extensions: string[],
  magicHeaders: Buffer[],
  factory: (file: File) => Promise<Patch> | Patch
}

/**
 * NOTE(cemmer): this file exists to prevent circular dependencies between Patch and its children.
 */
export default class PatchFactory {
  private static readonly PATCH_PARSERS: PatchParser[] = [
    {
      extensions: BPSPatch.SUPPORTED_EXTENSIONS,
      magicHeaders: [BPSPatch.MAGIC_HEADER],
      factory: BPSPatch.patchFrom,
    },
    {
      extensions: IPSPatch.SUPPORTED_EXTENSIONS,
      magicHeaders: IPSPatch.MAGIC_HEADERS,
      factory: IPSPatch.patchFrom,
    },
    {
      extensions: NinjaPatch.SUPPORTED_EXTENSIONS,
      magicHeaders: [NinjaPatch.MAGIC_HEADER],
      factory: NinjaPatch.patchFrom,
    },
    {
      extensions: PPFPatch.SUPPORTED_EXTENSIONS,
      magicHeaders: [PPFPatch.MAGIC_HEADER],
      factory: PPFPatch.patchFrom,
    },
    {
      extensions: UPSPatch.SUPPORTED_EXTENSIONS,
      magicHeaders: [UPSPatch.MAGIC_HEADER],
      factory: UPSPatch.patchFrom,
    },
    {
      extensions: VcdiffPatch.SUPPORTED_EXTENSIONS,
      magicHeaders: [VcdiffPatch.MAGIC_HEADER],
      factory: VcdiffPatch.patchFrom,
    },
  ];

  private static readonly MAX_HEADER_LENGTH_BYTES = Object.values(PatchFactory.PATCH_PARSERS)
    .flatMap((parser) => parser.magicHeaders)
    .reduce((max, magicHeader) => Math.max(max, magicHeader.length), 0);

  static getSupportedExtensions(): string[] {
    return Object.values(PatchFactory.PATCH_PARSERS)
      .flatMap((parser) => parser.extensions)
      .filter((ext, idx, exts) => exts.indexOf(ext) === idx)
      .sort();
  }

  static async patchFromFilename(file: File): Promise<Patch | undefined> {
    const filePath = file.getExtractedFilePath();

    const parsers = Object.values(this.PATCH_PARSERS);
    for (let i = 0; i < parsers.length; i += 1) {
      const parser = parsers[i];
      if (parser.extensions.some((ext) => filePath.toLowerCase().endsWith(ext))) {
        return parser.factory(file);
      }
    }
    return undefined;
  }

  private static async readHeaderHex(stream: Readable, length: number): Promise<string> {
    return new Promise((resolve, reject) => {
      stream.resume();

      const chunks: Buffer[] = [];
      const resolveHeader: () => void = () => {
        const header = Buffer.concat(chunks)
          .subarray(0, length)
          .toString('hex')
          .toLowerCase();
        resolve(header);
      };

      stream.on('data', (chunk) => {
        chunks.push(Buffer.from(chunk));

        // Stop reading when we get enough data, trigger a 'close' event
        if (chunks.reduce((sum, buff) => sum + buff.length, 0) >= length) {
          resolveHeader();
          stream.destroy();
        }
      });

      stream.on('end', () => {
        // We read the entire file without closing prematurely, return
        resolveHeader();
      });

      stream.on('error', (err) => reject(err));
    });
  }

  static async patchFromFileContents(file: File): Promise<Patch | undefined> {
    const fileHeader = await file.extractToStream(
      async (stream) => PatchFactory.readHeaderHex(stream, this.MAX_HEADER_LENGTH_BYTES),
    );

    const parsers = Object.values(this.PATCH_PARSERS);
    for (let i = 0; i < parsers.length; i += 1) {
      const parser = parsers[i];
      if (parser.magicHeaders.some((magicHeader) => fileHeader.startsWith(magicHeader.toString('hex')))) {
        return parser.factory(file);
      }
    }
    return undefined;
  }
}
