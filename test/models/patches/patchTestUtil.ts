import path from 'node:path';
import zlib from 'node:zlib';

import Temp from '../../../src/globals/temp.js';
import File from '../../../src/models/files/file.js';
import type Patch from '../../../src/models/patches/patch.js';
import FsUtil from '../../../src/utils/fsUtil.js';

export type PatchFrom = (file: File) => Patch | Promise<Patch>;

export interface ParsedPatch {
  crcBefore: ReturnType<Patch['getCrcBefore']>;
  crcAfter: ReturnType<Patch['getCrcAfter']>;
  sizeAfter: ReturnType<Patch['getSizeAfter']>;
}

/** Sixteen sequential bytes, the default input ROM for small unit tests */
export const INPUT16 = '000102030405060708090a0b0c0d0e0f';

/**
 * Write {@link patchHex} to a temp file named {@link fileName}, then call {@link callback} with
 * it and clean up afterward.
 */
export async function withPatchFile<T>(
  fileName: string,
  patchHex: string,
  callback: (file: File, tempDir: string) => T | Promise<T>,
): Promise<T> {
  const tempDir = await FsUtil.mkdtemp(Temp.getTempDir());
  try {
    const filePath = path.join(tempDir, fileName);
    await FsUtil.writeFile(filePath, Buffer.from(patchHex, 'hex'));
    return await callback(await File.fileOf({ filePath }), tempDir);
  } finally {
    await FsUtil.rm(tempDir, { recursive: true, force: true });
  }
}

/**
 * Parse a patch from hex and return the identifying values it declares.
 */
export async function parsePatch(
  patchFrom: PatchFrom,
  fileName: string,
  patchHex: string,
): Promise<ParsedPatch> {
  return await withPatchFile(fileName, patchHex, async (file) => {
    const patch = await patchFrom(file);
    return {
      crcBefore: patch.getCrcBefore(),
      crcAfter: patch.getCrcAfter(),
      sizeAfter: patch.getSizeAfter(),
    };
  });
}

/**
 * Parse a patch from hex, apply it to {@link inputHex}, and return the output.
 */
export async function applyPatch(
  patchFrom: PatchFrom,
  fileName: string,
  patchHex: string,
  inputHex: string,
): Promise<Buffer> {
  return await withPatchFile(fileName, patchHex, async (file, tempDir) => {
    const patch = await patchFrom(file);
    const inputPath = path.join(tempDir, 'input.rom');
    await FsUtil.writeFile(inputPath, Buffer.from(inputHex, 'hex'));
    const outputPath = path.join(tempDir, 'output.rom');
    await patch.createPatchedFile(await File.fileOf({ filePath: inputPath }), outputPath);
    return await FsUtil.readFile(outputPath);
  });
}

/**
 * Bytes that differ from their neighbors and are never 0x00, so misplaced copies are caught.
 */
export function patterned(size: number, seed = 0): Buffer {
  return Buffer.from(Array.from({ length: size }, (_value, idx) => ((idx + seed) % 255) + 1));
}

/**
 * Encode a UPS/BPS-style variable-length unsigned integer.
 */
export function encodeUpsUint(value: number): Buffer {
  const bytes: number[] = [];
  let remaining = value;
  let isLastByte = false;
  while (!isLastByte) {
    const bits = remaining % 128;
    remaining = Math.floor(remaining / 128);
    isLastByte = remaining === 0;
    if (isLastByte) {
      bytes.push(0x80 | bits);
    } else {
      bytes.push(bits);
      remaining -= 1;
    }
  }
  return Buffer.from(bytes);
}

/**
 * Encode a little-endian CRC32, as UPS and BPS patches store it.
 */
export function encodeCrc32(data: Buffer): Buffer {
  const crc = Buffer.alloc(4);
  crc.writeUInt32LE(zlib.crc32(data));
  return crc;
}
