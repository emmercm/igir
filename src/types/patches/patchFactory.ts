import path from 'path';

import File from '../files/file.js';
import BPSPatch from './bpsPatch.js';
import IPSPatch from './ipsPatch.js';
import NinjaPatch from './ninjaPatch.js';
import Patch from './patch.js';
import PPFPatch from './ppfPatch.js';
import UPSPatch from './upsPatch.js';
import VcdiffPatch from './vcdiffPatch.js';

export default class PatchFactory {
  static async patchFrom(file: File): Promise<Patch> {
    const filePath = file.getExtractedFilePath();

    if (BPSPatch.SUPPORTED_EXTENSIONS.some((ext) => filePath.toLowerCase().endsWith(ext))) {
      return BPSPatch.patchFrom(file);
    } if (IPSPatch.SUPPORTED_EXTENSIONS.some((ext) => filePath.toLowerCase().endsWith(ext))) {
      return IPSPatch.patchFrom(file);
    } if (NinjaPatch.SUPPORTED_EXTENSIONS.some((ext) => filePath.toLowerCase().endsWith(ext))) {
      return NinjaPatch.patchFrom(file);
    } if (PPFPatch.SUPPORTED_EXTENSIONS.some((ext) => filePath.toLowerCase().endsWith(ext))) {
      return PPFPatch.patchFrom(file);
    } if (UPSPatch.SUPPORTED_EXTENSIONS.some((ext) => filePath.toLowerCase().endsWith(ext))) {
      return UPSPatch.patchFrom(file);
    } if (VcdiffPatch.SUPPORTED_EXTENSIONS.some((ext) => filePath.toLowerCase().endsWith(ext))) {
      return VcdiffPatch.patchFrom(file);
    }

    throw new Error(`Unknown patch type: ${path.extname(filePath)}`);
  }

  static getSupportedExtensions(): string[] {
    return [
      ...BPSPatch.SUPPORTED_EXTENSIONS,
      ...IPSPatch.SUPPORTED_EXTENSIONS,
      ...NinjaPatch.SUPPORTED_EXTENSIONS,
      ...PPFPatch.SUPPORTED_EXTENSIONS,
      ...UPSPatch.SUPPORTED_EXTENSIONS,
      ...VcdiffPatch.SUPPORTED_EXTENSIONS,
    ]
      .sort()
      .filter((ext, idx, exts) => exts.indexOf(ext) === idx);
  }
}
