import os from 'node:os';
import path from 'node:path';

import MappableSemaphore from '../../src/async/mappableSemaphore.js';
import FileCache from '../../src/cache/fileCache.js';
import FileFactory from '../../src/factories/fileFactory.js';
import Temp from '../../src/globals/temp.js';
import Options from '../../src/models/options.js';
import PatchScanner from '../../src/modules/patchScanner.js';
import FsUtil from '../../src/utils/fsUtil.js';
import ProgressBarFake from '../console/progressBarFake.js';

function createPatchScanner(
  patch: string[],
  patchExclude: string[] = [],
  isInputChecksumQuick = false,
): PatchScanner {
  return new PatchScanner(
    new Options({ patch, patchExclude, inputChecksumQuick: isInputChecksumQuick }),
    new ProgressBarFake(),
    new FileFactory(new FileCache()),
    new MappableSemaphore(os.availableParallelism()),
  );
}

it('should throw on nonexistent paths', async () => {
  await expect(createPatchScanner(['/completely/invalid/path']).scan()).rejects.toThrow(
    /no files found/i,
  );
  await expect(createPatchScanner(['/completely/invalid/path', os.devNull]).scan()).rejects.toThrow(
    /no files found/i,
  );
  await expect(createPatchScanner(['test/fixtures/**/*.tmp']).scan()).rejects.toThrow(
    /no files found/i,
  );
  await expect(createPatchScanner(['test/fixtures/roms/*foo*/*bar*']).scan()).rejects.toThrow(
    /no files found/i,
  );
});

it('should throw on no results', async () => {
  await expect(createPatchScanner([]).scan()).rejects.toThrow(/no files found/i);
  await expect(createPatchScanner(['']).scan()).rejects.toThrow(/no files found/i);
  await expect(createPatchScanner([os.devNull]).scan()).rejects.toThrow(/no files found/i);
});

it('should return empty list on non-patches', async () => {
  await expect(createPatchScanner(['test/fixtures/dats/**/*']).scan()).resolves.toHaveLength(0);
  await expect(createPatchScanner(['test/fixtures/roms/**/*']).scan()).resolves.toHaveLength(0);
});

it('should scan single files', async () => {
  await expect(
    createPatchScanner(['test/fixtures/patches/modify/modify-ips *.ips']).scan(),
  ).resolves.toHaveLength(1);
  await expect(
    createPatchScanner(['test/fixtures/*/*/modify-ips *.ips']).scan(),
  ).resolves.toHaveLength(1);
});

describe('multiple files', () => {
  it('should scan multiple files with no exclusions', async () => {
    const expectedPatchFiles = 41;
    await expect(createPatchScanner(['test/fixtures/patches/*/*']).scan()).resolves.toHaveLength(
      expectedPatchFiles,
    );
    await expect(createPatchScanner(['test/fixtures/patches/**/*']).scan()).resolves.toHaveLength(
      expectedPatchFiles,
    );
    await expect(
      createPatchScanner([
        'test/fixtures/*/*/*.{aps,bps,dps,ebp,ips,ips32,ppf,rup,ups,vcdiff,xdelta}',
      ]).scan(),
    ).resolves.toHaveLength(expectedPatchFiles);
  });

  test.each([false, true])(
    'should scan patches in an archive, quick checksums: %s',
    async (isInputChecksumQuick) => {
      // Quick checksums only have the CRC32s stored in the archive, which are the same for every
      // BPS and UPS patch
      await expect(
        createPatchScanner(
          ['test/fixtures/patches-zipped/patches.zip'],
          [],
          isInputChecksumQuick,
        ).scan(),
      ).resolves.toHaveLength(41);
    },
  );

  it('should deduplicate the same patches found in different places', async () => {
    await expect(
      createPatchScanner([
        'test/fixtures/patches/*/*',
        'test/fixtures/patches-zipped/patches.zip',
      ]).scan(),
    ).resolves.toHaveLength(41);
  });

  it('should keep different patches with the same CRC32 and size', async () => {
    // Both patches are 545 bytes, and BPS and UPS patches always have the same whole-file CRC32
    await expect(
      createPatchScanner([
        'test/fixtures/patches/grow/grow-bps.bps',
        'test/fixtures/patches/grow/grow-ups.ups',
      ]).scan(),
    ).resolves.toHaveLength(2);
  });

  it('should scan multiple files with some exclusions', async () => {
    await expect(
      createPatchScanner(['test/fixtures/patches/*/*'], ['test/fixtures/patches/**/*.ips*']).scan(),
    ).resolves.toHaveLength(34);
    await expect(
      createPatchScanner(
        ['test/fixtures/patches/*/*'],
        ['test/fixtures/patches/**/*.ips*', 'test/fixtures/patches/**/*.ips*'],
      ).scan(),
    ).resolves.toHaveLength(34);
  });

  it('should scan multiple files with every file excluded', async () => {
    await expect(
      createPatchScanner(['test/fixtures/patches/*/*'], ['test/fixtures/patches/*/*']).scan(),
    ).resolves.toHaveLength(0);
    await expect(
      createPatchScanner(
        ['test/fixtures/patches/*/*'],
        ['test/fixtures/patches/*/*', 'test/fixtures/patches/*/*'],
      ).scan(),
    ).resolves.toHaveLength(0);
  });

  it('should scan multiple files of incorrect extensions', async () => {
    const patchFiles = (
      await new Options({ patch: ['test/fixtures/patches/*/*'] }).scanPatchFilesWithoutExclusions()
    )
      .filter((filePath) => !FileFactory.isExtensionArchive(filePath))
      // DPS patches have no file signature, so they can only be found by their extension
      .filter((filePath) => path.extname(filePath) !== '.dps');

    const tempDir = await FsUtil.mkdtemp(Temp.getTempDir());
    try {
      const tempFiles = await Promise.all(
        patchFiles.map(async (patchFile) => {
          const tempFile = path.join(tempDir, `${path.basename(patchFile)}.txt`);
          await FsUtil.copyFile(patchFile, tempFile);
          return tempFile;
        }),
      );
      expect(tempFiles.length).toBeGreaterThan(0);
      await expect(createPatchScanner(tempFiles).scan()).resolves.toHaveLength(tempFiles.length);
    } finally {
      await FsUtil.rm(tempDir, { recursive: true });
    }
  });
});
