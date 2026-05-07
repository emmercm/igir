import path from 'node:path';

import Temp from '../../../src/globals/temp.js';
import Zip from '../../../src/models/files/archives/zip.js';
import FileCache from '../../../src/models/files/fileCache.js';
import { ChecksumBitmask } from '../../../src/models/files/fileChecksums.js';
import FsPoly from '../../../src/polyfill/fsPoly.js';

describe('loadFile', () => {
  it('should load after saving', async () => {
    const tempCache = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'cache'));
    const fileCache = new FileCache();
    await fileCache.loadFile(tempCache);

    // Compute some values
    await fileCache.getOrComputeFileChecksums(
      path.join('test', 'fixtures', 'roms', 'raw', 'fizzbuzz.nes'),
      ChecksumBitmask.CRC32,
    );
    await fileCache.getOrComputeArchiveChecksums(
      new Zip(path.join('test', 'fixtures', 'roms', 'zip', 'foobar.zip')),
      ChecksumBitmask.CRC32,
    );

    await fileCache.save();
    await fileCache.loadFile(tempCache);
  });
});

describe('getOrComputeFileSignature', () => {
  // Tested by candidateExtensionCorrector.test.ts, romTrimProcessor.test.ts
});

describe('getOrComputeFileHeader', () => {
  // Tested by romHeaderProcessor.test.ts
});

describe('getOrComputeFilePaddings', () => {
  // Tested by romTrimProcessor.test.ts
});
