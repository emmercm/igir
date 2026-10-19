import IgirException from '../../exceptions/igirException.js';
import IOFile from '../../models/files/ioFile.js';
import type { FsReadCallback } from '../../streams/fsReadTransform.js';
import FsUtil from '../../utils/fsUtil.js';
import type File from '../files/file.js';
import Patch from './patch.js';

const BPSAction = {
  SOURCE_READ: 0,
  TARGET_READ: 1,
  SOURCE_COPY: 2,
  TARGET_COPY: 3,
} as const;
type BPSActionValue = (typeof BPSAction)[keyof typeof BPSAction];

/**
 * @see https://github.com/blakesmith/rombp/blob/master/docs/bps_spec.md
 * @see https://github.com/btimofeev/UniPatcher/wiki/BPS
 */
export default class BPSPatch extends Patch {
  static readonly SUPPORTED_EXTENSIONS = ['.bps'];

  static readonly FILE_SIGNATURE = Buffer.from('BPS1');

  // The source CRC32, target CRC32, and patch CRC32 at the end of the patch
  private static readonly FOOTER_SIZE = 12;

  /**
   * Parse a .bps patch file and return a {@link BPSPatch}.
   */
  static async patchFrom(file: File): Promise<BPSPatch> {
    let crcBefore = '';
    let crcAfter = '';
    let targetSize = 0;

    await file.extractToIOFile(async (patchIOFile) => {
      patchIOFile.seek(this.FILE_SIGNATURE.length);
      await super.readUpsUint(patchIOFile); // source size
      targetSize = await super.readUpsUint(patchIOFile);
      if (patchIOFile.getPosition() > patchIOFile.getSize() - this.FOOTER_SIZE) {
        throw new IgirException(`BPS patch is truncated: ${file.toString()}`);
      }

      patchIOFile.seek(patchIOFile.getSize() - this.FOOTER_SIZE);

      crcBefore = (await patchIOFile.readNext(4)).reverse().toString('hex');

      crcAfter = (await patchIOFile.readNext(4)).reverse().toString('hex');

      // Validate the patch contents

      const patchChecksumExpected = (await patchIOFile.readNext(4)).reverse().toString('hex');
      const patchChecksumActual = await super.crc32Range(patchIOFile, 0, patchIOFile.getSize() - 4);
      if (patchChecksumActual !== patchChecksumExpected) {
        throw new IgirException(
          `BPS patch is invalid, CRC of contents (${patchChecksumActual}) doesn't match expected (${patchChecksumExpected}): ${file.toString()}`,
        );
      }
    });

    if (crcBefore.length !== 8 || crcAfter.length !== 8) {
      throw new IgirException(`couldn't parse base file CRC for patch: ${file.toString()}`);
    }

    return new BPSPatch(file, crcBefore, crcAfter, targetSize);
  }

  /**
   * Apply this patch to the input ROM file and write the patched result to the output path.
   */
  async createPatchedFile(
    inputRomFile: File,
    outputRomPath: string,
    callback?: FsReadCallback,
  ): Promise<void> {
    await this.getFile().extractToIOFile(async (patchIOFile) => {
      const header = await patchIOFile.readNext(4);
      if (!header.equals(BPSPatch.FILE_SIGNATURE)) {
        throw new IgirException(`BPS patch header is invalid: ${this.getFile().toString()}`);
      }

      const sourceSize = await Patch.readUpsUint(patchIOFile);
      if (inputRomFile.getSize() !== sourceSize) {
        throw new IgirException(
          `BPS patch expected ROM size of ${FsUtil.sizeReadable(sourceSize)}: ${this.getFile().toString()}`,
        );
      }
      await Patch.readUpsUint(patchIOFile); // target size

      const metadataSize = await Patch.readUpsUint(patchIOFile);
      if (metadataSize) {
        patchIOFile.skipNext(metadataSize);
      }

      await this.writeOutputFile(inputRomFile, outputRomPath, patchIOFile, callback);
    });
  }

  private async writeOutputFile(
    inputRomFile: File,
    outputRomPath: string,
    patchIOFile: IOFile,
    callback?: FsReadCallback,
  ): Promise<void> {
    await inputRomFile.extractToIOFile(async (inputRomIOFile) => {
      const targetIOFile = await IOFile.fileOfSize(
        outputRomPath,
        'r+',
        this.getSizeAfter() as number,
      );

      try {
        await BPSPatch.applyPatch(patchIOFile, inputRomIOFile, targetIOFile, callback);
      } finally {
        await targetIOFile.close();
      }
    });
  }

  private static async applyPatch(
    patchIOFile: IOFile,
    sourceIOFile: IOFile,
    targetIOFile: IOFile,
    callback?: FsReadCallback,
  ): Promise<void> {
    let sourceRelativeOffset = 0;
    let targetRelativeOffset = 0;

    while (patchIOFile.getPosition() < patchIOFile.getSize() - this.FOOTER_SIZE) {
      const blockHeader = await super.readUpsUint(patchIOFile);
      const action = (blockHeader % 4) as BPSActionValue;
      const length = Math.floor(blockHeader / 4) + 1;

      const targetPosition = targetIOFile.getPosition();
      if (action === BPSAction.SOURCE_READ) {
        sourceIOFile.seek(targetPosition);
        targetIOFile.skipNext(await sourceIOFile.copyNext(targetIOFile, targetPosition, length));
      } else if (action === BPSAction.TARGET_READ) {
        targetIOFile.skipNext(await patchIOFile.copyNext(targetIOFile, targetPosition, length));
      } else if (action === BPSAction.SOURCE_COPY) {
        const offset = await super.readUpsUint(patchIOFile);
        sourceRelativeOffset += (offset % 2 === 1 ? -1 : 1) * Math.floor(offset / 2);
        targetIOFile.skipNext(
          await sourceIOFile.copyRange(
            targetIOFile,
            targetPosition,
            sourceRelativeOffset,
            sourceRelativeOffset + length,
          ),
        );
        sourceRelativeOffset += length;
      } else if (action === BPSAction.TARGET_COPY) {
        const offset = await super.readUpsUint(patchIOFile);
        targetRelativeOffset += (offset % 2 === 1 ? -1 : 1) * Math.floor(offset / 2);
        // The copy can overlap the bytes it writes, which repeats them
        targetIOFile.skipNext(
          await targetIOFile.copyRange(
            targetIOFile,
            targetPosition,
            targetRelativeOffset,
            targetRelativeOffset + length,
          ),
        );
        targetRelativeOffset += length;
      } else {
        throw new IgirException(`BPS action ${action} isn't supported`);
      }

      if (callback === undefined) {
        continue;
      }
      const progressPercentage = patchIOFile.getPosition() / patchIOFile.getSize();
      callback(Math.floor(progressPercentage * targetIOFile.getSize()));
    }
  }
}
