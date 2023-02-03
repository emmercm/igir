import path from 'path';

import Constants from '../../constants.js';
import FilePoly from '../../polyfill/filePoly.js';
import fsPoly from '../../polyfill/fsPoly.js';
import File from '../files/file.js';
import Patch from './patch.js';

enum BPSAction {
  SOURCE_READ = 0,
  TARGET_READ,
  SOURCE_COPY,
  TARGET_COPY,
}

/**
 * @link https://github.com/blakesmith/rombp/blob/master/docs/bps_spec.md
 * @link https://github.com/btimofeev/UniPatcher/wiki/BPS
 */
export default class BPSPatch extends Patch {
  static readonly SUPPORTED_EXTENSIONS = ['.bps'];

  static readonly FILE_SIGNATURE = Buffer.from('BPS1');

  static async patchFrom(file: File): Promise<BPSPatch> {
    let crcBefore = '';
    let crcAfter = '';
    let targetSize = 0;

    await file.extractToFilePoly('r', async (patchFile) => {
      patchFile.seek(4); // header
      await Patch.readUpsUint(patchFile); // source size
      targetSize = await Patch.readUpsUint(patchFile); // target size

      patchFile.seek(patchFile.getSize() - 12);
      crcBefore = (await patchFile.readNext(4)).reverse().toString('hex');
      crcAfter = (await patchFile.readNext(4)).reverse().toString('hex');
    });

    if (crcBefore.length !== 8 || crcAfter.length !== 8) {
      throw new Error(`Couldn't parse base file CRC for patch: ${file.toString()}`);
    }

    return new BPSPatch(file, crcBefore, crcAfter, targetSize);
  }

  async applyToTempFile<T>(
    inputRomFile: File,
    callback: (tempFile: string) => (Promise<T> | T),
  ): Promise<T> {
    return this.getFile().extractToFilePoly('r', async (patchFile) => {
      // Skip header info
      const header = await patchFile.readNext(4);
      if (!header.equals(BPSPatch.FILE_SIGNATURE)) {
        await patchFile.close();
        throw new Error(`BPS patch header is invalid: ${this.getFile().toString()}`);
      }
      await Patch.readUpsUint(patchFile); // source size
      await Patch.readUpsUint(patchFile); // target size
      const metadataSize = await Patch.readUpsUint(patchFile);
      if (metadataSize) {
        patchFile.skipNext(metadataSize);
      }

      return this.writeOutputFile(inputRomFile, patchFile, callback);
    });
  }

  private async writeOutputFile<T>(
    inputRomFile: File,
    patchFile: FilePoly,
    callback: (tempFile: string) => (Promise<T> | T),
  ): Promise<T> {
    return inputRomFile.extractToFilePoly('r', async (inputRomFilePoly) => {
      const targetFilePath = await fsPoly.mktemp(path.join(
        Constants.GLOBAL_TEMP_DIR,
        `${path.basename(inputRomFilePoly.getPathLike().toString())}.bps`,
      ));
      const targetFile = await FilePoly.fileOfSize(targetFilePath, 'r+', this.getSizeAfter() as number);

      try {
        await BPSPatch.applyPatch(patchFile, inputRomFilePoly, targetFile);
      } finally {
        await targetFile.close();
      }

      const callbackResult = await callback(targetFilePath);
      await fsPoly.rm(targetFilePath, { force: true });
      return callbackResult;
    });
  }

  private static async applyPatch(
    patchFile: FilePoly,
    sourceFile: FilePoly,
    targetFile: FilePoly,
  ): Promise<void> {
    let sourceRelativeOffset = 0;
    let targetRelativeOffset = 0;

    /* eslint-disable no-await-in-loop, no-bitwise */
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
      } else {
        const offset = await Patch.readUpsUint(patchFile);
        targetRelativeOffset += (offset & 1 ? -1 : +1) * (offset >> 1);
        await targetFile.write(await targetFile.readAt(targetRelativeOffset, length));
        targetRelativeOffset += length;
      }
    }
  }
}
