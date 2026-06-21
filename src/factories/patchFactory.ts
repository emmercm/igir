import type { Readable } from 'node:stream';

import type File from '../models/files/file.js';
import APSPatch from '../models/patches/apsPatch.js';
import BPSPatch from '../models/patches/bpsPatch.js';
import DPSPatch from '../models/patches/dpsPatch.js';
import IPSPatch from '../models/patches/ipsPatch.js';
import NinjaPatch from '../models/patches/ninjaPatch.js';
import type Patch from '../models/patches/patch.js';
import PPFPatch from '../models/patches/ppfPatch.js';
import UPSPatch from '../models/patches/upsPatch.js';
import VcdiffPatch from '../models/patches/vcdiffPatch.js';
import ArrayUtil from '../utils/arrayUtil.js';

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
      factory: APSPatch.patchFrom.bind(APSPatch),
    },
    {
      extensions: BPSPatch.SUPPORTED_EXTENSIONS,
      fileSignatures: [BPSPatch.FILE_SIGNATURE],
      factory: BPSPatch.patchFrom.bind(BPSPatch),
    },
    {
      extensions: DPSPatch.SUPPORTED_EXTENSIONS,
      fileSignatures: [],
      factory: DPSPatch.patchFrom.bind(DPSPatch),
    },
    {
      extensions: IPSPatch.SUPPORTED_EXTENSIONS,
      fileSignatures: IPSPatch.FILE_SIGNATURES,
      factory: IPSPatch.patchFrom.bind(IPSPatch),
    },
    {
      extensions: NinjaPatch.SUPPORTED_EXTENSIONS,
      fileSignatures: [NinjaPatch.FILE_SIGNATURE],
      factory: NinjaPatch.patchFrom.bind(NinjaPatch),
    },
    {
      extensions: PPFPatch.SUPPORTED_EXTENSIONS,
      fileSignatures: [PPFPatch.FILE_SIGNATURE],
      factory: PPFPatch.patchFrom.bind(PPFPatch),
    },
    {
      extensions: UPSPatch.SUPPORTED_EXTENSIONS,
      fileSignatures: [UPSPatch.FILE_SIGNATURE],
      factory: UPSPatch.patchFrom.bind(UPSPatch),
    },
    {
      extensions: VcdiffPatch.SUPPORTED_EXTENSIONS,
      fileSignatures: [VcdiffPatch.FILE_SIGNATURE],
      factory: VcdiffPatch.patchFrom.bind(VcdiffPatch),
    },
  ];

  private static readonly MAX_HEADER_LENGTH_BYTES = Object.values(PatchFactory.PATCH_PARSERS)
    .flatMap((parser) => parser.fileSignatures)
    .reduce((max, fileSignature) => Math.max(max, fileSignature.length), 0);

  static getSupportedExtensions(): string[] {
    return Object.values(PatchFactory.PATCH_PARSERS)
      .flatMap((parser) => parser.extensions)
      .reduce(ArrayUtil.reduceUnique(), [])
      .toSorted();
  }

  /**
   * Return a {@link Patch} for a file by matching its filename extension against the supported
   * patch formats, or undefined if no extension matches.
   */
  static async patchFromFilename(file: File): Promise<Patch | undefined> {
    const filePath = file.getExtractedFilePath();

    const parsers = Object.values(this.PATCH_PARSERS);
    for (const parser of parsers) {
      if (parser.extensions.some((ext) => filePath.toLowerCase().endsWith(ext))) {
        return await parser.factory(file);
      }
    }
    return undefined;
  }

  private static async readHeaderHex(readable: Readable, length: number): Promise<string> {
    const chunks: Buffer[] = [];
    let readBytes = 0;

    for await (const chunk of readable as AsyncIterable<Buffer>) {
      if (chunk.length > 0) {
        chunks.push(chunk);
        readBytes += chunk.length;
      }

      // Stop reading when we get enough data, trigger a 'close' event
      if (readBytes >= length) {
        break;
      }
    }

    return Buffer.concat(chunks).subarray(0, length).toString('hex').toLowerCase();
  }

  /**
   * Return a {@link Patch} for a file by reading its leading bytes and matching them against
   * the known patch-format file signatures, or undefined if no signature matches.
   */
  static async patchFromFileContents(file: File): Promise<Patch | undefined> {
    const fileHeader = await file.createReadStream(
      async (readable) => await PatchFactory.readHeaderHex(readable, this.MAX_HEADER_LENGTH_BYTES),
    );

    const parsers = Object.values(this.PATCH_PARSERS);
    for (const parser of parsers) {
      if (
        parser.fileSignatures.some((fileSignature) =>
          fileHeader.startsWith(fileSignature.toString('hex')),
        )
      ) {
        return await parser.factory(file);
      }
    }
    return undefined;
  }
}
