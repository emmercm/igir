import FilePoly from '../../polyfill/filePoly.js';
import File from '../files/file.js';
import Patch from './patch.js';

interface PPFRecord {
  offset: number,
  data: Buffer,
}

/**
 * @link https://winningeleven-games.com/thread-9609-post-29416.html#pid29416
 * @link https://github.com/meunierd/ppf/blob/master/ppfdev/PPF3.txt
 */
export default class PPFPatch extends Patch {
  private readonly records: PPFRecord[] = [];

  static patchFrom(file: File): PPFPatch {
    const crcBefore = Patch.getCrcFromPath(file.getExtractedFilePath());
    return new PPFPatch(file, crcBefore);
  }

  private async parsePatch(): Promise<void> {
    if (this.records.length) {
      return;
    }

    await this.getFile().extractToFile(async (patchFile) => {
      const fp = await FilePoly.fileFrom(patchFile, 'r');

      const header = (await fp.readNext(5)).toString();
      if (!header.startsWith('PPF')) {
        await fp.close();
        throw new Error(`PPF patch header is invalid: ${this.getFile().toString()}`);
      }
      const encoding = (await fp.readNext(1))[0];
      const version = encoding + 1;
      if (!header.endsWith(`${version}0`)) {
        await fp.close();
        throw new Error(`PPF patch header is invalid: ${this.getFile().toString()}`);
      }

      await fp.readNext(50); // description

      let blockCheckEnabled = false;
      let undoDataAvailable = false;
      if (version === 2) {
        await fp.readNext(4); // size of base file
        blockCheckEnabled = true;
      } else if (version === 3) {
        await fp.readNext(1); // image type
        blockCheckEnabled = (await fp.readNext(1)).readUInt8() === 0x01;
        undoDataAvailable = (await fp.readNext(1)).readUInt8() === 0x01;
        await fp.readNext(1); // dummy
      } else {
        await fp.close();
        throw new Error(`PPF v${version} isn't supported: ${this.getFile().toString()}`);
      }

      if (blockCheckEnabled) {
        await fp.readNext(1024);
      }

      /* eslint-disable no-constant-condition, no-await-in-loop */
      while (true) {
        const peek = (await fp.peekNext(18)).toString();
        if (!peek) {
          // End of file
          break;
        }
        if (peek === '@BEGIN_FILE_ID.DIZ') {
          // TODO(cemmer): handle
          break;
        }

        let offset = 0;
        if (version === 2) {
          offset = (await fp.readNext(4)).readUInt32LE();
        } else if (version === 3) {
          offset = (await fp.readNext(4)).readUInt32LE()
                   + ((await fp.readNext(4)).readUInt32LE() * 0x100000000);
        }

        const bytesToChange = (await fp.readNext(1)).readUInt8();
        const data = await fp.readNext(bytesToChange);
        if (undoDataAvailable) {
          await fp.readNext(bytesToChange);
        }

        this.records.push({ offset, data });
      }

      await fp.close();
    });
  }

  async apply<T>(file: File, callback: (tempFile: string) => (Promise<T> | T)): Promise<T> {
    await this.parsePatch();

    return file.extractToFile(async (tempFile) => {
      const fp = await FilePoly.fileFrom(tempFile, 'r+');

      /* eslint-disable no-await-in-loop */
      for (let i = 0; i < this.records.length; i += 1) {
        const record = this.records[i];
        await fp.writeAt(record.data, record.offset);
      }

      await fp.close();

      return callback(tempFile);
    });
  }
}
