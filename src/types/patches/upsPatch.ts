import FsPoly from '../../polyfill/fsPoly.js';
import IOFile from '../../polyfill/ioFile.js';
import IgirException from '../exceptions/igirException.js';
import File from '../files/file.js';
import FileChecksums, { ChecksumBitmask } from '../files/fileChecksums.js';
import Patch from './patch.js';

/**
 * WARN(cemmer): because UPS patches use nul-byte termination for records rather than some kind of
 * length identifier, which forces patchers to read both the UPS file and ROM file byte-by-byte,
 * large patches can perform tremendously poorly if they contain many small records.
 * @see https://www.romhacking.net/documents/392/
 * @see https://github.com/btimofeev/UniPatcher/wiki/UPS
 * @see https://www.gamebrew.org/wiki/Upset
 */
export default class UPSPatch extends Patch {
  static readonly SUPPORTED_EXTENSIONS = ['.ups'];

  static readonly FILE_SIGNATURE = Buffer.from('UPS1');

  static async patchFrom(file: File): Promise<UPSPatch> {
    let crcBefore = '';
    let crcAfter = '';
    let targetSize = 0;

    await file.extractToTempFilePoly('r', async (patchFile) => {
      patchFile.seek(UPSPatch.FILE_SIGNATURE.length);
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
        throw new IgirException(
          `UPS patch is invalid, CRC of contents (${patchChecksumsActual.crc32}) doesn't match expected (${patchChecksumExpected}): ${file.toString()}`,
        );
      }
    });

    if (crcBefore.length !== 8 || crcAfter.length !== 8) {
      throw new IgirException(`couldn't parse base file CRC for patch: ${file.toString()}`);
    }

    return new UPSPatch(file, crcBefore, crcAfter, targetSize);
  }

  async createPatchedFile(inputRomFile: File, outputRomPath: string): Promise<void> {
    return this.getFile().extractToTempFilePoly('r', async (patchFile) => {
      const header = await patchFile.readNext(4);
      if (!header.equals(UPSPatch.FILE_SIGNATURE)) {
        throw new IgirException(`UPS patch header is invalid: ${this.getFile().toString()}`);
      }

      const sourceSize = await Patch.readUpsUint(patchFile);
      if (inputRomFile.getSize() !== sourceSize) {
        throw new IgirException(
          `UPS patch expected ROM size of ${FsPoly.sizeReadable(sourceSize)}: ${patchFile.getPathLike().toString()}`,
        );
      }
      await Patch.readUpsUint(patchFile); // target size

      return UPSPatch.writeOutputFile(inputRomFile, outputRomPath, patchFile);
    });
  }

  private static async writeOutputFile(
    inputRomFile: File,
    outputRomPath: string,
    patchFile: IOFile,
  ): Promise<void> {
    // TODO(cemmer): we don't actually need a temp file, we're not modifying the input
    return inputRomFile.extractToTempFile(async (tempRomFile) => {
      const sourceFile = await IOFile.fileFrom(tempRomFile, 'r');

      await FsPoly.copyFile(tempRomFile, outputRomPath);
      const targetFile = await IOFile.fileFrom(outputRomPath, 'r+');

      try {
        await UPSPatch.applyPatch(patchFile, sourceFile, targetFile);
      } finally {
        await targetFile.close();
        await sourceFile.close();
      }
    });
  }

  private static async applyPatch(
    patchFile: IOFile,
    sourceFile: IOFile,
    targetFile: IOFile,
  ): Promise<void> {
    while (patchFile.getPosition() < patchFile.getSize() - 12) {
      const relativeOffset = await Patch.readUpsUint(patchFile);
      sourceFile.skipNext(relativeOffset);
      targetFile.skipNext(relativeOffset);

      const data = await this.readPatchBlock(patchFile, sourceFile);
      await targetFile.write(data);

      sourceFile.skipNext(1);
      targetFile.skipNext(1);
    }
  }

  private static async readPatchBlock(patchFile: IOFile, sourceFile: IOFile): Promise<Buffer> {
    const buffer: Buffer[] = [];

    while (patchFile.getPosition() < patchFile.getSize() - 12) {
      const xorByte = (await patchFile.readNext(1)).readUInt8();
      if (!xorByte) {
        // terminating byte 0x00
        return Buffer.concat(buffer);
      }

      const sourceByte = sourceFile.isEOF() ? 0x00 : (await sourceFile.readNext(1)).readUInt8();
      buffer.push(Buffer.of(sourceByte ^ xorByte));
    }

    throw new IgirException(
      `UPS patch failed to read 0x00 block termination: ${patchFile.getPathLike().toString()}`,
    );
  }
}
