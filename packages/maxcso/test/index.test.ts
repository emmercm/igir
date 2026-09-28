import events from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import worker_threads from 'node:worker_threads';
import zlib from 'node:zlib';

import Temp from '../../../src/globals/temp.js';
import gracefulFs from '../../../src/polyfill/gracefulFs.js';
import BufferUtil from '../../../src/utils/bufferUtil.js';
import FsUtil from '../../../src/utils/fsUtil.js';
import maxcso, { MaxcsoFormat } from '../index.js';

gracefulFs.gracefulify(fs);

/**
 * The size of the ISO every maxcso fixture holds: sector-aligned (2 KiB), but a multiple of
 * neither 16 KiB nor 256 KiB, so the last block of those fixtures is short.
 */
const PAYLOAD_SIZE = 602 * 1024;

/**
 * Build the ISO every maxcso fixture holds, which the decompression tests compare output against.
 *
 * - Fills every byte with `position % 251`. 251 is prime, so the pattern doesn't line up with any
 *   block size, and a torn, reordered, or shifted block changes the output.
 * - Overwrites 64 KiB–96 KiB with an xorshift keystream, which doesn't compress, so maxcso stored
 *   those blocks uncompressed.
 * - Overwrites 128 KiB–144 KiB with zeros.
 */
function fixturePayload(): Buffer {
  const payload = Buffer.alloc(PAYLOAD_SIZE);
  for (let i = 0; i < payload.length; i++) {
    payload[i] = i % 251;
  }
  let state = 0x9e_37_79_b9;
  for (let i = 64 * 1024; i < 96 * 1024; i++) {
    state = (state ^ (state << 13)) >>> 0;
    state = (state ^ (state >>> 17)) >>> 0;
    state = (state ^ (state << 5)) >>> 0;
    payload[i] = state & 0xff;
  }
  payload.fill(0, 128 * 1024, 144 * 1024);
  return payload;
}

const FIXTURE_DIR = path.join('packages', 'maxcso', 'test', 'fixtures');
const DAX_FRAME_SIZE = 8192;
const PAYLOAD = fixturePayload();

/**
 * Maps a fixture's file extension to the format the tests read it as.
 */
const FORMATS_BY_EXTENSION = new Map<string, MaxcsoFormat>([
  ['.cso', MaxcsoFormat.CSO],
  ['.zso', MaxcsoFormat.ZSO],
  ['.dax', MaxcsoFormat.DAX],
]);

interface Fixture {
  label: string;
  format: MaxcsoFormat;
  blockSize: number;
  archivePath: string;
}

/**
 * Scan a fixture subdirectory for files, and return them in a stable order.
 */
function fixtures(directory: string, blockSize: number): Fixture[] {
  return fs
    .readdirSync(path.join(FIXTURE_DIR, directory))
    .toSorted((a, b) => a.localeCompare(b))
    .map((file) => {
      const format = FORMATS_BY_EXTENSION.get(path.extname(file));
      if (format === undefined) {
        throw new Error(`no format is mapped to the extension of fixture: ${file}`);
      }
      return {
        label: path.join(directory, file),
        format,
        blockSize: format === MaxcsoFormat.DAX ? DAX_FRAME_SIZE : blockSize,
        archivePath: path.join(FIXTURE_DIR, directory, file),
      };
    });
}

const DEFAULT_BLOCK_SIZE_FIXTURES = fixtures('default-block-size', 2048);
const BLOCK_SIZE_16K_FIXTURES = fixtures('16k-block-size', 16_384);
const BLOCK_SIZE_256K_FIXTURES = fixtures('256k-block-size', 262_144);
const DAX_NC_AREA_FIXTURES = fixtures('dax-nc-areas', DAX_FRAME_SIZE);
const ALL_FIXTURES = [
  ...DEFAULT_BLOCK_SIZE_FIXTURES,
  ...BLOCK_SIZE_16K_FIXTURES,
  ...BLOCK_SIZE_256K_FIXTURES,
  ...DAX_NC_AREA_FIXTURES,
];

const CSO1_ZLIB = path.join(FIXTURE_DIR, 'default-block-size', 'cso1-zlib.cso');
const CSO1_ZLIB_16K = path.join(FIXTURE_DIR, '16k-block-size', 'cso1-zlib.cso');
const ZSO_LZ4 = path.join(FIXTURE_DIR, 'default-block-size', 'zso-lz4.zso');
const DAX_ZLIB = path.join(FIXTURE_DIR, 'default-block-size', 'dax-zlib.dax');
const DAX_NC_AREAS = path.join(FIXTURE_DIR, 'dax-nc-areas', 'dax-zlib-nc-areas.dax');

/**
 * Return the first position where two buffers differ, or -1 when they're equal. This reports a torn
 * block far more usefully than a failed `equals()`.
 */
function firstMismatch(actual: Buffer, expected: Buffer): number {
  const length = Math.min(actual.length, expected.length);
  for (let i = 0; i < length; i++) {
    if (actual[i] !== expected[i]) {
      return i;
    }
  }
  return actual.length === expected.length ? -1 : length;
}

/**
 * Run `callback` against a temporary directory that is removed afterwards, however it finishes.
 */
async function withTempDir<T>(callback: (directory: string) => Promise<T> | T): Promise<T> {
  if (!(await FsUtil.exists(Temp.getTempDir()))) {
    await FsUtil.mkdir(Temp.getTempDir(), { recursive: true });
  }
  const directory = await FsUtil.mkdtemp(Temp.getTempDir());
  try {
    return await callback(directory);
  } finally {
    await FsUtil.rm(directory, { recursive: true, force: true });
  }
}

/**
 * Write `mutate(fixture bytes)` into a temporary directory and run `callback` against it.
 */
async function withMutatedFixture<T>(
  fixturePath: string,
  mutate: (bytes: Buffer) => Buffer,
  callback: (filePath: string) => Promise<T>,
): Promise<T> {
  return await withTempDir(async (directory) => {
    const filePath = path.join(directory, path.basename(fixturePath));
    await fs.promises.writeFile(filePath, mutate(await fs.promises.readFile(fixturePath)));
    return await callback(filePath);
  });
}

function withUInt8(offset: number, value: number): (bytes: Buffer) => Buffer {
  return (bytes) => {
    const copy = Buffer.from(bytes);
    copy.writeUInt8(value, offset);
    return copy;
  };
}

function withUInt16(offset: number, value: number): (bytes: Buffer) => Buffer {
  return (bytes) => {
    const copy = Buffer.from(bytes);
    copy.writeUInt16LE(value, offset);
    return copy;
  };
}

function withUInt32(offset: number, value: number): (bytes: Buffer) => Buffer {
  return (bytes) => {
    const copy = Buffer.from(bytes);
    copy.writeUInt32LE(value, offset);
    return copy;
  };
}

function withUInt64(offset: number, value: number): (bytes: Buffer) => Buffer {
  return (bytes) => {
    const copy = Buffer.from(bytes);
    copy.writeBigUInt64LE(BigInt(value), offset);
    return copy;
  };
}

/**
 * Return the file offset of CSO/ZSO block `block`, read from the index.
 */
function csoBlockOffset(bytes: Buffer, block: number): number {
  return (bytes.readUInt32LE(24 + block * 4) & 0x7f_ff_ff_ff) * 2 ** bytes.readUInt8(21);
}

/**
 * Replace the last block of a CSO v1 file with `data`, padded to the index alignment, and truncate
 * the file after it. `isStored` sets the block's uncompressed flag; otherwise it's decoded as deflate.
 */
function withLastBlock(data: Buffer, isStored: boolean): (bytes: Buffer) => Buffer {
  return (bytes) => {
    const blockSize = bytes.readUInt32LE(16);
    const last = Math.ceil(Number(bytes.readBigUInt64LE(8)) / blockSize) - 1;
    const alignment = 2 ** bytes.readUInt8(21);
    const start = csoBlockOffset(bytes, last);
    const padding = Buffer.alloc(Math.ceil(data.length / alignment) * alignment - data.length);
    const rebuilt = Buffer.concat([bytes.subarray(0, start), data, padding]);
    rebuilt.writeUInt32LE(start / alignment + (isStored ? 0x80_00_00_00 : 0), 24 + last * 4);
    rebuilt.writeUInt32LE(rebuilt.length / alignment, 24 + (last + 1) * 4);
    return rebuilt;
  };
}

/**
 * Return the payload bytes in the last block of a fixture with the given block size, which is short
 * when the block size doesn't divide the payload.
 */
function finalBlockPayload(blockSize: number): Buffer {
  return PAYLOAD.subarray((Math.ceil(PAYLOAD_SIZE / blockSize) - 1) * blockSize);
}

/**
 * Return the index of the last block of a fixture with the given block size.
 */
function finalBlock(blockSize: number): number {
  return Math.ceil(PAYLOAD_SIZE / blockSize) - 1;
}

/**
 * Return `length` bytes that don't form a valid deflate stream, to pad blocks with.
 */
function junk(length: number): Buffer {
  return Buffer.alloc(length, 0xa5);
}

/**
 * Insert one more DAX NC area after the existing ones, moving every frame to make room for it.
 */
function withExtraDaxArea(start: number, count: number): (bytes: Buffer) => Buffer {
  return (bytes) => {
    const frames = Math.ceil(bytes.readUInt32LE(4) / DAX_FRAME_SIZE);
    const areas = bytes.readUInt32LE(12);
    const tableEnd = 32 + frames * 6 + areas * 8;
    const area = Buffer.alloc(8);
    area.writeUInt32LE(start, 0);
    area.writeUInt32LE(count, 4);
    const rebuilt = Buffer.concat([bytes.subarray(0, tableEnd), area, bytes.subarray(tableEnd)]);
    rebuilt.writeUInt32LE(areas + 1, 12);
    for (let frame = 0; frame < frames; frame++) {
      rebuilt.writeUInt32LE(rebuilt.readUInt32LE(32 + frame * 4) + 8, 32 + frame * 4);
    }
    return rebuilt;
  };
}

/**
 * Build a CSO v1 file with a 3072-byte block size and every sector stored, laid out the way
 * upstream maxcso reads one. Upstream finds a position's index entry by shifting by 11 (log2 of 3072,
 * rounded down) and its offset into that entry by masking with 3071, so every sector has its own
 * entry, and odd sectors are read 2048 bytes into theirs.
 */
function nonPowerOfTwoCso(): Buffer {
  const blockSize = 3072;
  const sectors = PAYLOAD_SIZE / 2048;
  const entries = Math.floor((PAYLOAD_SIZE + blockSize - 1) / 2048) + 1;
  const header = Buffer.alloc(24);
  header.write('CISO', 0, 'latin1');
  header.writeUInt32LE(24, 4);
  header.writeBigUInt64LE(BigInt(PAYLOAD_SIZE), 8);
  header.writeUInt32LE(blockSize, 16);
  header.writeUInt8(1, 20);
  const index = Buffer.alloc(entries * 4);
  const dataStart = header.length + index.length;
  const regions = Buffer.alloc(sectors * 4096);
  for (let sector = 0; sector < sectors; sector++) {
    PAYLOAD.copy(regions, sector * 4096 + (sector % 2) * 2048, sector * 2048, (sector + 1) * 2048);
    index.writeUInt32LE(dataStart + sector * 4096 + 0x80_00_00_00, sector * 4);
  }
  for (let entry = sectors; entry < entries; entry++) {
    index.writeUInt32LE(dataStart + regions.length, entry * 4);
  }
  return Buffer.concat([header, index, regions]);
}

/**
 * Rebuild a CSO v1 or ZSO file with `index_shift = shift`, aligning each block to `2 ** shift`
 * bytes with zero padding. maxcso only shifts the index for ISOs over 2 GiB, so this is the only
 * way to cover shifted, padded block positions.
 */
function withIndexShift(bytes: Buffer, shift: number): Buffer {
  const blockSize = bytes.readUInt32LE(16);
  const blocks = Math.ceil(Number(bytes.readBigUInt64LE(8)) / blockSize);
  const alignment = 2 ** shift;
  const alignUp = (value: number): number => Math.ceil(value / alignment) * alignment;

  const header = Buffer.from(bytes.subarray(0, 24));
  header.writeUInt8(shift, 21);
  const index = Buffer.alloc((blocks + 1) * 4);
  let offset = alignUp(header.length + index.length);
  const parts: Buffer[] = [header, index, Buffer.alloc(offset - header.length - index.length)];
  for (let block = 0; block < blocks; block++) {
    const data = bytes.subarray(csoBlockOffset(bytes, block), csoBlockOffset(bytes, block + 1));
    const flag = bytes.readUInt32LE(24 + block * 4) >= 0x80_00_00_00 ? 0x80_00_00_00 : 0;
    index.writeUInt32LE(offset / alignment + flag, block * 4);
    parts.push(data, Buffer.alloc(alignUp(data.length) - data.length));
    offset += alignUp(data.length);
  }
  index.writeUInt32LE(offset / alignment, blocks * 4);
  return Buffer.concat(parts);
}

interface Corruption {
  label: string;
  fixture: string;
  mutate: (bytes: Buffer) => Buffer;
  error: string | RegExp;
}

/**
 * Files that upstream maxcso rejects while opening, or that would make it read or write out of
 * bounds while opening. Both `info` and `openReader` must reject them.
 */
const OPEN_CORRUPTIONS: Corruption[] = [
  {
    label: 'an empty file',
    fixture: CSO1_ZLIB,
    mutate: () => Buffer.alloc(0),
    error: 'file is too small to be a CSO, ZSO, or DAX file',
  },
  {
    label: 'a file shorter than a header',
    fixture: CSO1_ZLIB,
    mutate: (bytes) => bytes.subarray(0, 23),
    error: 'file is too small to be a CSO, ZSO, or DAX file',
  },
  {
    label: 'random bytes',
    fixture: CSO1_ZLIB,
    mutate: () => Buffer.alloc(4096, 0xa5),
    error: 'not a CSO, ZSO, or DAX file (unrecognized magic)',
  },
  {
    label: 'a block size under 2 KiB',
    fixture: CSO1_ZLIB,
    mutate: withUInt32(16, 1024),
    error: 'block size 1024 is not from 2048 to 262144',
  },
  {
    label: 'a block size over 256 KiB',
    fixture: CSO1_ZLIB,
    mutate: withUInt32(16, 524_288),
    error: 'block size 524288 is not from 2048 to 262144',
  },
  {
    label: 'an unaligned uncompressed size',
    fixture: CSO1_ZLIB,
    mutate: withUInt64(8, 616_449),
    error: 'uncompressed size 616449 is not a multiple of 2048',
  },
  {
    label: 'an uncompressed size whose index does not fit in the file',
    fixture: CSO1_ZLIB,
    mutate: withUInt64(8, 2 ** 41),
    error: 'CSO index does not fit in the file',
  },
  {
    label: 'an uncompressed size whose index has more than 2^32 entries',
    fixture: CSO1_ZLIB,
    mutate: withUInt64(8, 2 ** 44),
    error: 'CSO index has too many entries',
  },
  {
    label: 'an uncompressed size that overflows a signed 64-bit integer',
    fixture: CSO1_ZLIB,
    mutate: withUInt64(8, 2 ** 63),
    error: 'uncompressed size 9223372036854775808 is too large',
  },
  {
    label: 'an unsupported CSO version',
    fixture: CSO1_ZLIB,
    mutate: withUInt8(20, 3),
    error: 'unsupported CSO/ZSO version 3',
  },
  {
    label: 'a DAX frame table that does not fit in the file',
    fixture: DAX_ZLIB,
    mutate: (bytes) => bytes.subarray(0, 100),
    error: 'DAX frame table does not fit in the file',
  },
  {
    label: 'more DAX NC areas than were written, which reads frame data as areas',
    fixture: DAX_NC_AREAS,
    mutate: withUInt32(12, 77),
    error: 'DAX NC area 2 is out of range',
  },
  {
    label: 'a DAX NC area past the last frame',
    fixture: DAX_NC_AREAS,
    mutate: (bytes) => withUInt32(32 + 76 * 6 + 4, 4)(withUInt32(32 + 76 * 6, 75)(bytes)),
    error: 'DAX NC area 0 is out of range',
  },
  {
    label: 'a DAX NC area that starts past the last frame',
    fixture: DAX_NC_AREAS,
    mutate: withExtraDaxArea(76, 1),
    error: 'DAX NC area 2 is out of range',
  },
  {
    label: 'an unsupported DAX version',
    fixture: DAX_ZLIB,
    mutate: withUInt32(8, 2),
    error: 'unsupported DAX version 2',
  },
];

/**
 * Files that upstream maxcso opens but fails, never finishes, or reads out of bounds or from stale
 * memory while decoding. `info` must accept them, and `openReader` must reject them.
 */
const DECODE_CORRUPTIONS: Corruption[] = [
  {
    label: 'a file truncated at half',
    fixture: CSO1_ZLIB,
    mutate: (bytes) => bytes.subarray(0, Math.floor(bytes.length / 2)),
    error: /block \d+ points past the end of the file/,
  },
  {
    label: 'a block size of 3000, which upstream reads each 2 KiB block twice with',
    fixture: CSO1_ZLIB,
    mutate: withUInt32(16, 3000),
    error: 'block 1 has too few bytes for its sectors',
  },
  {
    label: 'an index shift of 32',
    fixture: CSO1_ZLIB,
    mutate: withUInt8(21, 32),
    error: 'block 0 points past the end of the file',
  },
  {
    label: 'an index shift of 64',
    fixture: CSO1_ZLIB,
    mutate: withUInt8(21, 64),
    error: 'index shift 64 is 64 or more',
  },
  {
    label: 'a non-monotonic index entry',
    fixture: CSO1_ZLIB,
    mutate: withUInt32(24 + 2 * 4, 0),
    error: 'block 1 is longer than 32768 bytes',
  },
  {
    label: 'a final index entry far past the end of the file',
    fixture: CSO1_ZLIB,
    mutate: withUInt32(24 + 301 * 4, 0x7f_ff_ff_ff),
    error: 'block 300 is longer than 32768 bytes',
  },
  {
    label: 'a final index entry one byte past the end of the file',
    fixture: CSO1_ZLIB,
    mutate: (bytes) => withUInt32(24 + 301 * 4, bytes.length + 1)(bytes),
    error: 'block 300 points past the end of the file',
  },
  {
    label: 'a deflate block with a reserved block type',
    fixture: CSO1_ZLIB,
    mutate: (bytes): Buffer => {
      const copy = Buffer.from(bytes);
      copy[csoBlockOffset(copy, 0)] = 0xff;
      return copy;
    },
    error: 'block 0 failed to decompress (deflate)',
  },
  {
    label: 'an LZ4 block of garbage that decodes to less than a sector',
    fixture: ZSO_LZ4,
    mutate: (bytes): Buffer => {
      const copy = Buffer.from(bytes);
      copy.fill(0xff, csoBlockOffset(copy, 0), csoBlockOffset(copy, 1));
      return copy;
    },
    error: 'block 0 has too few bytes for its sectors',
  },
  {
    label: 'an LZ4 block that copies from before its start',
    fixture: ZSO_LZ4,
    mutate: (bytes): Buffer => {
      const copy = Buffer.from(bytes);
      copy.fill(0, csoBlockOffset(copy, 0), csoBlockOffset(copy, 1));
      copy.writeUInt16LE(0xff_ff, csoBlockOffset(copy, 0) + 1);
      return copy;
    },
    error: 'block 0 failed to decompress (LZ4)',
  },
  {
    label: 'a DAX frame with a bad Adler-32 trailer',
    fixture: DAX_ZLIB,
    mutate: (bytes): Buffer => {
      const copy = Buffer.from(bytes);
      const last = copy.readUInt32LE(32) + copy.readUInt16LE(32 + 76 * 4) - 1;
      copy[last] ^= 0xff;
      return copy;
    },
    error: 'block 0 failed to decompress (zlib)',
  },
  {
    label: 'a short final deflate block that decodes one byte too few',
    fixture: CSO1_ZLIB_16K,
    mutate: withLastBlock(zlib.deflateRawSync(finalBlockPayload(16_384).subarray(0, -1)), false),
    error: `block ${finalBlock(16_384)} has too few bytes for its sectors`,
  },
  {
    label: 'a short final deflate block that decodes one sector too few',
    fixture: CSO1_ZLIB_16K,
    mutate: withLastBlock(zlib.deflateRawSync(finalBlockPayload(16_384).subarray(0, -2048)), false),
    error: `block ${finalBlock(16_384)} has too few bytes for its sectors`,
  },
  {
    label: 'a final deflate block that decodes one byte past the block size',
    fixture: CSO1_ZLIB_16K,
    mutate: withLastBlock(
      zlib.deflateRawSync(
        Buffer.concat([
          finalBlockPayload(16_384),
          Buffer.alloc(16_384 - finalBlockPayload(16_384).length + 1),
        ]),
      ),
      false,
    ),
    error: `block ${finalBlock(16_384)} failed to decompress (deflate)`,
  },
  {
    label: 'a final stored block one byte shorter than a sector',
    fixture: CSO1_ZLIB,
    mutate: withLastBlock(finalBlockPayload(2048).subarray(0, -1), true),
    error: `block ${finalBlock(2048)} has too few bytes for its sectors`,
  },
  {
    label: 'a final stored block longer than the 32 KiB read buffer',
    fixture: CSO1_ZLIB,
    mutate: withLastBlock(Buffer.concat([finalBlockPayload(2048), junk(32_769 - 2048)]), true),
    error: `block ${finalBlock(2048)} is longer than 32768 bytes`,
  },
  {
    label: 'a DAX frame longer than the 32 KiB read buffer',
    fixture: DAX_ZLIB,
    mutate: withUInt16(32 + 76 * 4, 40_000),
    error: 'block 0 is longer than 32768 bytes',
  },
];

interface Acceptance {
  label: string;
  fixture: string;
  mutate: (bytes: Buffer) => Buffer;
  format: MaxcsoFormat;
  uncompressedSize: number;
  blockSize: number;
  output: Buffer;
}

/**
 * Unusual files that upstream maxcso decodes, and what it decodes them to.
 */
const ACCEPTANCES: Acceptance[] = [
  {
    label: 'a CSO header size of zero',
    fixture: CSO1_ZLIB,
    mutate: withUInt32(4, 0),
    format: MaxcsoFormat.CSO,
    uncompressedSize: PAYLOAD_SIZE,
    blockSize: 2048,
    output: PAYLOAD,
  },
  {
    label: 'a ZSO header size of zero',
    fixture: ZSO_LZ4,
    mutate: withUInt32(4, 0),
    format: MaxcsoFormat.ZSO,
    uncompressedSize: PAYLOAD_SIZE,
    blockSize: 2048,
    output: PAYLOAD,
  },
  {
    label: 'an uncompressed size of zero',
    fixture: CSO1_ZLIB,
    mutate: withUInt64(8, 0),
    format: MaxcsoFormat.CSO,
    uncompressedSize: 0,
    blockSize: 2048,
    output: Buffer.alloc(0),
  },
  {
    label: 'an uncompressed size of zero and an index shift of 255',
    fixture: CSO1_ZLIB,
    mutate: (bytes) => withUInt8(21, 255)(withUInt64(8, 0)(bytes)),
    format: MaxcsoFormat.CSO,
    uncompressedSize: 0,
    blockSize: 2048,
    output: Buffer.alloc(0),
  },
  {
    label: 'an empty 24-byte DAX file',
    fixture: DAX_ZLIB,
    mutate: (bytes) => withUInt32(4, 0)(bytes.subarray(0, 24)),
    format: MaxcsoFormat.DAX,
    uncompressedSize: 0,
    blockSize: DAX_FRAME_SIZE,
    output: Buffer.alloc(0),
  },
  {
    label: 'a block size that is not a power of two',
    fixture: CSO1_ZLIB,
    mutate: () => nonPowerOfTwoCso(),
    format: MaxcsoFormat.CSO,
    uncompressedSize: PAYLOAD_SIZE,
    blockSize: 3072,
    output: PAYLOAD,
  },
  {
    label: 'a short final deflate block that decodes exactly the bytes it needs',
    fixture: CSO1_ZLIB_16K,
    mutate: withLastBlock(zlib.deflateRawSync(finalBlockPayload(16_384)), false),
    format: MaxcsoFormat.CSO,
    uncompressedSize: PAYLOAD_SIZE,
    blockSize: 16_384,
    output: PAYLOAD,
  },
  {
    label: 'a short final deflate block that decodes a whole block',
    fixture: CSO1_ZLIB_16K,
    mutate: withLastBlock(
      zlib.deflateRawSync(
        Buffer.concat([
          finalBlockPayload(16_384),
          Buffer.alloc(16_384 - finalBlockPayload(16_384).length, 0xa5),
        ]),
      ),
      false,
    ),
    format: MaxcsoFormat.CSO,
    uncompressedSize: PAYLOAD_SIZE,
    blockSize: 16_384,
    output: PAYLOAD,
  },
  {
    label: 'a deflate block padded past twice the block size',
    fixture: CSO1_ZLIB,
    mutate: withLastBlock(
      Buffer.concat([zlib.deflateRawSync(finalBlockPayload(2048)), junk(5000)]),
      false,
    ),
    format: MaxcsoFormat.CSO,
    uncompressedSize: PAYLOAD_SIZE,
    blockSize: 2048,
    output: PAYLOAD,
  },
  {
    label: 'a stored block exactly as long as the 32 KiB read buffer',
    fixture: CSO1_ZLIB,
    mutate: withLastBlock(Buffer.concat([finalBlockPayload(2048), junk(32_768 - 2048)]), true),
    format: MaxcsoFormat.CSO,
    uncompressedSize: PAYLOAD_SIZE,
    blockSize: 2048,
    output: PAYLOAD,
  },
  {
    label: 'a DAX frame longer than twice the frame size',
    fixture: DAX_ZLIB,
    mutate: withUInt16(32 + 76 * 4, 20_000),
    format: MaxcsoFormat.DAX,
    uncompressedSize: PAYLOAD_SIZE,
    blockSize: DAX_FRAME_SIZE,
    output: PAYLOAD,
  },
  {
    label: 'a DAX NC area count too large for a signed 32-bit integer',
    fixture: DAX_ZLIB,
    mutate: (bytes) => withUInt32(12, 0x80_00_00_00)(withUInt32(8, 1)(bytes)),
    format: MaxcsoFormat.DAX,
    uncompressedSize: PAYLOAD_SIZE,
    blockSize: DAX_FRAME_SIZE,
    output: PAYLOAD,
  },
  {
    label: 'an empty DAX NC area past the last frame',
    fixture: DAX_NC_AREAS,
    mutate: withExtraDaxArea(0xff_ff_ff_ff, 0),
    format: MaxcsoFormat.DAX,
    uncompressedSize: PAYLOAD_SIZE,
    blockSize: DAX_FRAME_SIZE,
    output: PAYLOAD,
  },
];

describe('info', () => {
  it('should have fixtures to test', () => {
    expect(DEFAULT_BLOCK_SIZE_FIXTURES).toHaveLength(21);
    expect(BLOCK_SIZE_16K_FIXTURES).toHaveLength(16);
    expect(BLOCK_SIZE_256K_FIXTURES).toHaveLength(16);
    expect(DAX_NC_AREA_FIXTURES).toHaveLength(1);
  });

  it.each(ALL_FIXTURES)('should read the header of $label', async (fixture) => {
    await expect(maxcso.info({ inputFilename: fixture.archivePath })).resolves.toEqual({
      inputFile: fixture.archivePath,
      format: fixture.format,
      uncompressedSize: PAYLOAD_SIZE,
      blockSize: fixture.blockSize,
    });
  });

  it('should reject a missing file', async () => {
    await expect(
      maxcso.info({ inputFilename: path.join(FIXTURE_DIR, 'missing.cso') }),
    ).rejects.toThrow('failed to open the file');
  });

  it.each(OPEN_CORRUPTIONS)('should reject $label', async ({ fixture, mutate, error }) => {
    await withMutatedFixture(fixture, mutate, async (filePath) => {
      await expect(maxcso.info({ inputFilename: filePath })).rejects.toThrow(error);
    });
  });

  it.each(DECODE_CORRUPTIONS)(
    'should read the header of a file with $label',
    async ({ fixture, mutate }) => {
      await withMutatedFixture(fixture, mutate, async (filePath) => {
        await expect(maxcso.info({ inputFilename: filePath })).resolves.toHaveProperty(
          'inputFile',
          filePath,
        );
      });
    },
  );

  it.each(ACCEPTANCES)(
    'should read the header of $label',
    async ({ fixture, mutate, format, uncompressedSize, blockSize }) => {
      await withMutatedFixture(fixture, mutate, async (filePath) => {
        await expect(maxcso.info({ inputFilename: filePath })).resolves.toEqual({
          inputFile: filePath,
          format,
          uncompressedSize,
          blockSize,
        });
      });
    },
  );

  it('should read a file whose path is not ASCII', async () => {
    await withTempDir(async (directory) => {
      const filePath = path.join(directory, 'ümlaut 日本.cso');
      await fs.promises.copyFile(CSO1_ZLIB, filePath);
      await expect(maxcso.info({ inputFilename: filePath })).resolves.toEqual({
        inputFile: filePath,
        format: MaxcsoFormat.CSO,
        uncompressedSize: PAYLOAD_SIZE,
        blockSize: 2048,
      });
    });
  });
});

describe('openReader', () => {
  it.each(ALL_FIXTURES)('should decompress $label byte-exact', async (fixture) => {
    const output = await BufferUtil.fromReadable(
      maxcso.openReader({ inputFilename: fixture.archivePath }),
    );
    expect(firstMismatch(output, PAYLOAD)).toEqual(-1);
  });

  it.each(ALL_FIXTURES)(
    'should decompress $label byte-exact with a 300000-byte high-water mark',
    async (fixture) => {
      const output = await BufferUtil.fromReadable(
        maxcso.openReader({ inputFilename: fixture.archivePath, highWaterMark: 300_000 }),
      );
      expect(firstMismatch(output, PAYLOAD)).toEqual(-1);
    },
  );

  it.each(ALL_FIXTURES)(
    'should emit exactly 3000-byte chunks of $label until it runs out',
    async (fixture) => {
      const readable = maxcso.openReader({
        inputFilename: fixture.archivePath,
        highWaterMark: 3000,
      });
      const chunks: Buffer[] = [];
      for await (const chunk of readable) {
        if (!Buffer.isBuffer(chunk)) {
          throw new TypeError('expected a Buffer chunk');
        }
        chunks.push(chunk);
      }
      expect(new Set(chunks.slice(0, -1).map((chunk) => chunk.length))).toEqual(new Set([3000]));
      expect(chunks.at(-1)?.length).toEqual(PAYLOAD_SIZE % 3000);
      expect(firstMismatch(Buffer.concat(chunks), PAYLOAD)).toEqual(-1);
    },
  );

  it('should emit one byte at a time out of a block larger than the high-water mark', async () => {
    const readable = maxcso.openReader({
      inputFilename: path.join(FIXTURE_DIR, '256k-block-size', 'cso1-zlib.cso'),
      highWaterMark: 1,
    });
    const chunks: Buffer[] = [];
    for await (const chunk of readable) {
      if (!Buffer.isBuffer(chunk)) {
        throw new TypeError('expected a Buffer chunk');
      }
      chunks.push(chunk);
      if (chunks.length === 20_000) {
        break;
      }
    }
    expect(new Set(chunks.map((chunk) => chunk.length))).toEqual(new Set([1]));
    expect(firstMismatch(Buffer.concat(chunks), PAYLOAD.subarray(0, 20_000))).toEqual(-1);
  });

  it('should reject a high-water mark of zero', async () => {
    await expect(
      BufferUtil.fromReadable(maxcso.openReader({ inputFilename: CSO1_ZLIB, highWaterMark: 0 })),
    ).rejects.toThrow('maxBytes must be a positive number');
  });

  it('should reject a high-water mark too large to allocate', async () => {
    await expect(
      BufferUtil.fromReadable(
        maxcso.openReader({ inputFilename: CSO1_ZLIB, highWaterMark: Number.MAX_SAFE_INTEGER }),
      ),
    ).rejects.toThrow(RangeError);
  });

  it('should reject a missing file', async () => {
    await expect(
      BufferUtil.fromReadable(
        maxcso.openReader({ inputFilename: path.join(FIXTURE_DIR, 'missing.cso') }),
      ),
    ).rejects.toThrow('failed to open the file');
  });

  it.each([...OPEN_CORRUPTIONS, ...DECODE_CORRUPTIONS])(
    'should reject $label',
    async ({ fixture, mutate, error }) => {
      await withMutatedFixture(fixture, mutate, async (filePath) => {
        await expect(
          BufferUtil.fromReadable(maxcso.openReader({ inputFilename: filePath })),
        ).rejects.toThrow(error);
      });
    },
  );

  it.each(ACCEPTANCES)('should decompress $label', async ({ fixture, mutate, output }) => {
    await withMutatedFixture(fixture, mutate, async (filePath) => {
      const actual = await BufferUtil.fromReadable(maxcso.openReader({ inputFilename: filePath }));
      expect(firstMismatch(actual, output)).toEqual(-1);
    });
  });

  it.each([CSO1_ZLIB, ZSO_LZ4])(
    'should decompress %s rebuilt with a shifted, padded index',
    async (fixturePath) => {
      await withMutatedFixture(
        fixturePath,
        (bytes) => withIndexShift(bytes, 2),
        async (filePath) => {
          const rebuilt = await fs.promises.readFile(filePath);
          expect(rebuilt.readUInt8(21)).toEqual(2);
          const output = await BufferUtil.fromReadable(
            maxcso.openReader({ inputFilename: filePath }),
          );
          expect(firstMismatch(output, PAYLOAD)).toEqual(-1);
        },
      );
    },
  );

  it('should read a file whose path is not ASCII', async () => {
    await withTempDir(async (directory) => {
      const filePath = path.join(directory, 'ümlaut 日本.cso');
      await fs.promises.copyFile(CSO1_ZLIB, filePath);
      const output = await BufferUtil.fromReadable(maxcso.openReader({ inputFilename: filePath }));
      expect(firstMismatch(output, PAYLOAD)).toEqual(-1);
    });
  });

  it('should close when destroyed in the middle of a stream', async () => {
    const readable = maxcso.openReader({ inputFilename: CSO1_ZLIB, highWaterMark: 4096 });
    expect((await readable[Symbol.asyncIterator]().next()).done).toEqual(false);
    readable.destroy();
    await events.once(readable, 'close');
    expect(readable.destroyed).toEqual(true);
  });

  it('should not let abandoned streams block new ones', async () => {
    const abandoned = Array.from({ length: 8 }, () =>
      maxcso.openReader({ inputFilename: CSO1_ZLIB, highWaterMark: 4096 }),
    );
    for (const readable of abandoned) {
      expect((await readable[Symbol.asyncIterator]().next()).done).toEqual(false);
    }
    const output = await BufferUtil.fromReadable(maxcso.openReader({ inputFilename: ZSO_LZ4 }));
    expect(firstMismatch(output, PAYLOAD)).toEqual(-1);
    for (const readable of abandoned) {
      readable.destroy();
    }
  });

  it('should serve more concurrent readers than the libuv threadpool has threads', async () => {
    const outputs = await Promise.all(
      Array.from(
        { length: 32 },
        async (_, i) =>
          await BufferUtil.fromReadable(
            maxcso.openReader({ inputFilename: ALL_FIXTURES[i % ALL_FIXTURES.length].archivePath }),
          ),
      ),
    );
    for (const output of outputs) {
      expect(firstMismatch(output, PAYLOAD)).toEqual(-1);
    }
  }, 30_000);

  it('should terminate workers with pending native reads and info calls', async () => {
    for (let i = 0; i < 20; i++) {
      const worker = new worker_threads.Worker(
        `const { parentPort, workerData } = require('node:worker_threads');
         import(workerData.indexUrl).then(({ default: maxcso }) => {
           for (let j = 0; j < 32; j++) {
             maxcso
               .openReader({ inputFilename: workerData.archivePath, highWaterMark: 2048 })
               .on('error', () => {})
               .resume();
             maxcso.info({ inputFilename: workerData.archivePath }).catch(() => {});
           }
           parentPort.postMessage('ready');
           setInterval(() => {}, 1000);
         });`,
        {
          eval: true,
          workerData: {
            indexUrl: new URL('../index.ts', import.meta.url).href,
            archivePath: path.resolve(FIXTURE_DIR, 'default-block-size', 'cso1-zlib.cso'),
          },
        },
      );
      try {
        await events.once(worker, 'message');
        // Vary when the worker terminates relative to its reads
        await new Promise((resolve) => setTimeout(resolve, i % 5));
      } finally {
        await worker.terminate();
      }
    }
  }, 30_000);
});
