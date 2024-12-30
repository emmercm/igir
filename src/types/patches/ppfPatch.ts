import FilePoly from '../../polyfill/filePoly.js';
import fsPoly from '../../polyfill/fsPoly.js';
import ExpectedError from '../expectedError.js';
import File from '../files/file.js';
import Patch from './patch.js';

class PPFHeader {
  static readonly FILE_SIGNATURE = Buffer.from('PPF');

  readonly version: number;

  readonly undoDataAvailable: boolean;

  constructor(version: number, undoDataAvailable: boolean) {
    this.version = version;
    this.undoDataAvailable = undoDataAvailable;
  }

  static async fromFilePoly(inputRomFile: File, patchFile: FilePoly): Promise<PPFHeader> {
    const header = (await patchFile.readNext(5)).toString();
    if (!header.startsWith(PPFHeader.FILE_SIGNATURE.toString())) {
      throw new ExpectedError(`PPF patch header is invalid: ${patchFile.getPathLike()}`);
    }
    const encoding = (await patchFile.readNext(1)).readUInt8();
    const version = encoding + 1;
    if (!header.endsWith(`${version}0`)) {
      throw new ExpectedError(
        `PPF patch header has an invalid version: ${patchFile.getPathLike()}`,
      );
    }
    patchFile.skipNext(50); // description

    let blockCheckEnabled = false;
    let undoDataAvailable = false;
    if (version === 2) {
      const sourceSize = (await patchFile.readNext(4)).readUInt32LE();
      if (inputRomFile.getSize() !== sourceSize) {
        throw new ExpectedError(
          `PPF patch expected ROM size of ${fsPoly.sizeReadable(sourceSize)}: ${patchFile.getPathLike()}`,
        );
      }
      blockCheckEnabled = true;
    } else if (version === 3) {
      patchFile.skipNext(1); // image type
      blockCheckEnabled = (await patchFile.readNext(1)).readUInt8() === 0x01;
      undoDataAvailable = (await patchFile.readNext(1)).readUInt8() === 0x01;
      patchFile.skipNext(1); // dummy
    } else {
      throw new ExpectedError(`PPF v${version} isn't supported: ${patchFile.getPathLike()}`);
    }
    if (blockCheckEnabled) {
      patchFile.skipNext(1024);
    }

    return new PPFHeader(version, undoDataAvailable);
  }
}

/**
 * @see https://winningeleven-games.com/thread-9609-post-29416.html#pid29416
 * @see https://github.com/meunierd/ppf/blob/master/ppfdev/PPF3.txt
 */
export default class PPFPatch extends Patch {
  static readonly SUPPORTED_EXTENSIONS = ['.ppf'];

  static readonly FILE_SIGNATURE = PPFHeader.FILE_SIGNATURE;

  static patchFrom(file: File): PPFPatch {
    const crcBefore = Patch.getCrcFromPath(file.getExtractedFilePath());
    return new PPFPatch(file, crcBefore);
  }

  async createPatchedFile(inputRomFile: File, outputRomPath: string): Promise<void> {
    return this.getFile().extractToTempFilePoly('r', async (patchFile) => {
      const header = await PPFHeader.fromFilePoly(inputRomFile, patchFile);

      return PPFPatch.writeOutputFile(inputRomFile, outputRomPath, patchFile, header);
    });
  }

  private static async writeOutputFile(
    inputRomFile: File,
    outputRomPath: string,
    patchFile: FilePoly,
    header: PPFHeader,
  ): Promise<void> {
    await inputRomFile.extractToFile(outputRomPath);
    const targetFile = await FilePoly.fileFrom(outputRomPath, 'r+');

    try {
      while (!patchFile.isEOF()) {
        await PPFPatch.applyPatchBlock(patchFile, targetFile, header);
      }
    } finally {
      await targetFile.close();
    }
  }

  private static async applyPatchBlock(
    patchFile: FilePoly,
    targetFile: FilePoly,
    header: PPFHeader,
  ): Promise<void> {
    const peek = (await patchFile.peekNext(18)).toString();
    if (!peek) {
      // End of file
      return;
    }
    if (peek === '@BEGIN_FILE_ID.DIZ') {
      // TODO(cemmer): handle?
      return;
    }

    let offset = 0;
    if (header.version === 2) {
      offset = (await patchFile.readNext(4)).readUInt32LE();
    } else if (header.version === 3) {
      offset =
        (await patchFile.readNext(4)).readUInt32LE() +
        (await patchFile.readNext(4)).readUInt32LE() * 0x1_00_00_00_00;
    }

    const bytesToChange = (await patchFile.readNext(1)).readUInt8();
    const data = await patchFile.readNext(bytesToChange);
    if (header.undoDataAvailable) {
      patchFile.skipNext(bytesToChange);
    }

    await targetFile.writeAt(data, offset);
  }
}
