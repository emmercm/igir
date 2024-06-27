import path from 'node:path';

import Defaults from '../../../src/constants/defaults.js';
import FsPoly from '../../../src/polyfill/fsPoly.js';
import Zip from '../../../src/types/files/archives/zip.js';
import FileCache from '../../../src/types/files/fileCache.js';
import { ChecksumBitmask } from '../../../src/types/files/fileChecksums.js';

describe('loadFile', () => {
  it('should load after saving', async () => {
    const tempCache = await FsPoly.mktemp(path.join(Defaults.GLOBAL_TEMP_DIR, 'cache'));
    await FileCache.loadFile(tempCache);

    // Compute some values
    await FileCache.getOrComputeFile(path.join('test', 'fixtures', 'roms', 'raw', 'fizzbuzz.nes'), ChecksumBitmask.CRC32);
    await FileCache.getOrComputeEntries(new Zip(path.join('test', 'fixtures', 'roms', 'zip', 'foobar.zip')), ChecksumBitmask.CRC32);

    await FileCache.save();
    await FileCache.loadFile(tempCache);
  });
});
