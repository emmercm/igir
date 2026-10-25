import path from 'node:path';

import FileCache from '../../src/cache/fileCache.js';
import Temp from '../../src/globals/temp.js';
import Zip from '../../src/models/files/archives/zip.js';
import File from '../../src/models/files/file.js';
import { ChecksumBitmask } from '../../src/models/files/fileChecksums.js';
import FsUtil from '../../src/utils/fsUtil.js';

describe('loadFile', () => {
  it('should load after saving', async () => {
    const tempCache = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'cache'));
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
  // Also tested by candidateExtensionCorrector.test.ts, romTrimProcessor.test.ts

  it('should report progress against the number of bytes read', async () => {
    // 520 bytes, shorter than the signature probe's length
    const file = await File.fileOf({
      filePath: path.join('test', 'fixtures', 'roms', 'raw', 'trimmed.3ds'),
    });

    const progressCalls: [number, number | undefined][] = [];
    await new FileCache().getOrComputeFileSignature(file, (progress, total) => {
      progressCalls.push([progress, total]);
    });

    expect(progressCalls).toEqual([
      [0, 520],
      [520, undefined],
    ]);
  });
});

describe('getOrComputeFilePaddings', () => {
  // Tested by romTrimProcessor.test.ts
});
