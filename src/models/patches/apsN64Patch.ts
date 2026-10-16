import IgirException from '../../exceptions/igirException.js';
import IOFile from '../../models/files/ioFile.js';
import type { FsReadCallback } from '../../streams/fsReadTransform.js';
import type File from '../files/file.js';
import Patch from './patch.js';

const APSN64PatchType = {
  SIMPLE: 0,
  N64: 1,
} as const;
type APSN64PatchTypeValue = (typeof APSN64PatchType)[keyof typeof APSN64PatchType];

/**
 * @see https://github.com/btimofeev/UniPatcher/wiki/APS-(N64)
 */
export default class APSN64Patch extends Patch {
  static readonly FILE_SIGNATURE = Buffer.from('APS10');

  private readonly patchType: APSN64PatchTypeValue;

  protected constructor(
    patchType: APSN64PatchTypeValue,
    file: File,
    crcBefore: string,
    sizeAfter: number,
  ) {
    super(file, crcBefore, undefined, sizeAfter);
    this.patchType = patchType;
  }

  /**
   * Parse an N64-format .aps patch file and return an {@link APSN64Patch}.
   */
  static async patchFrom(file: File): Promise<APSN64Patch> {
    let patchType: APSN64PatchTypeValue = APSN64PatchType.SIMPLE;
    const crcBefore = super.getCrcFromPath(file.getExtractedFilePath());
    let targetSize = 0;

    await file.extractToIOFile(async (patchIOFile) => {
      patchIOFile.seek(this.FILE_SIGNATURE.length);
      patchType = (await patchIOFile.readNext(1)).readUInt8() as APSN64PatchTypeValue;
      patchIOFile.skipNext(1); // encoding method
      patchIOFile.skipNext(50); // description

      if (patchType === APSN64PatchType.SIMPLE) {
        targetSize = (await patchIOFile.readNext(4)).readUInt32LE();
      } else if (patchType === APSN64PatchType.N64) {
        patchIOFile.skipNext(1); // ROM format
        patchIOFile.skipNext(2); // cart ID string (*'s from: NUS-N**X-XXX)
        patchIOFile.skipNext(1); // country string (* from: NUS-NXX*-XXX)
        patchIOFile.skipNext(8); // CRC within the ROM (NOT the entire ROM CRC)
        patchIOFile.skipNext(5); // padding
        targetSize = (await patchIOFile.readNext(4)).readUInt32LE();
      } else {
        throw new IgirException(
          `APS (N64) patch type ${patchType} isn't supported: ${patchIOFile.getPathLike().toString()}`,
        );
      }
    });

    return new APSN64Patch(patchType, file, crcBefore, targetSize);
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
      const header = await patchIOFile.readNext(APSN64Patch.FILE_SIGNATURE.length);
      if (!header.equals(APSN64Patch.FILE_SIGNATURE)) {
        throw new IgirException(`APS (N64) patch header is invalid: ${this.getFile().toString()}`);
      }

      // patchFrom() already rejected unsupported patch types
      patchIOFile.seek(this.patchType === APSN64PatchType.SIMPLE ? 57 : 74);
      const targetSize = (await patchIOFile.readNext(4)).readUInt32LE();

      await APSN64Patch.writeOutputFile(
        inputRomFile,
        outputRomPath,
        patchIOFile,
        targetSize,
        callback,
      );
    });
  }

  private static async writeOutputFile(
    inputRomFile: File,
    outputRomPath: string,
    patchIOFile: IOFile,
    targetSize: number,
    callback?: FsReadCallback,
  ): Promise<void> {
    await inputRomFile.extractToFile(outputRomPath);
    const targetIOFile = await IOFile.fileFrom(outputRomPath, 'r+');

    try {
      await this.applyPatch(patchIOFile, targetIOFile, callback);
      await targetIOFile.truncate(targetSize);
    } finally {
      await targetIOFile.close();
    }
  }

  private static async applyPatch(
    patchIOFile: IOFile,
    targetIOFile: IOFile,
    callback?: FsReadCallback,
  ): Promise<void> {
    while (patchIOFile.getPosition() < patchIOFile.getSize()) {
      const offset = (await this.readRecordBytes(patchIOFile, 4)).readUInt32LE();
      const size = (await this.readRecordBytes(patchIOFile, 1)).readUInt8();

      let data: Buffer;
      if (size === 0) {
        // Run-length encoding record
        const byte = await this.readRecordBytes(patchIOFile, 1);
        const rleSize = (await this.readRecordBytes(patchIOFile, 1)).readUInt8();
        data = Buffer.alloc(rleSize, byte);
      } else {
        // Standard record
        data = await this.readRecordBytes(patchIOFile, size);
      }

      await targetIOFile.writeAt(data, offset);

      callback?.(
        Math.floor((patchIOFile.getPosition() / patchIOFile.getSize()) * targetIOFile.getSize()),
      );
    }
  }

  /**
   * Read exactly the next {@link size} bytes of a record, throwing if the patch ends first.
   * @returns the record bytes
   */
  private static async readRecordBytes(patchIOFile: IOFile, size: number): Promise<Buffer> {
    const data = await patchIOFile.readNext(size);
    if (data.length !== size) {
      throw new IgirException(
        `APS (N64) patch is truncated: ${patchIOFile.getPathLike().toString()}`,
      );
    }
    return data;
  }
}
