import type File from '../files/file.js';
import APSGBAPatch from './apsGbaPatch.js';
import APSN64Patch from './apsN64Patch.js';
import Patch from './patch.js';

/**
 * @see https://github.com/btimofeev/UniPatcher/wiki/APS-(N64)
 */
export default abstract class APSPatch extends Patch {
  static readonly SUPPORTED_EXTENSIONS = ['.aps'];

  static readonly FILE_SIGNATURE = Buffer.from('APS1');

  static async patchFrom(file: File): Promise<Patch> {
    return await file.extractToTempIOFile('r', async (patchFile) => {
      patchFile.seek(APSPatch.FILE_SIGNATURE.length);

      const byteFive = (await patchFile.readNext(1)).toString();
      const byteSix = (await patchFile.readNext(1)).readUInt8();

      if (byteFive === '0' && (byteSix === 0 || byteSix === 1)) {
        return await APSN64Patch.patchFrom(file);
      }
      return await APSGBAPatch.patchFrom(file);
    });
  }
}
