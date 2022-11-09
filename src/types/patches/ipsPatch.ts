import FilePoly from '../../polyfill/filePoly.js';
import File from '../files/file.js';
import Patch from './patch.js';

/**
 * @link https://zerosoft.zophar.net/ips.php
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
      if (header !== 'PATCH') {
        await fp.close();
        throw new Error(`IPS patch header is invalid: ${this.getFile().toString()}`);
      }

      const result = await file.extractToTempFile(async (tempFile) => {
        const targetFile = await FilePoly.fileFrom(tempFile, 'r+');

        /* eslint-disable no-constant-condition, no-await-in-loop */
        while (true) {
          const offsetPeek = await fp.readNext(3);
          if (offsetPeek === null || offsetPeek.toString() === 'EOF') {
            break;
          }

          const offset = offsetPeek.readUintBE(0, 3);
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
