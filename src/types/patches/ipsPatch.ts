import path from 'path';

import File from '../files/file.js';
import Patch from './patch.js';

export default class IPSPatch extends Patch {
  constructor(file: File) {
    const crcBefore = IPSPatch.getCrcFromPath(file.getExtractedFilePath());
    super(file, crcBefore);
  }

  private static getCrcFromPath(filePath: string): string {
    const { name } = path.parse(filePath);

    const beforeMatches = name.match(/^([a-f0-9]{8})[^a-z0-9]/i);
    if (beforeMatches && beforeMatches?.length >= 2) {
      return beforeMatches[1].toUpperCase();
    }

    const afterMatches = name.match(/[^a-z0-9]([a-f0-9]{8})$/i);
    if (afterMatches && afterMatches?.length >= 2) {
      return afterMatches[1].toUpperCase();
    }

    throw new Error(`Couldn't parse base file CRC for patch: ${filePath}`);
  }
}
