import fs from 'node:fs';

import Temp from '../../../src/globals/temp.js';
import FsUtil from '../../../src/utils/fsUtil.js';
import ArchiveExtraDataRecord from '../src/archiveExtraDataRecord.js';

if (!(await FsUtil.exists(Temp.getTempDir()))) {
  await FsUtil.mkdir(Temp.getTempDir(), { recursive: true });
}

/**
 * Build the bytes of an archive extra data record wrapping the given extra field data.
 */
function buildRecord(extraFieldData: Buffer): Buffer {
  const header = Buffer.allocUnsafe(8);
  header.set(ArchiveExtraDataRecord.ARCHIVE_EXTRA_DATA_RECORD_SIGNATURE);
  header.writeUInt32LE(extraFieldData.length, 4);
  return Buffer.concat([header, extraFieldData]);
}

/**
 * Write a buffer to a temporary file, run a callback with an open read handle, then clean up.
 */
async function withFile<T>(
  bytes: Buffer,
  callback: (fileHandle: fs.promises.FileHandle) => Promise<T>,
): Promise<T> {
  const filePath = await FsUtil.mktemp(Temp.getTempDir());
  await fs.promises.writeFile(filePath, bytes);
  const fileHandle = await fs.promises.open(filePath, 'r');
  try {
    return await callback(fileHandle);
  } finally {
    await fileHandle.close();
    await FsUtil.rm(filePath, { force: true });
  }
}

describe('fromFileHandle', () => {
  test('parses a record with extra field data', async () => {
    const extraFieldData = Buffer.from('archive extra data');
    const record = await withFile(
      buildRecord(extraFieldData),
      async (fileHandle) => await ArchiveExtraDataRecord.fromFileHandle(fileHandle, 0),
    );

    expect(record).toBeDefined();
    expect(record?.extraFieldLength).toEqual(extraFieldData.length);
    expect(record?.extraFieldData.equals(extraFieldData)).toEqual(true);
    expect(record?.raw.length).toEqual(8 + extraFieldData.length);
  });

  test('parses a record with no extra field data', async () => {
    const record = await withFile(
      buildRecord(Buffer.alloc(0)),
      async (fileHandle) => await ArchiveExtraDataRecord.fromFileHandle(fileHandle, 0),
    );

    expect(record).toBeDefined();
    expect(record?.extraFieldLength).toEqual(0);
    expect(record?.raw.length).toEqual(8);
  });

  test('parses a record at a non-zero position', async () => {
    const extraFieldData = Buffer.from('xyz');
    const prefix = Buffer.from('preceding bytes');
    const bytes = Buffer.concat([prefix, buildRecord(extraFieldData)]);
    const record = await withFile(
      bytes,
      async (fileHandle) => await ArchiveExtraDataRecord.fromFileHandle(fileHandle, prefix.length),
    );

    expect(record).toBeDefined();
    expect(record?.extraFieldData.equals(extraFieldData)).toEqual(true);
  });

  test('returns undefined when the signature is not present', async () => {
    const record = await withFile(
      Buffer.from('not a record at all'),
      async (fileHandle) => await ArchiveExtraDataRecord.fromFileHandle(fileHandle, 0),
    );

    expect(record).toBeUndefined();
  });
});
