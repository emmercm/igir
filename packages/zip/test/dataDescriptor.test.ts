import fs from 'node:fs';
import url from 'node:url';

import FsUtil, { WalkMode } from '../../../src/utils/fsUtil.js';
import DataDescriptor from '../src/dataDescriptor.js';
import ZipReader from '../src/zipReader.js';

const dirname = url.fileURLToPath(new URL('.', import.meta.url));
const fixtures = (await FsUtil.walk(dirname, WalkMode.FILES)).filter(
  (filePath) => !filePath.endsWith('.ts'),
);

describe('fromFileHandle', () => {
  test.each(fixtures)('%s', async (filePath) => {
    const entries = await new ZipReader(filePath).centralDirectoryFileHeaders();

    for (const entry of entries) {
      const localFileHeader = await entry.localFileHeader();
      if (!localFileHeader.hasDataDescriptor()) {
        continue;
      }

      const position =
        localFileHeader.getLocalFileDataRelativeOffset() + localFileHeader.compressedSizeResolved();
      const fileHandle = await fs.promises.open(filePath, 'r');
      let dataDescriptor: DataDescriptor;
      try {
        dataDescriptor = await DataDescriptor.fromFileHandle(
          fileHandle,
          position,
          localFileHeader.versionNeeded >= 45,
        );
      } finally {
        await fileHandle.close();
      }

      // The data descriptor must agree with the authoritative central directory values.
      expect(dataDescriptor.uncompressedCrc32String()).toEqual(entry.uncompressedCrc32String());
      expect(dataDescriptor.uncompressedSize).toEqual(entry.uncompressedSizeResolved());
      expect(dataDescriptor.raw.length).toEqual(
        (dataDescriptor.signaturePresent ? 4 : 0) +
          4 +
          (localFileHeader.versionNeeded >= 45 ? 16 : 8),
      );
    }
  });

  // Guard against the fixture-driven assertions silently becoming vacuous.
  test('parses at least one data descriptor across the fixtures', async () => {
    let descriptorCount = 0;
    for (const filePath of fixtures) {
      const entries = await new ZipReader(filePath).centralDirectoryFileHeaders();
      for (const entry of entries) {
        if ((await entry.localFileHeader()).hasDataDescriptor()) {
          descriptorCount += 1;
        }
      }
    }
    expect(descriptorCount).toBeGreaterThan(0);
  });
});

describe('uncompressedCrc32String', () => {
  test.each(fixtures)('%s', async (filePath) => {
    const entries = await new ZipReader(filePath).centralDirectoryFileHeaders();

    for (const entry of entries) {
      const dataDescriptor = await (await entry.localFileHeader()).dataDescriptor();
      if (dataDescriptor === undefined) {
        continue;
      }
      expect(dataDescriptor.uncompressedCrc32String()).toHaveLength(8);
      expect(dataDescriptor.uncompressedCrc32String()).toMatch(/^[0-9a-f]{8}$/);
    }
  });
});
