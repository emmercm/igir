import IgirException from '../../exceptions/igirException.js';
import Defaults from '../../globals/defaults.js';
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

      patchFile.seek(patchFile.getSize() - 12);

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
    await inputRomFile.extractToFile(outputRomPath);
    await inputRomFile.extractToIOFile(async (sourceFile) => {
      const targetFile = await IOFile.fileFrom(outputRomPath, 'r+');
      try {
        await this.applyPatch(patchFile, sourceFile, targetFile, callback);
        await targetFile.truncate(targetSize);
      } finally {
        await targetFile.close();
      }
    });
  }

  private static async applyPatch(
    patchFile: IOFile,
    sourceFile: IOFile,
    targetFile: IOFile,
    callback?: FsReadCallback,
  ): Promise<void> {
    while (patchFile.getPosition() < patchFile.getSize() - 12) {
      const relativeOffset = await super.readUpsUint(patchFile);
      sourceFile.skipNext(relativeOffset);
      targetFile.skipNext(relativeOffset);

      await this.applyPatchBlock(patchFile, sourceFile, targetFile);

      sourceFile.skipNext(1);
      targetFile.skipNext(1);

      if (callback === undefined) {
        continue;
      }
      const progressPercentage = patchFile.getPosition() / patchFile.getSize();
      callback(Math.floor(progressPercentage * targetFile.getSize()));
    }
  }

  /**
   * Write the XOR of the patch's next 0x00-terminated block and the source to the target, a chunk
   * at a time, leaving the patch positioned past the terminator.
   */
  private static async applyPatchBlock(
    patchFile: IOFile,
    sourceFile: IOFile,
    targetFile: IOFile,
  ): Promise<void> {
    const patchBlocksEnd = patchFile.getSize() - 12;

    while (patchFile.getPosition() < patchBlocksEnd) {
      const xorChunk = await patchFile.readAt(
        patchFile.getPosition(),
        Math.min(patchBlocksEnd - patchFile.getPosition(), Defaults.FILE_READING_CHUNK_SIZE),
      );
      if (xorChunk.length === 0) {
        break;
      }
      const terminatorIndex = xorChunk.indexOf(0x00);
      const xorData = terminatorIndex === -1 ? xorChunk : xorChunk.subarray(0, terminatorIndex);

      // Bytes past the end of the source are 0x00
      const sourceData = await sourceFile.readAt(sourceFile.getPosition(), xorData.length);
      for (const [i, sourceDatum] of sourceData.entries()) {
        xorData[i] ^= sourceDatum;
      }
      await targetFile.write(xorData);
      sourceFile.skipNext(xorData.length);
      patchFile.skipNext(xorData.length);

      if (terminatorIndex !== -1) {
        patchFile.skipNext(1);
        return;
      }
    }

    throw new IgirException(
      `UPS patch failed to read 0x00 block termination: ${patchFile.getPathLike().toString()}`,
    );
  }
}
