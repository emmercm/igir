import IgirException from '../../exceptions/igirException.js';
import IOFile from '../../models/files/ioFile.js';
import type { FsReadCallback } from '../../streams/fsReadTransform.js';
import FsUtil from '../../utils/fsUtil.js';
import type File from '../files/file.js';
import Patch from './patch.js';

/**
 * WARN(cemmer): because UPS patches use nul-byte termination for records rather than some kind of
 * length identifier, patchers have to scan each record for its terminator, and large patches can
 * perform poorly if they contain many small records.
 * @see https://www.romhacking.net/documents/392/
 * @see https://github.com/btimofeev/UniPatcher/wiki/UPS
 * @see https://www.gamebrew.org/wiki/Upset
 */
export default class UPSPatch extends Patch {
  static readonly SUPPORTED_EXTENSIONS = ['.ups'];

  static readonly FILE_SIGNATURE = Buffer.from('UPS1');

  // The source CRC32, target CRC32, and patch CRC32 at the end of the patch
  private static readonly FOOTER_SIZE = 12;

  /**
   * Parse a .ups patch file and return a {@link UPSPatch}.
   */
  static async patchFrom(file: File): Promise<UPSPatch> {
    let crcBefore = '';
    let crcAfter = '';
    let targetSize = 0;

    await file.extractToIOFile(async (patchFile) => {
      patchFile.seek(this.FILE_SIGNATURE.length);
      await super.readUpsUint(patchFile); // source size
      targetSize = await super.readUpsUint(patchFile);
      if (patchFile.getPosition() > patchFile.getSize() - this.FOOTER_SIZE) {
        throw new IgirException(`UPS patch is truncated: ${file.toString()}`);
      }

      patchFile.seek(patchFile.getSize() - this.FOOTER_SIZE);

      crcBefore = (await patchFile.readNext(4)).reverse().toString('hex');

      crcAfter = (await patchFile.readNext(4)).reverse().toString('hex');

      // Validate the patch contents

      const patchChecksumExpected = (await patchFile.readNext(4)).reverse().toString('hex');
      const patchChecksumActual = await super.crc32Range(patchFile, 0, patchFile.getSize() - 4);
      if (patchChecksumActual !== patchChecksumExpected) {
        throw new IgirException(
          `UPS patch is invalid, CRC of contents (${patchChecksumActual}) doesn't match expected (${patchChecksumExpected}): ${file.toString()}`,
        );
      }
    });

    if (crcBefore.length !== 8 || crcAfter.length !== 8) {
      throw new IgirException(`couldn't parse base file CRC for patch: ${file.toString()}`);
    }

    return new UPSPatch(file, crcBefore, crcAfter, targetSize);
  }

  /**
   * Apply this patch to the input ROM file and write the patched result to the output path.
   */
  async createPatchedFile(
    inputRomFile: File,
    outputRomPath: string,
    callback?: FsReadCallback,
  ): Promise<void> {
    await this.getFile().extractToIOFile(async (patchFile) => {
      const header = await patchFile.readNext(4);
      if (!header.equals(UPSPatch.FILE_SIGNATURE)) {
        throw new IgirException(`UPS patch header is invalid: ${this.getFile().toString()}`);
      }

      const sourceSize = await Patch.readUpsUint(patchFile);
      if (inputRomFile.getSize() !== sourceSize) {
        throw new IgirException(
          `UPS patch expected ROM size of ${FsUtil.sizeReadable(sourceSize)}: ${patchFile.getPathLike().toString()}`,
        );
      }
      const targetSize = await Patch.readUpsUint(patchFile);

      await UPSPatch.writeOutputFile(inputRomFile, outputRomPath, patchFile, targetSize, callback);
    });
  }

  private static async writeOutputFile(
    inputRomFile: File,
    outputRomPath: string,
    patchFile: IOFile,
    targetSize: number,
    callback?: FsReadCallback,
  ): Promise<void> {
    // The target starts as a copy of the source, and blocks are XORed into it in place
    await inputRomFile.extractToFile(outputRomPath);
    const targetFile = await IOFile.fileFrom(outputRomPath, 'r+');
    try {
      await this.applyPatch(patchFile, targetFile, callback);
      await targetFile.truncate(targetSize);
    } finally {
      await targetFile.close();
    }
  }

  private static async applyPatch(
    patchFile: IOFile,
    targetFile: IOFile,
    callback?: FsReadCallback,
  ): Promise<void> {
    while (patchFile.getPosition() < patchFile.getSize() - this.FOOTER_SIZE) {
      const relativeOffset = await super.readUpsUint(patchFile);
      targetFile.skipNext(relativeOffset);

      await this.applyPatchBlock(patchFile, targetFile);

      targetFile.skipNext(1);

      if (callback === undefined) {
        continue;
      }
      const progressPercentage = patchFile.getPosition() / patchFile.getSize();
      callback(Math.floor(progressPercentage * targetFile.getSize()));
    }
  }

  /**
   * XOR the patch's next 0x00-terminated block into the target at its seek position, a chunk at a
   * time, leaving the patch positioned past the terminator.
   */
  private static async applyPatchBlock(patchFile: IOFile, targetFile: IOFile): Promise<void> {
    const patchBlocksEnd = patchFile.getSize() - this.FOOTER_SIZE;

    while (patchFile.getPosition() < patchBlocksEnd) {
      const { data: xorData, isDelimiterFound } = await patchFile.readUntil(
        0x00,
        patchBlocksEnd - patchFile.getPosition(),
      );

      // The target still holds the source's bytes here, and bytes past the end of the source are
      // 0x00
      const sourceData = await targetFile.peekNext(xorData.length);
      for (const [i, sourceDatum] of sourceData.entries()) {
        xorData[i] ^= sourceDatum;
      }
      await targetFile.write(xorData);

      if (isDelimiterFound) {
        return;
      }
    }

    throw new IgirException(
      `UPS patch failed to read 0x00 block termination: ${patchFile.getPathLike().toString()}`,
    );
  }
}
