import FilePoly from '../../polyfill/filePoly.js';
import ExpectedError from '../expectedError.js';
import File from '../files/file.js';
import Patch from './patch.js';

/**
 * @see https://zerosoft.zophar.net/ips.php
 * @see https://github.com/btimofeev/UniPatcher/blob/a5a69cc607fadef43734589b311e5ef1bcde6941/app/src/main/java/org/emunix/unipatcher/patcher/IPS.java
 * @see https://github.com/Lyrositor/EBPatcher/blob/f722878c60f476e4f8e92322aaefa579807bd58f/EBPPatch.py
 */
export default class IPSPatch extends Patch {
  static readonly SUPPORTED_EXTENSIONS = ['.ips', '.ips32', '.ebp'];

  static readonly FILE_SIGNATURES = [Buffer.from('PATCH'), Buffer.from('IPS32')];

  static patchFrom(file: File): IPSPatch {
    const crcBefore = Patch.getCrcFromPath(file.getExtractedFilePath());
    return new IPSPatch(file, crcBefore);
  }

  async createPatchedFile(inputRomFile: File, outputRomPath: string): Promise<void> {
    return this.getFile().extractToTempFilePoly('r', async (patchFile) => {
      const header = await patchFile.readNext(5);
      if (IPSPatch.FILE_SIGNATURES.every((fileSignature) => !header.equals(fileSignature))) {
        throw new ExpectedError(`IPS patch header is invalid: ${this.getFile().toString()}`);
      }

      let offsetSize = 3;
      let eofString = 'EOF';
      if (header.toString() === 'IPS32') {
        offsetSize = 4;
        eofString = 'EEOF';
      }

      return IPSPatch.writeOutputFile(
        inputRomFile,
        outputRomPath,
        patchFile,
        offsetSize,
        eofString,
      );
    });
  }

  private static async writeOutputFile(
    inputRomFile: File,
    outputRomPath: string,
    patchFile: FilePoly,
    offsetSize: number,
    eofString: string,
  ): Promise<void> {
    await inputRomFile.extractToFile(outputRomPath);
    const targetFile = await FilePoly.fileFrom(outputRomPath, 'r+');

    try {
      await IPSPatch.applyPatch(patchFile, targetFile, offsetSize, eofString);
    } finally {
      await targetFile.close();
    }
  }

  private static async applyPatch(
    patchFile: FilePoly,
    targetFile: FilePoly,
    offsetSize: number,
    eofString: string,
  ): Promise<void> {
    while (!patchFile.isEOF()) {
      const offsetPeek = await patchFile.peekNext(eofString.length);
      if (offsetPeek === null || offsetPeek.toString() === eofString) {
        break;
      }

      const offset = (await patchFile.readNext(offsetSize)).readUIntBE(0, offsetSize);
      const size = (await patchFile.readNext(2)).readUInt16BE();
      let data: Buffer;
      if (size === 0) {
        // Run-length encoding record
        const rleSize = (await patchFile.readNext(2)).readUInt16BE();
        data = Buffer.from((await patchFile.readNext(1)).toString('hex').repeat(rleSize), 'hex');
      } else {
        // Standard record
        data = await patchFile.readNext(size);
      }
      await targetFile.writeAt(data, offset);
    }
  }
}
