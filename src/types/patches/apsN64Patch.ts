import FilePoly from '../../polyfill/filePoly.js';
import ExpectedError from '../expectedError.js';
import File from '../files/file.js';
import Patch from './patch.js';

enum APSN64PatchType {
  SIMPLE = 0,
  N64 = 1,
}

/**
 * @see https://github.com/btimofeev/UniPatcher/wiki/APS-(N64)
 */
export default class APSN64Patch extends Patch {
  static readonly FILE_SIGNATURE = Buffer.from('APS10');

  private readonly patchType: APSN64PatchType;

  protected constructor(
    patchType: APSN64PatchType,
    file: File,
    crcBefore: string,
    sizeAfter: number,
  ) {
    super(file, crcBefore, undefined, sizeAfter);
    this.patchType = patchType;
  }

  static async patchFrom(file: File): Promise<APSN64Patch> {
    let patchType = APSN64PatchType.SIMPLE;
    const crcBefore = Patch.getCrcFromPath(file.getExtractedFilePath());
    let targetSize = 0;

    await file.extractToTempFilePoly('r', async (patchFile) => {
      patchFile.seek(APSN64Patch.FILE_SIGNATURE.length);
      patchType = (await patchFile.readNext(1)).readUInt8();
      patchFile.skipNext(1); // encoding method
      patchFile.skipNext(50); // description

      if (patchType === APSN64PatchType.SIMPLE) {
        targetSize = (await patchFile.readNext(4)).readUInt32LE();
      } else if (patchType === APSN64PatchType.N64) {
        patchFile.skipNext(1); // ROM format
        patchFile.skipNext(2); // cart ID string (*'s from: NUS-N**X-XXX)
        patchFile.skipNext(1); // country string (* from: NUS-NXX*-XXX)
        patchFile.skipNext(8); // CRC within the ROM (NOT the entire ROM CRC)
        patchFile.skipNext(5); // padding
        targetSize = (await patchFile.readNext(4)).readUInt32LE();
      } else {
        throw new ExpectedError(`APS (N64) patch type ${patchType} isn't supported: ${patchFile.getPathLike()}`);
      }
    });

    return new APSN64Patch(patchType, file, crcBefore, targetSize);
  }

  async createPatchedFile(inputRomFile: File, outputRomPath: string): Promise<void> {
    return this.getFile().extractToTempFilePoly('r', async (patchFile) => {
      const header = await patchFile.readNext(APSN64Patch.FILE_SIGNATURE.length);
      if (!header.equals(APSN64Patch.FILE_SIGNATURE)) {
        throw new ExpectedError(`APS (N64) patch header is invalid: ${this.getFile().toString()}`);
      }

      if (this.patchType === APSN64PatchType.SIMPLE) {
        patchFile.seek(61);
      } else if (this.patchType === APSN64PatchType.N64) {
        patchFile.seek(78);
      } else {
        throw new ExpectedError(`APS (N64) patch type ${this.patchType} isn't supported: ${patchFile.getPathLike()}`);
      }

      return APSN64Patch.writeOutputFile(inputRomFile, outputRomPath, patchFile);
    });
  }

  private static async writeOutputFile(
    inputRomFile: File,
    outputRomPath: string,
    patchFile: FilePoly,
  ): Promise<void> {
    await inputRomFile.extractToFile(outputRomPath);
    const targetFile = await FilePoly.fileFrom(outputRomPath, 'r+');

    try {
      await APSN64Patch.applyPatch(patchFile, targetFile);
    } finally {
      await targetFile.close();
    }
  }

  private static async applyPatch(patchFile: FilePoly, targetFile: FilePoly): Promise<void> {
    while (patchFile.getPosition() < patchFile.getSize()) {
      const offset = (await patchFile.readNext(4)).readUInt32LE();
      const size = (await patchFile.readNext(1)).readUInt8();

      let data: Buffer;
      if (size === 0) {
        // Run-length encoding record
        const byte = await patchFile.readNext(1);
        const rleSize = (await patchFile.readNext(1)).readUInt8();
        data = Buffer.from(byte.toString('hex').repeat(rleSize), 'hex');
      } else {
        // Standard record
        data = await patchFile.readNext(size);
      }

      await targetFile.writeAt(data, offset);
    }
  }
}
