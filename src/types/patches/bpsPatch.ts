import FilePoly from '../../polyfill/filePoly.js';
import fsPoly from '../../polyfill/fsPoly.js';
import ExpectedError from '../expectedError.js';
import File from '../files/file.js';
import FileChecksums, { ChecksumBitmask } from '../files/fileChecksums.js';
import Patch from './patch.js';

enum BPSAction {
  SOURCE_READ = 0,
  TARGET_READ,
  SOURCE_COPY,
  TARGET_COPY,
}

/**
 * @see https://github.com/blakesmith/rombp/blob/master/docs/bps_spec.md
 * @see https://github.com/btimofeev/UniPatcher/wiki/BPS
 */
export default class BPSPatch extends Patch {
  static readonly SUPPORTED_EXTENSIONS = ['.bps'];

  static readonly FILE_SIGNATURE = Buffer.from('BPS1');

  static async patchFrom(file: File): Promise<BPSPatch> {
    let crcBefore = '';
    let crcAfter = '';
    let targetSize = 0;

    await file.extractToTempFilePoly('r', async (patchFile) => {
      patchFile.seek(BPSPatch.FILE_SIGNATURE.length);
      await Patch.readUpsUint(patchFile); // source size
      targetSize = await Patch.readUpsUint(patchFile);

      patchFile.seek(patchFile.getSize() - 12);
      crcBefore = (await patchFile.readNext(4)).reverse().toString('hex');
      crcAfter = (await patchFile.readNext(4)).reverse().toString('hex');

      // Validate the patch contents
      const patchChecksumExpected = (await patchFile.readNext(4)).reverse().toString('hex');
      patchFile.seek(0);
      const patchData = await patchFile.readNext(patchFile.getSize() - 4);
      const patchChecksumsActual = await FileChecksums.hashData(patchData, ChecksumBitmask.CRC32);
      if (patchChecksumsActual.crc32 !== patchChecksumExpected) {
        throw new ExpectedError(`BPS patch is invalid, CRC of contents (${patchChecksumsActual.crc32}) doesn't match expected (${patchChecksumExpected}): ${file.toString()}`);
      }
    });

    if (crcBefore.length !== 8 || crcAfter.length !== 8) {
      throw new ExpectedError(`couldn't parse base file CRC for patch: ${file.toString()}`);
    }

    return new BPSPatch(file, crcBefore, crcAfter, targetSize);
  }

  async createPatchedFile(inputRomFile: File, outputRomPath: string): Promise<void> {
    return this.getFile().extractToTempFilePoly('r', async (patchFile) => {
      const header = await patchFile.readNext(4);
      if (!header.equals(BPSPatch.FILE_SIGNATURE)) {
        throw new ExpectedError(`BPS patch header is invalid: ${this.getFile().toString()}`);
      }

      const sourceSize = await Patch.readUpsUint(patchFile);
      if (inputRomFile.getSize() !== sourceSize) {
        throw new ExpectedError(`BPS patch expected ROM size of ${fsPoly.sizeReadable(sourceSize)}: ${this.getFile().toString()}`);
      }
      await Patch.readUpsUint(patchFile); // target size

      const metadataSize = await Patch.readUpsUint(patchFile);
      if (metadataSize) {
        patchFile.skipNext(metadataSize);
      }

      return this.writeOutputFile(inputRomFile, outputRomPath, patchFile);
    });
  }

  private async writeOutputFile(
    inputRomFile: File,
    outputRomPath: string,
    patchFile: FilePoly,
  ): Promise<void> {
    return inputRomFile.extractToTempFilePoly('r', async (inputRomFilePoly) => {
      const targetFile = await FilePoly.fileOfSize(outputRomPath, 'r+', this.getSizeAfter() as number);

      try {
        await BPSPatch.applyPatch(patchFile, inputRomFilePoly, targetFile);
      } finally {
        await targetFile.close();
      }
    });
  }

  private static async applyPatch(
    patchFile: FilePoly,
    sourceFile: FilePoly,
    targetFile: FilePoly,
  ): Promise<void> {
    let sourceRelativeOffset = 0;
    let targetRelativeOffset = 0;

    while (patchFile.getPosition() < patchFile.getSize() - 12) {
      const blockHeader = await Patch.readUpsUint(patchFile);
      const action = blockHeader & 3;
      const length = (blockHeader >> 2) + 1;

      if (action === BPSAction.SOURCE_READ) {
        await targetFile.write(await sourceFile.readAt(targetFile.getPosition(), length));
      } else if (action === BPSAction.TARGET_READ) {
        const data = await patchFile.readNext(length);
        await targetFile.write(data);
      } else if (action === BPSAction.SOURCE_COPY) {
        const offset = await Patch.readUpsUint(patchFile);
        sourceRelativeOffset += (offset & 1 ? -1 : +1) * (offset >> 1);
        await targetFile.write(await sourceFile.readAt(sourceRelativeOffset, length));
        sourceRelativeOffset += length;
      } else if (action === BPSAction.TARGET_COPY) {
        const offset = await Patch.readUpsUint(patchFile);
        targetRelativeOffset += (offset & 1 ? -1 : +1) * (offset >> 1);
        // WARN: you explicitly can't read the target file all at once, you have to read byte by
        // byte, because later iterations of the loop may need to read data that was changed by
        // earlier iterations of the loop.
        for (let i = 0; i < length; i += 1) {
          await targetFile.write(await targetFile.readAt(targetRelativeOffset, 1));
          targetRelativeOffset += 1;
        }
      } else {
        throw new ExpectedError(`BPS action ${action} isn't supported`);
      }
    }
  }
}
