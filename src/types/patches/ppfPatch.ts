import FilePoly from '../../polyfill/filePoly.js';
import File from '../files/file.js';
import Patch from './patch.js';

/**
 * @link https://winningeleven-games.com/thread-9609-post-29416.html#pid29416
 * @link https://github.com/meunierd/ppf/blob/master/ppfdev/PPF3.txt
 */
export default class PPFPatch extends Patch {
  static patchFrom(file: File): PPFPatch {
    const crcBefore = Patch.getCrcFromPath(file.getExtractedFilePath());
    return new PPFPatch(file, crcBefore);
  }

  private async parsePatch(): Promise<void> {
    await this.getFile().extractToFile(async (patchFile) => {
      const fp = await FilePoly.fileFrom(patchFile, 'r');

      const header = (await fp.readNext(5)).toString();
      if (!header.startsWith('PPF')) {
        throw new Error(`PPF patch header is invalid: ${this.getFile().toString()}`);
      }
      const encoding = (await fp.readNext(1))[0];
      const version = encoding + 1;
      if (!header.endsWith(`${version}0`)) {
        throw new Error(`PPF patch header is invalid: ${this.getFile().toString()}`);
      }

      await fp.readNext(50); // description

      let blockCheckEnabled = false;
      let undoDataAvailable = false;
      if (version === 1) {
        // TODO(cemmer)
      } if (version === 2) {
        await fp.readNext(4); // size of base file
        blockCheckEnabled = true;
        await fp.readNext(1024); // contents from 0x9320 of base file
      } if (version === 3) {
        const imageType = (await fp.readNext(1))[0];
        blockCheckEnabled = (await fp.readNext(1))[0] === 0x01;
        undoDataAvailable = (await fp.readNext(1))[0] === 0x01;
        await fp.readNext(1); // dummy
        await fp.readNext(1024); // contents from 0x9320, 0x80A0, or empty
      } else {
        throw new Error(`PPF v${version} isn't supported: ${this.getFile().toString()}`);
      }

      /* eslint-disable no-constant-condition, no-await-in-loop */
      while (true) {
        const peek = await fp.peekNext(12);
        const i = 0;
      }

      await fp.close();
    });
  }

  async apply<T>(file: File, callback: (tempFile: string) => (Promise<T> | T)): Promise<T> {
    return Promise.resolve(undefined);
  }
}
