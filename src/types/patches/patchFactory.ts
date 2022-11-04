import File from '../files/file.js';
import BPSPatch from './bpsPatch.js';
import IPSPatch from './ipsPatch.js';
import Patch from './patch.js';
import PPFPatch from './ppfPatch.js';

export default class PatchFactory {
  static async patchFrom(file: File): Promise<Patch> {
    if (file.getExtractedFilePath().toLowerCase().endsWith('.bps')) {
      return BPSPatch.patchFrom(file);
    } if (file.getExtractedFilePath().toLowerCase().endsWith('.ips')) {
      return IPSPatch.patchFrom(file);
    } if (file.getExtractedFilePath().toLowerCase().endsWith('.ppf')) {
      return PPFPatch.patchFrom(file);
    }

    throw new Error(`Unknown patch type: ${file.toString()}`);
  }
}
