import { Readable } from 'node:stream';

import ArrayPoly from '../../polyfill/arrayPoly.js';
import File from '../files/file.js';
import APSPatch from './apsPatch.js';
import BPSPatch from './bpsPatch.js';
import DPSPatch from './dpsPatch.js';
import IPSPatch from './ipsPatch.js';
import NinjaPatch from './ninjaPatch.js';
import Patch from './patch.js';
import PPFPatch from './ppfPatch.js';
import UPSPatch from './upsPatch.js';
import VcdiffPatch from './vcdiffPatch.js';

interface PatchParser {
  extensions: string[];
  fileSignatures: Buffer[];
  factory: (file: File) => Promise<Patch> | Patch;
}

/**
 * NOTE(cemmer): this file exists to prevent circular dependencies between Patch and its children.
 */
export default class PatchFactory {
  private static readonly PATCH_PARSERS: PatchParser[] = [
    {
      extensions: APSPatch.SUPPORTED_EXTENSIONS,
      fileSignatures: [APSPatch.FILE_SIGNATURE],
      factory: APSPatch.patchFrom,
    },
    {
      extensions: BPSPatch.SUPPORTED_EXTENSIONS,
      fileSignatures: [BPSPatch.FILE_SIGNATURE],
      factory: BPSPatch.patchFrom,
    },
    {
      extensions: DPSPatch.SUPPORTED_EXTENSIONS,
      fileSignatures: [],
      factory: DPSPatch.patchFrom,
    },
    {
      extensions: IPSPatch.SUPPORTED_EXTENSIONS,
      fileSignatures: IPSPatch.FILE_SIGNATURES,
      factory: IPSPatch.patchFrom,
    },
    {
      extensions: NinjaPatch.SUPPORTED_EXTENSIONS,
      fileSignatures: [NinjaPatch.FILE_SIGNATURE],
      factory: NinjaPatch.patchFrom,
    },
    {
      extensions: PPFPatch.SUPPORTED_EXTENSIONS,
      fileSignatures: [PPFPatch.FILE_SIGNATURE],
      factory: PPFPatch.patchFrom,
    },
    {
      extensions: UPSPatch.SUPPORTED_EXTENSIONS,
      fileSignatures: [UPSPatch.FILE_SIGNATURE],
      factory: UPSPatch.patchFrom,
    },
    {
      extensions: VcdiffPatch.SUPPORTED_EXTENSIONS,
      fileSignatures: [VcdiffPatch.FILE_SIGNATURE],
      factory: VcdiffPatch.patchFrom,
    },
  ];

  private static readonly MAX_HEADER_LENGTH_BYTES = Object.values(PatchFactory.PATCH_PARSERS)
    .flatMap((parser) => parser.fileSignatures)
    .reduce((max, fileSignature) => Math.max(max, fileSignature.length), 0);

  static getSupportedExtensions(): string[] {
    return Object.values(PatchFactory.PATCH_PARSERS)
      .flatMap((parser) => parser.extensions)
      .reduce(ArrayPoly.reduceUnique(), [])
      .sort();
  }

  static async patchFromFilename(file: File): Promise<Patch | undefined> {
    const filePath = file.getExtractedFilePath();

    const parsers = Object.values(this.PATCH_PARSERS);
    for (const parser of parsers) {
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
        const header = Buffer.concat(chunks).subarray(0, length).toString('hex').toLowerCase();
        resolve(header);
      };

      stream.on('data', (chunk: Buffer) => {
        chunks.push(chunk);

        // Stop reading when we get enough data, trigger a 'close' event
        if (chunks.reduce((sum, buff) => sum + buff.length, 0) >= length) {
          resolveHeader();
          // WARN(cemmer): whatever created the stream may need to drain it!
        }
      });

      stream.on('end', resolveHeader);
      stream.on('error', reject);
    });
  }

  static async patchFromFileContents(file: File): Promise<Patch | undefined> {
    const fileHeader = await file.createReadStream(async (stream) =>
      PatchFactory.readHeaderHex(stream, this.MAX_HEADER_LENGTH_BYTES),
    );

    const parsers = Object.values(this.PATCH_PARSERS);
    for (const parser of parsers) {
      if (
        parser.fileSignatures.some((fileSignature) =>
          fileHeader.startsWith(fileSignature.toString('hex')),
        )
      ) {
        return parser.factory(file);
      }
    }
    return undefined;
  }
}
