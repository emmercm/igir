import File from '../files/file.js';
import IPSPatch from './ipsPatch.js';
import Patch from './patch.js';

export default class PatchFactory {
  static patchFrom(file: File): Patch {
    if (file.getExtractedFilePath().toLowerCase().endsWith('.ips')) {
      return new IPSPatch(file);
    }

    throw new Error(`Unknown patch type: ${file.toString()}`);
  }
}
