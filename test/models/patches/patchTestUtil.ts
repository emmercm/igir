import path from 'node:path';

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
 * Parse a patch from hex, apply it to {@link inputHex}, and return the output as hex.
 */
export async function applyPatch(
  patchFrom: PatchFrom,
  fileName: string,
  patchHex: string,
  inputHex: string,
): Promise<string> {
  return await withPatchFile(fileName, patchHex, async (file, tempDir) => {
    const patch = await patchFrom(file);
    const inputPath = path.join(tempDir, 'input.rom');
    await FsUtil.writeFile(inputPath, Buffer.from(inputHex, 'hex'));
    const outputPath = path.join(tempDir, 'output.rom');
    await patch.createPatchedFile(await File.fileOf({ filePath: inputPath }), outputPath);
    return (await FsUtil.readFile(outputPath)).toString('hex');
  });
}
