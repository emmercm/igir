import crypto from 'node:crypto';
import path from 'node:path';
import stream from 'node:stream';

import dolphin, { ContainerFormat } from '../index.js';

const FIXTURES = path.join(import.meta.dirname, 'fixtures');

const EXPECTED_ISO_SIZE = 1_441_792;
const EXPECTED_ISO_SHA1 = 'e3d1df9d19ecc7e8f71ac50aacb55e689f331f45';

// A real Wii disc (unlike the GameCube fixtures below) stores its game partition
// encrypted and hashed with a per-title AES key; WIA/RVZ containers store only the
// decrypted, de-hashed partition data and must re-derive the original hash tree and
// re-encrypt it on read (see binding.cpp's ported VolumeWii region). These fixtures
// exercise that path.
//
// The GCZ fixture's source disc image is zero-padded past its real content, while
// WIA's junk-data reconstruction (Dolphin's LaggedFibonacciGenerator, unrelated to
// the decrypt/hash port) correctly regenerates Nintendo's disc-mastering
// pseudo-random pattern for that same unused space instead of storing zeros. GCZ
// has no Wii-specific logic (it's a generic compressed raw-sector dump), so its
// decoded output legitimately differs from WIA's past that point -- hence separate
// expected checksums per format rather than one shared value.
const WII_DECOMPRESSED_SIZE = 4_699_979_776;
const WII_GCZ_SHA1 = '85581927a3f7652b2d6d06b1b90a76109eb50ca8';
const WII_WIA_SHA1 = 'a9ce9b2edcdbfb525631178c2ea12d32b4994ab6';

const cases = [
  {
    format: ContainerFormat.GCZ,
    file: '240pSuite-GameCube-1.20.gcz',
    size: EXPECTED_ISO_SIZE,
    sha1: EXPECTED_ISO_SHA1,
  },
  {
    format: ContainerFormat.RVZ,
    file: '240pSuite-GameCube-1.20.bzip2.rvz',
    size: EXPECTED_ISO_SIZE,
    sha1: EXPECTED_ISO_SHA1,
  },
  {
    format: ContainerFormat.RVZ,
    file: '240pSuite-GameCube-1.20.lzma.rvz',
    size: EXPECTED_ISO_SIZE,
    sha1: EXPECTED_ISO_SHA1,
  },
  {
    format: ContainerFormat.RVZ,
    file: '240pSuite-GameCube-1.20.lzma2.rvz',
    size: EXPECTED_ISO_SIZE,
    sha1: EXPECTED_ISO_SHA1,
  },
  {
    format: ContainerFormat.RVZ,
    file: '240pSuite-GameCube-1.20.zstd.rvz',
    size: EXPECTED_ISO_SIZE,
    sha1: EXPECTED_ISO_SHA1,
  },
  {
    format: ContainerFormat.GCZ,
    file: '240pSuite-Wii-1.20.gcz',
    size: WII_DECOMPRESSED_SIZE,
    sha1: WII_GCZ_SHA1,
  },
  {
    format: ContainerFormat.WIA,
    file: '240pSuite-Wii-1.20.bzip2.wia',
    size: WII_DECOMPRESSED_SIZE,
    sha1: WII_WIA_SHA1,
  },
  {
    format: ContainerFormat.WIA,
    file: '240pSuite-Wii-1.20.lzma.wia',
    size: WII_DECOMPRESSED_SIZE,
    sha1: WII_WIA_SHA1,
  },
  {
    format: ContainerFormat.WIA,
    file: '240pSuite-Wii-1.20.lzma2.wia',
    size: WII_DECOMPRESSED_SIZE,
    sha1: WII_WIA_SHA1,
  },
  {
    format: ContainerFormat.WIA,
    file: '240pSuite-Wii-1.20.purge.wia',
    size: WII_DECOMPRESSED_SIZE,
    sha1: WII_WIA_SHA1,
  },
];

describe('info', () => {
  it.each(cases)(
    'should read the $format header without decompressing ($file)',
    async ({ format, file, size }) => {
      const info = await dolphin.info({ inputFilename: path.join(FIXTURES, file) });
      expect(info.format).toEqual(format);
      expect(info.decompressedSize).toEqual(size);
      expect(Object.values(ContainerFormat)).toContain(info.format);
    },
  );

  it('should reject a non-Dolphin file', async () => {
    await expect(
      dolphin.info({
        inputFilename: `${path.join(FIXTURES, '240pSuite-GameCube-1.20.gcz')}.missing`,
      }),
    ).rejects.toThrow();
  });
});

describe('openReader', () => {
  it.each(cases)(
    'should stream $format to the exact decoded ISO ($file)',
    async ({ file, size, sha1 }) => {
      const readable = await dolphin.openReader({ inputFilename: path.join(FIXTURES, file) });
      const hash = crypto.createHash('sha1');
      let total = 0;
      for await (const chunk of readable) {
        total += (chunk as Buffer).length;
        hash.update(chunk as Buffer);
      }
      expect(total).toEqual(size);
      expect(hash.digest('hex')).toEqual(sha1);
    },
  );

  it('should not leak a handle when destroyed mid-stream', async () => {
    const readable = await dolphin.openReader({
      inputFilename: path.join(FIXTURES, '240pSuite-GameCube-1.20.bzip2.rvz'),
    });
    await new Promise<void>((resolve) =>
      readable.once('readable', () => {
        resolve();
      }),
    );
    readable.destroy();
    await new Promise<void>((resolve) =>
      readable.once('close', () => {
        resolve();
      }),
    );
    // A second independent reader must still open the same file (handle was released).
    const again = await dolphin.openReader({
      inputFilename: path.join(FIXTURES, '240pSuite-GameCube-1.20.bzip2.rvz'),
    });
    again.destroy();
    expect(again).toBeInstanceOf(stream.Readable);
  });
});
