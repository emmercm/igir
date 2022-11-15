import FilePoly from '../../polyfill/filePoly.js';
import File from '../files/file.js';
import Patch from './patch.js';

/**
 * @link https://zerosoft.zophar.net/ips.php
 * @link https://github.com/btimofeev/UniPatcher/blob/a5a69cc607fadef43734589b311e5ef1bcde6941/app/src/main/java/org/emunix/unipatcher/patcher/IPS.java
 */
export default class IPSPatch extends Patch {
  static readonly SUPPORTED_EXTENSIONS = ['.ips'];

  static patchFrom(file: File): IPSPatch {
    const crcBefore = Patch.getCrcFromPath(file.getExtractedFilePath());
    return new IPSPatch(file, crcBefore);
  }

  async apply<T>(
    file: File,
    callback: (tempFile: string) => (T | Promise<T>),
  ): Promise<T> {
    return this.getFile().extractToFile(async (patchFilePath) => {
      const fp = await FilePoly.fileFrom(patchFilePath, 'r');

      const header = (await fp.readNext(5)).toString();
      if (header !== 'PATCH' && header !== 'IPS32') {
        await fp.close();
        throw new Error(`IPS patch header is invalid: ${this.getFile().toString()}`);
      }

      let offsetSize = 3;
      let eofString = 'EOF';
      if (header === 'IPS32') {
        offsetSize = 4;
        eofString = 'EEOF';
      }

      const result = await file.extractToTempFile(async (tempFile) => {
        const targetFile = await FilePoly.fileFrom(tempFile, 'r+');

        /* eslint-disable no-constant-condition, no-await-in-loop */
        while (true) {
          const offsetPeek = await fp.peekNext(eofString.length);
          if (offsetPeek === null || offsetPeek.toString() === eofString) {
            break;
          }

          const offset = (await fp.readNext(offsetSize)).readUintBE(0, offsetSize);
          const size = (await fp.readNext(2)).readUInt16BE();
          if (size === 0) {
            // Run-length encoding record
            const rleSize = (await fp.readNext(2)).readUInt16BE();
            const data = Buffer.from((await fp.readNext(1)).toString('hex')
              .repeat(rleSize), 'hex');
            await targetFile.writeAt(data, offset);
          } else {
            // Standard record
            const data = await fp.readNext(size);
            await targetFile.writeAt(data, offset);
          }
        }

        await targetFile.close();

        return callback(tempFile);
      });

      await fp.close();

      return result;
    });
  }
}
