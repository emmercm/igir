import IgirException from '../../exceptions/igirException.js';
import Defaults from '../../globals/defaults.js';
import IOFile from '../../models/files/ioFile.js';
import type { FsReadCallback } from '../../streams/fsReadTransform.js';
import type File from '../files/file.js';
import Patch from './patch.js';

const NinjaCommand = {
  TERMINATE: 0x00,
  OPEN: 0x01,
  XOR: 0x02,
} as const;
type NinjaCommandValue = (typeof NinjaCommand)[keyof typeof NinjaCommand];

const NinjaFileType = {
  RAW: 0,
  NES: 1,
  FDS: 2,
  SNES: 3,
  N64: 4,
  GB: 5,
  SMS: 6,
  MEGA: 7,
  PCE: 8,
  LYNX: 9,
} as const;
type NinjaFileTypeKey = keyof typeof NinjaFileType;
type NinjaFileTypeValue = (typeof NinjaFileType)[NinjaFileTypeKey];
const NinjaFileTypeInverted = Object.fromEntries(
  Object.entries(NinjaFileType).map(([key, value]) => [value, key]),
) as Record<NinjaFileTypeValue, NinjaFileTypeKey>;

/**
 * @see https://www.romhacking.net/utilities/329/
 */
export default class NinjaPatch extends Patch {
  static readonly SUPPORTED_EXTENSIONS = ['.rup'];

  static readonly FILE_SIGNATURE = Buffer.from('NINJA');

  /**
   * Parse a NINJA (.rup) patch file and return a {@link NinjaPatch}.
   */
  static patchFrom(file: File): NinjaPatch {
    const crcBefore = super.getCrcFromPath(file.getExtractedFilePath());
    return new NinjaPatch(file, crcBefore);
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
      const header = await patchIOFile.readNext(5);
      if (!header.equals(NinjaPatch.FILE_SIGNATURE)) {
        throw new IgirException(`NINJA patch header is invalid: ${this.getFile().toString()}`);
      }
      const version = Math.trunc(Number((await patchIOFile.readNext(1)).toString()));
      if (version !== 2) {
        throw new IgirException(`NINJA v${version} isn't supported: ${this.getFile().toString()}`);
      }

      patchIOFile.skipNext(1); // encoding
      patchIOFile.skipNext(84); // author
      patchIOFile.skipNext(11); // version
      patchIOFile.skipNext(256); // title
      patchIOFile.skipNext(48); // genre
      patchIOFile.skipNext(48); // language
      patchIOFile.skipNext(8); // date
      patchIOFile.skipNext(512); // website
      patchIOFile.skipNext(1074); // info

      await this.writeOutputFile(inputRomFile, outputRomPath, patchIOFile, callback);
    });
  }

  private async writeOutputFile(
    inputRomFile: File,
    outputRomPath: string,
    patchIOFile: IOFile,
    callback?: FsReadCallback,
  ): Promise<void> {
    await inputRomFile.extractToFile(outputRomPath);
    const targetIOFile = await IOFile.fileFrom(outputRomPath, 'r+');

    try {
      while (!patchIOFile.isEOF()) {
        await this.applyCommand(patchIOFile, targetIOFile);

        if (callback === undefined) {
          continue;
        }
        const progressPercentage = patchIOFile.getPosition() / patchIOFile.getSize();
        callback(Math.floor(progressPercentage * targetIOFile.getSize()));
      }
    } finally {
      await targetIOFile.close();
    }
  }

  private async applyCommand(patchIOFile: IOFile, targetIOFile: IOFile): Promise<void> {
    const command = (await patchIOFile.readNext(1)).readUInt8() as NinjaCommandValue;

    if (command === NinjaCommand.TERMINATE) {
      // Nothing
    } else if (command === NinjaCommand.OPEN) {
      await this.applyCommandOpen(patchIOFile, targetIOFile);
    } else if (command === NinjaCommand.XOR) {
      await NinjaPatch.applyCommandXor(patchIOFile, targetIOFile);
    } else {
      throw new IgirException(`Ninja command ${command} isn't supported`);
    }
  }

  private async applyCommandOpen(patchIOFile: IOFile, targetIOFile: IOFile): Promise<void> {
    const multiFile = (await patchIOFile.readNext(1)).readUInt8();
    if (multiFile > 0) {
      throw new IgirException(
        `Multi-file NINJA patches aren't supported: ${this.getFile().toString()}`,
      );
    }

    const fileNameLength =
      multiFile > 0 ? (await patchIOFile.readNext(multiFile)).readUIntLE(0, multiFile) : 0;
    patchIOFile.skipNext(fileNameLength); // file name
    const fileType = (await patchIOFile.readNext(1)).readUInt8() as NinjaFileTypeValue;
    if (fileType > 0) {
      throw new IgirException(
        `unsupported NINJA file type ${NinjaFileTypeInverted[fileType]}: ${this.getFile().toString()}`,
      );
    }
    const sourceFileSizeLength = (await patchIOFile.readNext(1)).readUInt8();
    const sourceFileSize = (await patchIOFile.readNext(sourceFileSizeLength)).readUIntLE(
      0,
      sourceFileSizeLength,
    );
    const modifiedFileSizeLength = (await patchIOFile.readNext(1)).readUInt8();
    const modifiedFileSize = (await patchIOFile.readNext(modifiedFileSizeLength)).readUIntLE(
      0,
      modifiedFileSizeLength,
    );
    patchIOFile.skipNext(16); // source MD5
    patchIOFile.skipNext(16); // modified MD5

    if (sourceFileSize === modifiedFileSize) {
      return;
    }
    patchIOFile.skipNext(1); // "M" or "A"
    const overflowSizeLength = (await patchIOFile.readNext(1)).readUInt8();
    const overflowSize =
      overflowSizeLength > 0
        ? (await patchIOFile.readNext(overflowSizeLength)).readUIntLE(0, overflowSizeLength)
        : 0;
    if (modifiedFileSize > sourceFileSize) {
      await NinjaPatch.appendOverflow(patchIOFile, targetIOFile, overflowSize);
    } else {
      await targetIOFile.truncate(modifiedFileSize);
      patchIOFile.skipNext(overflowSize);
    }
  }

  /**
   * Append the {@link overflowSize} bytes of overflow data at the patch's read position to the
   * target, a chunk at a time, advancing the patch's read position past them.
   */
  private static async appendOverflow(
    patchIOFile: IOFile,
    targetIOFile: IOFile,
    overflowSize: number,
  ): Promise<void> {
    let read = 0;
    while (read < overflowSize) {
      const chunkSize = Math.min(overflowSize - read, Defaults.FILE_READING_CHUNK_SIZE);
      const overflow = await patchIOFile.readNext(chunkSize);
      read += chunkSize;
      for (let i = 0; i < overflow.length; i += 1) {
        overflow[i] ^= 255; // NOTE(cemmer): this isn't documented anywhere
      }
      await targetIOFile.writeAt(overflow, targetIOFile.getSize());
      if (overflow.length < chunkSize) {
        // The patch ended early, skip what's left of the overflow
        patchIOFile.skipNext(overflowSize - read);
        break;
      }
    }
  }

  private static async applyCommandXor(patchIOFile: IOFile, targetIOFile: IOFile): Promise<void> {
    const offsetLength = (await patchIOFile.readNext(1)).readUInt8();
    const offset = (await patchIOFile.readNext(offsetLength)).readUIntLE(0, offsetLength);
    targetIOFile.seek(offset);

    const lengthLength = (await patchIOFile.readNext(1)).readUInt8();
    const length = (await patchIOFile.readNext(lengthLength)).readUIntLE(0, lengthLength);
    for (let xored = 0; xored < length; xored += Defaults.FILE_READING_CHUNK_SIZE) {
      const chunkSize = Math.min(length - xored, Defaults.FILE_READING_CHUNK_SIZE);
      const sourceData = await targetIOFile.readAt(offset + xored, chunkSize);
      const xorData = await patchIOFile.readNext(chunkSize);
      // Bytes past the end of the patch are 0x00, so the whole chunk is still written
      const targetData =
        xorData.length === chunkSize
          ? xorData
          : Buffer.concat([xorData, Buffer.alloc(chunkSize - xorData.length)]);
      // Bytes past the end of the target are 0x00, so they're left as the XOR data
      for (const [i, sourceDatum] of sourceData.entries()) {
        targetData[i] ^= sourceDatum;
      }
      await targetIOFile.writeAt(targetData, offset + xored);
    }
    targetIOFile.skipNext(length);
  }
}
