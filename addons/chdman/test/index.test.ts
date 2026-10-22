import crypto from 'node:crypto';
import events from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import type stream from 'node:stream';
import worker_threads from 'node:worker_threads';

import Temp from '../../../src/globals/temp.js';
import BufferUtil from '../../../src/utils/bufferUtil.js';
import FsUtil from '../../../src/utils/fsUtil.js';
import isFileOpen from '../../../test/utils/isFileOpen.js';
import chdman, {
  type CHDInfo,
  CHDType,
  type TrackDescriptor,
  type TrackListing,
  TrackReaderMode,
} from '../index.js';

const FIXTURES = path.join('addons', 'chdman', 'test', 'fixtures');

/**
 * What streamed bytes are compared by.
 */
interface Digest {
  size: number;
  sha1: string;
}

/**
 * @returns the size and SHA-1 of {@link buffer}
 */
function computeDigest(buffer: Buffer): Digest {
  return {
    size: buffer.length,
    sha1: crypto.createHash('sha1').update(buffer).digest('hex'),
  };
}

// chdman's default codecs for CD-ROMs and GD-ROMs
const CD_CODECS = ['cdlz', 'cdzl', 'cdfl'];

// chdman's default codecs for hard disks, DVDs, and raw CHDs
const HD_CODECS = ['lzma', 'zlib', 'huff', 'flac'];

/**
 * A CHD under `fixtures/`, and what reading it must produce.
 */
interface Fixture {
  // e.g. `addons/chdman/test/fixtures/codecs/cd-cdzl.chd`
  inputPath: string;
  // chdman's extraction of the CHD, e.g. `addons/chdman/test/fixtures/expected/codecs/cd-cdzl/`
  expectedFilesPath: string;
  // What `info` must report
  expectedInfo: CHDInfo;
}

/**
 * @returns every fixture file in {@link directory}, in a stable order
 */
function listFixtureFiles(directory: string): string[] {
  return fs
    .readdirSync(path.join(FIXTURES, directory))
    .filter((file) => !file.startsWith('.') && !file.endsWith('.Dockerfile'))
    .toSorted((left, right) => left.localeCompare(right));
}

/**
 * @returns the fixtures in {@link directory}
 */
function loadFixtures(
  directory: string,
  expectedInfos: Record<string, Omit<CHDInfo, 'inputFile'>>,
): Fixture[] {
  return listFixtureFiles(directory).map((file) => {
    const expectedInfo = Object.hasOwn(expectedInfos, file) ? expectedInfos[file] : undefined;
    if (expectedInfo === undefined) {
      throw new Error(`no expected info for fixture: ${directory}/${file}`);
    }
    const inputPath = path.join(FIXTURES, directory, file);
    return {
      inputPath,
      expectedFilesPath: path.join(FIXTURES, 'expected', directory, path.parse(file).name),
      expectedInfo: { inputFile: inputPath, ...expectedInfo },
    };
  });
}

// The info shared by every CD-ROM codec fixture, which all hold the same data
const CD_CODEC_INFO = {
  type: CHDType.CD_ROM,
  fileVersion: 5,
  logicalSize: 78_336,
  hunkSize: 19_584,
  totalHunks: 4,
  unitSize: 2448,
  totalUnits: 32,
  sha1: '41e814107341fc694cdb0280c8d179297a1a66e3',
  dataSha1: 'eccaff82237cddca9c52e4041933f56de8a30bec',
};

// The info shared by every hard disk codec fixture, which all hold the same data
const HD_CODEC_INFO = {
  type: CHDType.HARD_DISK,
  fileVersion: 5,
  logicalSize: 24_576,
  hunkSize: 4096,
  totalHunks: 6,
  unitSize: 512,
  totalUnits: 48,
  sha1: '9fb10b879a484f96fc819ace033843317d65e1d9',
  dataSha1: '6cf9d91554d84f6a61b0f3813d2874184a8838bb',
};

const CODEC_INFOS: Record<string, Omit<CHDInfo, 'inputFile'>> = {
  'cd-cdfl.chd': { ...CD_CODEC_INFO, compression: ['cdfl'], chdSize: 38_128 },
  'cd-cdlz-hunk2448.chd': {
    ...CD_CODEC_INFO,
    hunkSize: 2448,
    totalHunks: 32,
    compression: ['cdlz'],
    chdSize: 37_715,
  },
  'cd-cdlz-hunk9792.chd': {
    ...CD_CODEC_INFO,
    hunkSize: 9792,
    totalHunks: 8,
    compression: ['cdlz'],
    chdSize: 32_654,
  },
  'cd-cdlz.chd': { ...CD_CODEC_INFO, compression: ['cdlz'], chdSize: 29_076 },
  'cd-cdzl.chd': { ...CD_CODEC_INFO, compression: ['cdzl'], chdSize: 50_617 },
  'cd-cdzs.chd': { ...CD_CODEC_INFO, compression: ['cdzs'], chdSize: 44_442 },
  'cd-default.chd': { ...CD_CODEC_INFO, compression: CD_CODECS, chdSize: 20_006 },
  'cd-none.chd': {
    ...CD_CODEC_INFO,
    compression: [],
    chdSize: 97_920,
    sha1: undefined,
    dataSha1: undefined,
  },
  'hd-default.chd': { ...HD_CODEC_INFO, compression: HD_CODECS, chdSize: 3778 },
  'hd-flac.chd': { ...HD_CODEC_INFO, compression: ['flac'], chdSize: 3778 },
  'hd-huff.chd': { ...HD_CODEC_INFO, compression: ['huff'], chdSize: 18_314 },
  'hd-lzma.chd': { ...HD_CODEC_INFO, compression: ['lzma'], chdSize: 12_788 },
  'hd-none.chd': {
    ...HD_CODEC_INFO,
    compression: [],
    chdSize: 28_672,
    sha1: undefined,
    dataSha1: undefined,
  },
  'hd-zlib-hunk512.chd': {
    ...HD_CODEC_INFO,
    hunkSize: 512,
    totalHunks: 48,
    compression: ['zlib'],
    chdSize: 20_620,
  },
  'hd-zlib-hunk6144.chd': {
    ...HD_CODEC_INFO,
    hunkSize: 6144,
    totalHunks: 4,
    compression: ['zlib'],
    chdSize: 17_944,
  },
  'hd-zlib.chd': { ...HD_CODEC_INFO, compression: ['zlib'], chdSize: 18_143 },
  'hd-zstd.chd': { ...HD_CODEC_INFO, compression: ['zstd'], chdSize: 17_312 },
};

// The info of a v5 CD-ROM with chdman's default hunk size and codecs
const CD_V5 = {
  type: CHDType.CD_ROM,
  fileVersion: 5,
  hunkSize: 19_584,
  unitSize: 2448,
  compression: CD_CODECS,
};

const LAYOUT_INFOS: Record<string, Omit<CHDInfo, 'inputFile'>> = {
  'cd-12-tracks.chd': {
    ...CD_V5,
    logicalSize: 117_504,
    totalHunks: 6,
    totalUnits: 48,
    chdSize: 2226,
    sha1: 'f10d911fd13327d9659c62e34c468a13898ea5cf',
    dataSha1: '341c8fc65df4fe39f2e5359d25a4864bd4878f26',
  },
  'cd-audio.chd': {
    ...CD_V5,
    logicalSize: 58_752,
    totalHunks: 3,
    totalUnits: 24,
    chdSize: 806,
    sha1: 'b0238a3108a795c38a921a291c27bda0557866be',
    dataSha1: '2f73c037ac27daa3e1a37d7f96fa7b7409cd6615',
  },
  'cd-frame-straddles-read.chd': {
    ...CD_V5,
    logicalSize: 137_088,
    totalHunks: 7,
    totalUnits: 56,
    chdSize: 1151,
    sha1: '741220bd349ec182500b7ecbdfe00204bebd902d',
    dataSha1: '8d5d8887a225d28a81078e5fd298e27c0b4225bb',
  },
  'cd-mixed-pregap.chd': {
    ...CD_V5,
    logicalSize: 39_168,
    totalHunks: 2,
    totalUnits: 16,
    chdSize: 765,
    sha1: '1744c1d197c2cbe2b3548cca29198efc852bd326',
    dataSha1: 'bf466953b2fd7cfa1dafe630e8a3ce573e1dfcc2',
  },
  'cd-mode1-2048.chd': {
    ...CD_V5,
    logicalSize: 39_168,
    totalHunks: 2,
    totalUnits: 16,
    chdSize: 509,
    sha1: '847d7ea970c80c83d692a19bd71f921b5d047032',
    dataSha1: 'c2611780f8bc473dd294977fa92ff3c2a83d0f85',
  },
  'cd-mode1-raw.chd': {
    ...CD_V5,
    logicalSize: 39_168,
    totalHunks: 2,
    totalUnits: 16,
    chdSize: 503,
    sha1: '8ee0e54511da01123d63bd14f0b07198ac63f399',
    dataSha1: 'e02b13fb7b48fbc750fda0496f89ffa887d5d9f5',
  },
  'cd-mode2-2336.chd': {
    ...CD_V5,
    logicalSize: 39_168,
    totalHunks: 2,
    totalUnits: 16,
    chdSize: 508,
    sha1: '743a172e9f80cd7a98393d7828c5ec57ec9d176a',
    dataSha1: 'e962e7b605610c644dd953b101b383fa44abc495',
  },
  'cd-mode2-raw.chd': {
    ...CD_V5,
    logicalSize: 39_168,
    totalHunks: 2,
    totalUnits: 16,
    chdSize: 503,
    sha1: '4c464ffd862a33b9ffe31c8c0e7046e443e9c400',
    dataSha1: '08ea6b959bb5aeb17198ff23dca1c573bdb36599',
  },
  'cd-postgap.chd': {
    ...CD_V5,
    logicalSize: 78_336,
    totalHunks: 4,
    totalUnits: 32,
    chdSize: 919,
    sha1: 'edd3a89855b258f961a27dd99f61132daef08f70',
    dataSha1: '27681b073288a550bb9005ca775b36dad8322bdb',
  },
  'cd-subcode.chd': {
    ...CD_V5,
    logicalSize: 29_376,
    totalHunks: 2,
    totalUnits: 12,
    chdSize: 520,
    sha1: '4bc015c818b9a3f2034f2f2c1c30b44f01055a7f',
    dataSha1: 'e7130df762729e71bd1d66461cf4dee1c2a4574f',
  },
  'dvd.chd': {
    type: CHDType.DVD_ROM,
    fileVersion: 5,
    logicalSize: 32_768,
    hunkSize: 4096,
    totalHunks: 8,
    unitSize: 2048,
    totalUnits: 16,
    compression: HD_CODECS,
    chdSize: 719,
    sha1: '5be62309b2bbfe0e637700482889ee1eedcfbe6b',
    dataSha1: '9bfffdeaa6be6c652fa4e23a55839aeacf8b667a',
  },
  'gd-rom.chd': {
    ...CD_V5,
    type: CHDType.GD_ROM,
    logicalSize: 387_430_272,
    totalHunks: 19_783,
    totalUnits: 158_264,
    chdSize: 1122,
    sha1: '48664efbe3b47a9670f8b309e24c591822e76461',
    dataSha1: '2b109e6585b81448dd0ed4d4fe8a820659b52254',
  },
  'hd.chd': {
    type: CHDType.HARD_DISK,
    fileVersion: 5,
    logicalSize: 8192,
    hunkSize: 4096,
    totalHunks: 2,
    unitSize: 512,
    totalUnits: 16,
    compression: HD_CODECS,
    chdSize: 339,
    sha1: 'd736001ae91bfd27280bd6d4200d54b262c5e874',
    dataSha1: 'ef29d3ea30c0e0a1049ecdb48a61f6f53a3d8076',
  },
  'raw-unit2448.chd': {
    type: CHDType.RAW,
    fileVersion: 5,
    logicalSize: 19_584,
    hunkSize: 4896,
    totalHunks: 4,
    unitSize: 2448,
    totalUnits: 8,
    compression: HD_CODECS,
    chdSize: 428,
    sha1: 'a7b57624bc47c4545506cdde65bfd07bea0975bd',
    dataSha1: 'd7ce0880f2f443879476e840283988b1138debc7',
  },
};

// v3 and v4 CHDs only support zlib, and only store CD metadata, so GD-ROMs report CD_ROM too
const CD_LEGACY = {
  type: CHDType.CD_ROM,
  hunkSize: 9792,
  unitSize: 2448,
  compression: ['zlib'],
};

const LEGACY_INFOS: Record<string, Omit<CHDInfo, 'inputFile'>> = {
  'cd-v3.chd': {
    ...CD_LEGACY,
    fileVersion: 3,
    logicalSize: 156_672,
    totalHunks: 16,
    totalUnits: 64,
    chdSize: 2031,
    sha1: '85b0a53cf8edbd8de16938a7f723c29d9aba2c15',
    dataSha1: undefined,
  },
  'cd-v4.chd': {
    ...CD_LEGACY,
    fileVersion: 4,
    logicalSize: 156_672,
    totalHunks: 16,
    totalUnits: 64,
    chdSize: 2283,
    sha1: 'cf0adbc84d34318aeb3cd212d0bd449a7cafadba',
    dataSha1: '5392fcf6e033813f152625c3f1ac8c8c9e1b5de4',
  },
  'gd-v3.chd': {
    ...CD_LEGACY,
    fileVersion: 3,
    logicalSize: 235_008,
    totalHunks: 24,
    totalUnits: 96,
    chdSize: 2996,
    sha1: '46915d49d2e20e354a3b5550ee638f7bdef50dba',
    dataSha1: undefined,
  },
  'gd-v4.chd': {
    ...CD_LEGACY,
    fileVersion: 4,
    logicalSize: 235_008,
    totalHunks: 24,
    totalUnits: 96,
    chdSize: 3107,
    sha1: '34fe70114be83821b1477554c9f6a478dcc985b1',
    dataSha1: '46915d49d2e20e354a3b5550ee638f7bdef50dba',
  },
};

const TRUNCATED = path.join(FIXTURES, 'invalid', 'truncated.chd');

// The addon always opens CHDs without a parent, so this CHD's header reads but its hunks don't
const NEEDS_PARENT = path.join(FIXTURES, 'invalid', 'diff-needs-parent.chd');

const ALL_FIXTURES = [
  ...loadFixtures('codecs', CODEC_INFOS),
  ...loadFixtures('layouts', LAYOUT_INFOS),
  ...loadFixtures('legacy', LEGACY_INFOS),
];

// CD-ROMs and GD-ROMs
const DISC_FIXTURES = ALL_FIXTURES.filter(
  (fixture) =>
    fixture.expectedInfo.type === CHDType.CD_ROM || fixture.expectedInfo.type === CHDType.GD_ROM,
);

// Hard disks, DVDs, and raw CHDs
const RAW_FIXTURES = ALL_FIXTURES.filter(
  (fixture) =>
    fixture.expectedInfo.type !== CHDType.CD_ROM && fixture.expectedInfo.type !== CHDType.GD_ROM,
);

// Discs listed and read as cue/bin, i.e. every disc not named `gd-*`
const CUEBIN_FIXTURES = DISC_FIXTURES.filter(
  (fixture) => !path.basename(fixture.inputPath).startsWith('gd-'),
);

// Discs listed and read as `.gdi`, i.e. every disc named `gd-*`
const GDI_FIXTURES = DISC_FIXTURES.filter((fixture) =>
  path.basename(fixture.inputPath).startsWith('gd-'),
);

/**
 * @returns the fixture whose path under `fixtures/` is {@link fixturePath}
 */
function findFixture(fixturePath: string): Fixture {
  const inputPath = path.join(FIXTURES, fixturePath);
  const found = ALL_FIXTURES.find((fixture) => fixture.inputPath === inputPath);
  if (found === undefined) {
    throw new Error(`no fixture: ${inputPath}`);
  }
  return found;
}

const MIXED_PREGAP = findFixture('layouts/cd-mixed-pregap.chd');
const FRAME_STRADDLES_READ = findFixture('layouts/cd-frame-straddles-read.chd');
const GD_ROM = findFixture('layouts/gd-rom.chd');
const HARD_DISK = findFixture('layouts/hd.chd');

const MISSING = path.join(FIXTURES, 'missing.chd');

// Read sizes that land frame and hunk boundaries at awkward offsets: a byte at a time, one byte
// short of a CD frame, a CD frame, a CD frame with subcode, and more than any fixture holds.
// Node's default is covered by every fixture's own read test.
const HIGH_WATER_MARKS: number[] = [1, 2351, 2352, 2448, 1024 * 1024];

/**
 * @returns a test case for every pair of {@link fixtures} and `HIGH_WATER_MARKS`
 */
function expandHighWaterMarks(fixtures: Fixture[]): { fixture: Fixture; highWaterMark: number }[] {
  return fixtures.flatMap((fixture) =>
    HIGH_WATER_MARKS.map((highWaterMark) => ({ fixture, highWaterMark })),
  );
}

/**
 * A track file, named the way a listing names it.
 */
interface ExpectedTrack extends Digest {
  name: string;
}

/**
 * chdman's extraction of a disc.
 */
interface ExpectedDisc {
  tocName: string;
  tocText: string;
  tracks: ExpectedTrack[];
}

/**
 * The directory's only `.cue` or `.gdi` is the TOC, and every other file is a track.
 * @returns chdman's extraction of the disc {@link fixture}, with tracks in track number order
 */
async function readExpectedDisc(fixture: Fixture): Promise<ExpectedDisc> {
  const files = fs
    .readdirSync(fixture.expectedFilesPath)
    .filter((file) => !file.startsWith('.'))
    .toSorted((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  const tocName = files.find((file) => file.endsWith('.cue') || file.endsWith('.gdi'));
  if (tocName === undefined) {
    throw new Error(`no .cue or .gdi in ${fixture.expectedFilesPath}`);
  }
  const tocText = (await FsUtil.readFile(path.join(fixture.expectedFilesPath, tocName))).toString();
  const tracks = await Promise.all(
    files
      .filter((file) => file !== tocName)
      .map(async (file) => ({
        name: file,
        ...computeDigest(await FsUtil.readFile(path.join(fixture.expectedFilesPath, file))),
      })),
  );
  return { tocName, tocText, tracks };
}

/**
 * @returns chdman's extraction of the hard disk, DVD, or raw CHD {@link fixture}
 */
async function readExpectedImage(fixture: Fixture): Promise<Digest> {
  const { name } = path.parse(fixture.inputPath);
  return computeDigest(await FsUtil.readFile(path.join(fixture.expectedFilesPath, `${name}.bin`)));
}

/**
 * @returns the addon's listing of the disc {@link fixture}, with its TOC named {@link tocName}
 */
async function listTracks(fixture: Fixture, tocName: string): Promise<TrackListing> {
  if (path.basename(fixture.inputPath).startsWith('gd-')) {
    return await chdman.listGdRomTracks({
      inputFilename: fixture.inputPath,
      trackBaseName: 'track',
      gdiName: tocName,
    });
  }
  return await chdman.listCdBinCueTracks({
    inputFilename: fixture.inputPath,
    binNamePattern: `${path.parse(fixture.inputPath).name} (Track %t).bin`,
    cueName: tocName,
  });
}

/**
 * List the disc {@link fixture}, then check the TOC text and track sizes against chdman's
 */
async function expectListing(fixture: Fixture): Promise<void> {
  const expected = await readExpectedDisc(fixture);
  const result = await listTracks(fixture, expected.tocName);
  expect(result.tocText).toEqual(expected.tocText);
  expect(result.tracks.map((track) => ({ name: track.filename, size: track.size }))).toEqual(
    expected.tracks.map((track) => ({ name: track.name, size: track.size })),
  );
}

/**
 * @returns the name, size, and SHA-1 of {@link track} of the disc {@link fixture}
 */
async function readTrack(
  fixture: Fixture,
  track: TrackDescriptor,
  highWaterMark?: number,
): Promise<ExpectedTrack> {
  const bytes = await BufferUtil.fromReadable(
    chdman.openTrackReader({
      inputFilename: fixture.inputPath,
      mode: path.basename(fixture.inputPath).startsWith('gd-')
        ? TrackReaderMode.GDI
        : TrackReaderMode.CUEBIN,
      trackIndex: track.index,
      highWaterMark,
    }),
  );
  return { name: track.filename, ...computeDigest(bytes) };
}

/**
 * Stream every listed track of the disc {@link fixture}, one after another, then check them against chdman's
 */
async function expectTracks(fixture: Fixture, highWaterMark?: number): Promise<void> {
  const expected = await readExpectedDisc(fixture);
  const listing = await listTracks(fixture, expected.tocName);
  const tracks: ExpectedTrack[] = [];
  for (const track of listing.tracks) {
    tracks.push(await readTrack(fixture, track, highWaterMark));
  }
  expect(tracks).toEqual(expected.tracks);
}

/**
 * @returns the length of the final chunk {@link readable} emits, and the size of the memory behind it
 */
async function readFinalChunk(
  readable: stream.Readable,
): Promise<{ length?: number; allocated?: number }> {
  let finalChunk: Buffer | undefined;
  for await (const chunk of readable) {
    if (!Buffer.isBuffer(chunk)) {
      throw new TypeError('expected a Buffer chunk');
    }
    finalChunk = chunk;
  }
  return { length: finalChunk?.length, allocated: finalChunk?.buffer.byteLength };
}

/**
 * @returns the size and SHA-1 of the logical image of {@link inputPath}, streamed by the addon
 */
async function readRaw(inputPath: string, highWaterMark?: number): Promise<Digest> {
  return computeDigest(
    await BufferUtil.fromReadable(
      chdman.openRawReader({ inputFilename: inputPath, highWaterMark }),
    ),
  );
}

/**
 * Run `callback` against a temporary directory that is removed afterwards,
 * however it finishes.
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
 * Copy {@link source} into {@link directory}, keeping its name, so that a test checks the handles
 * of a file that no other test, and no other process, has open.
 * @returns the path of the copy
 */
async function copyInto(directory: string, source: string): Promise<string> {
  const copy = path.join(directory, path.basename(source));
  await FsUtil.copyFile(source, copy);
  return copy;
}

/**
 * Destroy {@link readable}, with {@link error} if one is given, and record the events it emits from
 * then on, until it closes.
 * @returns the names of the events, in the order they were emitted
 */
async function eventsAfterDestroy(readable: stream.Readable, error?: Error): Promise<string[]> {
  const emitted: string[] = [];
  const closed = new Promise<void>((resolve) => {
    for (const name of ['data', 'end', 'error', 'close']) {
      readable.on(name, () => {
        emitted.push(name);
        if (name === 'close') {
          resolve();
        }
      });
    }
  });
  readable.destroy(error);
  await closed;
  return emitted;
}

/**
 * Copy the disc {@link fixture} into {@link directory}.
 * @returns the fixture, read from the copy
 */
async function copyFixtureInto(directory: string, fixture: Fixture): Promise<Fixture> {
  return { ...fixture, inputPath: await copyInto(directory, fixture.inputPath) };
}

// Files that every reader rejects, each written into a directory of its own
const REJECTED: { label: string; write: (directory: string) => Promise<string> }[] = [
  {
    label: 'a file that is not a CHD',
    write: async (directory): Promise<string> => {
      const inputFilename = path.join(directory, 'garbage.chd');
      await FsUtil.writeFile(inputFilename, crypto.randomBytes(4096));
      return inputFilename;
    },
  },
  {
    label: 'a truncated CHD',
    write: async (directory): Promise<string> => await copyInto(directory, TRUNCATED),
  },
];

// A v3 CD-ROM CHD of a 30-frame MODE1 track and a 30-frame AUDIO track, whose metadata is rewritten
const CRAFTED_CD_BASE = findFixture('legacy/cd-v3.chd');

/**
 * One entry of a CHD's metadata chain.
 */
interface CraftedMetadata {
  tag: string;
  data: Buffer;
}

/**
 * One track of old-style (`CHCD`) CD-ROM metadata.
 */
interface OldCdTrack {
  trackType: number;
  dataSize: number;
  frames: number;
}

// The tracks of CRAFTED_CD_BASE: CD_TRACK_MODE1 and CD_TRACK_AUDIO
const CRAFTED_CD_TRACKS: OldCdTrack[] = [
  { trackType: 0, dataSize: 2048, frames: 30 },
  { trackType: 7, dataSize: 2352, frames: 30 },
];

/**
 * Old-style CD-ROM metadata is a track count, then 99 tracks of six little-endian words each: the
 * track type, subcode type, data size, subcode size, frames, and padding frames.
 * @returns old-style metadata declaring {@link trackCount} tracks, of which {@link tracks} are filled in
 */
function encodeOldCdMetadata(trackCount: number, tracks: OldCdTrack[]): Buffer {
  const data = Buffer.alloc((1 + 99 * 6) * 4);
  data.writeUInt32LE(trackCount, 0);
  for (const [index, track] of tracks.entries()) {
    const offset = 4 + index * 24;
    data.writeUInt32LE(track.trackType, offset);
    // CD_SUB_NONE
    data.writeUInt32LE(2, offset + 4);
    data.writeUInt32LE(track.dataSize, offset + 8);
    data.writeUInt32LE(0, offset + 12);
    data.writeUInt32LE(track.frames, offset + 16);
    data.writeUInt32LE((4 - (track.frames % 4)) % 4, offset + 20);
  }
  return data;
}

/**
 * Write a copy of {@link CRAFTED_CD_BASE} whose metadata chain is replaced by {@link entries},
 * appended after its hunks.
 * @returns the path of the written CHD
 */
async function writeCraftedCdChd(directory: string, entries: CraftedMetadata[]): Promise<string> {
  const chd = await fs.promises.readFile(CRAFTED_CD_BASE.inputPath);
  // The v3 header's big-endian offset of the first metadata entry
  chd.writeBigUInt64BE(BigInt(chd.length), 36);
  const parts: Buffer[] = [chd];
  let offset = chd.length;
  for (const [index, entry] of entries.entries()) {
    // A metadata entry header: its tag, flags and length, and the offset of the next entry
    const header = Buffer.alloc(16);
    header.write(entry.tag, 0, 'latin1');
    header.writeUInt32BE(entry.data.length, 4);
    const next = offset + header.length + entry.data.length;
    header.writeBigUInt64BE(index + 1 < entries.length ? BigInt(next) : 0n, 8);
    parts.push(header, entry.data);
    offset = next;
  }
  const filePath = path.join(directory, 'crafted.chd');
  await fs.promises.writeFile(filePath, Buffer.concat(parts));
  return filePath;
}

// CD-ROM metadata that MAME parses without validating, each of which must be refused rather than
// crash the process (too many tracks), read past its metadata (truncated), spin through 2^32 frames
// without emitting anything (zero data size), or overflow a frame buffer (oversized data size)
const MALFORMED_CD_METADATA: { description: string; entries: CraftedMetadata[]; error: string }[] =
  [
    {
      description: 'old-style metadata with more tracks than a CD holds',
      entries: [{ tag: 'CHCD', data: encodeOldCdMetadata(1000, CRAFTED_CD_TRACKS) }],
      error: 'CHD CD-ROM metadata has too many tracks',
    },
    {
      description: 'truncated old-style metadata',
      entries: [{ tag: 'CHCD', data: encodeOldCdMetadata(2, CRAFTED_CD_TRACKS).subarray(0, 4) }],
      error: 'CHD CD-ROM metadata is truncated',
    },
    {
      description: 'old-style metadata with a zero data size and 2^32-1 frames',
      entries: [
        {
          tag: 'CHCD',
          data: encodeOldCdMetadata(2, [
            { trackType: 0, dataSize: 0, frames: 0xff_ff_ff_ff },
            CRAFTED_CD_TRACKS[1],
          ]),
        },
      ],
      error: 'CHD track 1 has an invalid data size of 0 bytes',
    },
    {
      description: 'old-style metadata with a data size larger than a CD frame',
      entries: [
        {
          tag: 'CHCD',
          data: encodeOldCdMetadata(2, [
            { trackType: 0, dataSize: 4096, frames: 30 },
            CRAFTED_CD_TRACKS[1],
          ]),
        },
      ],
      error: 'CHD track 1 has an invalid data size of 4096 bytes',
    },
    {
      description: 'new-style metadata that skips track 1',
      entries: [
        {
          tag: 'CHTR',
          data: Buffer.from('TRACK:2 TYPE:MODE1 SUBTYPE:NONE FRAMES:30\0', 'latin1'),
        },
      ],
      error: 'CHD track 1 has an invalid data size of 0 bytes',
    },
  ];

describe('info', () => {
  it('should have fixtures to test', () => {
    expect(listFixtureFiles('codecs')).toEqual(
      Object.keys(CODEC_INFOS).toSorted((left, right) => left.localeCompare(right)),
    );
    expect(listFixtureFiles('layouts')).toEqual(
      Object.keys(LAYOUT_INFOS).toSorted((left, right) => left.localeCompare(right)),
    );
    expect(listFixtureFiles('legacy')).toEqual(
      Object.keys(LEGACY_INFOS).toSorted((left, right) => left.localeCompare(right)),
    );
    expect(listFixtureFiles('invalid')).toEqual(['diff-needs-parent.chd', 'truncated.chd']);
  });

  it.each(ALL_FIXTURES)(
    'should read the info of $inputPath, then release it',
    async ({ inputPath, expectedInfo }) => {
      await withTempDir(async (directory) => {
        const inputFilename = await copyInto(directory, inputPath);
        await expect(chdman.info({ inputFilename })).resolves.toEqual({
          ...expectedInfo,
          inputFile: inputFilename,
        });
        expect(await isFileOpen(inputFilename)).toEqual(false);
      });
    },
  );

  it.each(RAW_FIXTURES)(
    'should read the logical size and data SHA-1 of $inputPath',
    async (fixture) => {
      const info = await chdman.info({ inputFilename: fixture.inputPath });
      const image = await readExpectedImage(fixture);
      expect({ logicalSize: info.logicalSize, dataSha1: info.dataSha1 }).toEqual({
        logicalSize: image.size,
        // chdman stores no SHA-1s in an uncompressed CHD
        dataSha1: fixture.expectedInfo.compression.length > 0 ? image.sha1 : undefined,
      });
    },
  );

  it('should reject on a missing file', async () => {
    await expect(chdman.info({ inputFilename: MISSING })).rejects.toThrow('failed to open CHD');
  });

  it.each(REJECTED)('should reject on $label, then release it', async ({ write }) => {
    await withTempDir(async (directory) => {
      const inputFilename = await write(directory);
      await expect(chdman.info({ inputFilename })).rejects.toThrow('failed to open CHD');
      expect(await isFileOpen(inputFilename)).toEqual(false);
    });
  });

  it('should read the info of a CHD whose parent is missing, then release it', async () => {
    await withTempDir(async (directory) => {
      const inputFilename = await copyInto(directory, NEEDS_PARENT);
      await expect(chdman.info({ inputFilename })).resolves.toEqual({
        inputFile: inputFilename,
        type: CHDType.HARD_DISK,
        fileVersion: 5,
        logicalSize: 8192,
        hunkSize: 4096,
        totalHunks: 2,
        unitSize: 512,
        totalUnits: 16,
        compression: HD_CODECS,
        chdSize: 273,
        sha1: '023a2b1a4959613883fd409018fb626b6dcd4fd1',
        dataSha1: 'f4f3d9db6bf1fec701d73ba37a6430ca09e1c131',
      });
      expect(await isFileOpen(inputFilename)).toEqual(false);
    });
  });

  it('should read many CHDs concurrently, then release them', async () => {
    await withTempDir(async (directory) => {
      const inputFilename = await copyInto(directory, HARD_DISK.inputPath);
      const infos = await Promise.all(
        Array.from({ length: 16 }, async () => await chdman.info({ inputFilename })),
      );
      expect(infos).toEqual(
        Array.from({ length: 16 }, () => ({ ...HARD_DISK.expectedInfo, inputFile: inputFilename })),
      );
      expect(await isFileOpen(inputFilename)).toEqual(false);
    });
  });
});

describe('listCdBinCueTracks', () => {
  it.each(CUEBIN_FIXTURES)(
    "should list $inputPath with chdman's cue text and track sizes, then release it",
    async (original) => {
      await withTempDir(async (directory) => {
        const fixture = await copyFixtureInto(directory, original);
        await expectListing(fixture);
        expect(await isFileOpen(fixture.inputPath)).toEqual(false);
      });
    },
  );

  it('should refuse to list a GD-ROM as cue/bin instead of producing a runaway track', async () => {
    // Some GD-ROM CHDs cannot be expressed as cue/bin: a high-density track has
    // padframes exceeding frames+splitframes, so chdman's frame formula underflows
    // and extraction would decompress ~10 TB. This must be refused up front, not
    // streamed forever.
    await expect(
      chdman.listCdBinCueTracks({
        inputFilename: GD_ROM.inputPath,
        binNamePattern: 'gd-rom (Track %t).bin',
        cueName: 'gd-rom.cue',
      }),
    ).rejects.toThrow(/cannot be extracted as cue\/bin/);
  });

  it('should list old-style CD-ROM metadata the same as the new-style metadata it encodes', async () => {
    const expected = await chdman.listCdBinCueTracks({
      inputFilename: CRAFTED_CD_BASE.inputPath,
      binNamePattern: 'crafted (Track %t).bin',
      cueName: 'crafted.cue',
    });
    await withTempDir(async (directory) => {
      const inputFilename = await writeCraftedCdChd(directory, [
        { tag: 'CHCD', data: encodeOldCdMetadata(2, CRAFTED_CD_TRACKS) },
      ]);
      await expect(
        chdman.listCdBinCueTracks({
          inputFilename,
          binNamePattern: 'crafted (Track %t).bin',
          cueName: 'crafted.cue',
        }),
      ).resolves.toEqual(expected);
    });
  });

  it.each(MALFORMED_CD_METADATA)(
    'should reject a CHD with $description, then release it',
    async ({ entries, error }) => {
      await withTempDir(async (directory) => {
        const inputFilename = await writeCraftedCdChd(directory, entries);
        await expect(
          chdman.listCdBinCueTracks({
            inputFilename,
            binNamePattern: 'crafted (Track %t).bin',
            cueName: 'crafted.cue',
          }),
        ).rejects.toThrow(error);
        expect(await isFileOpen(inputFilename)).toEqual(false);
      });
    },
  );

  it('should reject on a missing file', async () => {
    await expect(
      chdman.listCdBinCueTracks({
        inputFilename: MISSING,
        binNamePattern: 'missing (Track %t).bin',
        cueName: 'missing.cue',
      }),
    ).rejects.toThrow('failed to open CHD');
  });

  it.each(REJECTED)('should reject on $label, then release it', async ({ write }) => {
    await withTempDir(async (directory) => {
      const inputFilename = await write(directory);
      await expect(
        chdman.listCdBinCueTracks({
          inputFilename,
          binNamePattern: 'track %t.bin',
          cueName: 'disc.cue',
        }),
      ).rejects.toThrow('failed to open CHD');
      expect(await isFileOpen(inputFilename)).toEqual(false);
    });
  });
});

describe('listGdRomTracks', () => {
  it.each(GDI_FIXTURES)(
    "should list $inputPath with chdman's gdi text and track sizes, then release it",
    async (original) => {
      await withTempDir(async (directory) => {
        const fixture = await copyFixtureInto(directory, original);
        await expectListing(fixture);
        expect(await isFileOpen(fixture.inputPath)).toEqual(false);
      });
    },
  );

  it.each(MALFORMED_CD_METADATA)(
    'should reject a CHD with $description',
    async ({ entries, error }) => {
      await withTempDir(async (directory) => {
        await expect(
          chdman.listGdRomTracks({
            inputFilename: await writeCraftedCdChd(directory, entries),
            trackBaseName: 'track',
            gdiName: 'crafted.gdi',
          }),
        ).rejects.toThrow(error);
      });
    },
  );

  it('should reject on a missing file', async () => {
    await expect(
      chdman.listGdRomTracks({
        inputFilename: MISSING,
        trackBaseName: 'track',
        gdiName: 'missing.gdi',
      }),
    ).rejects.toThrow('failed to open CHD');
  });
});

describe('openTrackReader', () => {
  it.each(DISC_FIXTURES)(
    'should stream every track of $inputPath byte-identically to chdman, then release it',
    async (original) => {
      await withTempDir(async (directory) => {
        const fixture = await copyFixtureInto(directory, original);
        await expectTracks(fixture);
        expect(await isFileOpen(fixture.inputPath)).toEqual(false);
      });
    },
  );

  it.each(expandHighWaterMarks([MIXED_PREGAP, GD_ROM]))(
    'should stream $fixture.inputPath with a highWaterMark of $highWaterMark byte-identically',
    async ({ fixture, highWaterMark }) => {
      await expectTracks(fixture, highWaterMark);
    },
  );

  it.each([MIXED_PREGAP, GD_ROM])(
    'should allocate only the bytes left for the final chunk of every track of $inputPath',
    async (fixture) => {
      // One byte short of a CD frame, so the final chunk of every track falls mid-frame
      const highWaterMark = 2351;
      const expected = await readExpectedDisc(fixture);
      const listing = await listTracks(fixture, expected.tocName);
      const finalChunks = [];
      for (const track of listing.tracks) {
        finalChunks.push(
          await readFinalChunk(
            chdman.openTrackReader({
              inputFilename: fixture.inputPath,
              mode: path.basename(fixture.inputPath).startsWith('gd-')
                ? TrackReaderMode.GDI
                : TrackReaderMode.CUEBIN,
              trackIndex: track.index,
              highWaterMark,
            }),
          ),
        );
      }
      const finalChunkSizes = listing.tracks.map(
        (track) => track.size % highWaterMark || highWaterMark,
      );
      expect(finalChunks).toEqual(
        finalChunkSizes.map((size) => ({ length: size, allocated: size })),
      );
    },
  );

  it('should stream multiple independent readers in parallel byte-identically', async () => {
    const expected = await readExpectedDisc(MIXED_PREGAP);
    const listing = await listTracks(MIXED_PREGAP, expected.tocName);
    // Open every track reader at once and consume them concurrently; each owns
    // its own chd_file, so results must be independent of interleaving
    await expect(
      Promise.all(listing.tracks.map(async (track) => await readTrack(MIXED_PREGAP, track))),
    ).resolves.toEqual(expected.tracks);
  });

  it('should not drop the tail of the final frame when a read boundary falls mid-frame', async () => {
    // The 56-frame (131712-byte) track's final frame straddles the stream's 64KiB read
    // boundary (131712 % 65536 = 640 < 2352), so the full track must stream out even when
    // a read boundary falls inside its last frame
    await expectTracks(FRAME_STRADDLES_READ, 64 * 1024);
  });

  it('should refuse to open a runaway GD-ROM cue/bin track reader', async () => {
    // The same high-density-track frame underflow that blocks listCdBinCueTracks
    // (see that suite) must also be refused when opening a track reader directly,
    // rather than streaming a ~10 TB runaway. The track is opened by the first read,
    // so the refusal surfaces through the stream.
    const readable = chdman.openTrackReader({
      inputFilename: GD_ROM.inputPath,
      mode: TrackReaderMode.CUEBIN,
      trackIndex: 2,
    });
    await expect(BufferUtil.fromReadable(readable)).rejects.toThrow(
      /cannot be extracted as cue\/bin/,
    );
  });

  it.each([99, -1])(
    'should reject with a RangeError for track index %i, which the CHD does not have, then release it',
    async (trackIndex) => {
      await withTempDir(async (directory) => {
        const fixture = await copyFixtureInto(directory, MIXED_PREGAP);
        const read = BufferUtil.fromReadable(
          chdman.openTrackReader({
            inputFilename: fixture.inputPath,
            mode: TrackReaderMode.CUEBIN,
            trackIndex,
          }),
        );
        await expect(read).rejects.toThrow(RangeError);
        await expect(read).rejects.toThrow('track index out of range');
        expect(await isFileOpen(fixture.inputPath)).toEqual(false);
      });
    },
  );

  it('should stream old-style CD-ROM metadata the same as the new-style metadata it encodes', async () => {
    const readTracks = async (inputFilename: string): Promise<Digest[]> =>
      await Promise.all(
        [0, 1].map(async (trackIndex) =>
          computeDigest(
            await BufferUtil.fromReadable(
              chdman.openTrackReader({ inputFilename, mode: TrackReaderMode.CUEBIN, trackIndex }),
            ),
          ),
        ),
      );
    const expected = await readTracks(CRAFTED_CD_BASE.inputPath);
    await withTempDir(async (directory) => {
      const inputFilename = await writeCraftedCdChd(directory, [
        { tag: 'CHCD', data: encodeOldCdMetadata(2, CRAFTED_CD_TRACKS) },
      ]);
      await expect(readTracks(inputFilename)).resolves.toEqual(expected);
    });
  });

  it.each(MALFORMED_CD_METADATA)(
    'should reject reading a CHD with $description, then release it',
    async ({ entries, error }) => {
      await withTempDir(async (directory) => {
        const inputFilename = await writeCraftedCdChd(directory, entries);
        const readable = chdman.openTrackReader({
          inputFilename,
          mode: TrackReaderMode.CUEBIN,
          trackIndex: 0,
        });
        await expect(BufferUtil.fromReadable(readable)).rejects.toThrow(error);
        expect(await isFileOpen(inputFilename)).toEqual(false);
      });
    },
  );

  it('should reject on a missing file', async () => {
    const readable = chdman.openTrackReader({
      inputFilename: MISSING,
      mode: TrackReaderMode.CUEBIN,
      trackIndex: 0,
    });
    await expect(BufferUtil.fromReadable(readable)).rejects.toThrow('failed to open CHD');
  });

  it('should hold the CHD open mid-stream, and release it before emitting close when destroyed', async () => {
    await withTempDir(async (directory) => {
      const fixture = await copyFixtureInto(directory, FRAME_STRADDLES_READ);
      const readable = chdman.openTrackReader({
        inputFilename: fixture.inputPath,
        mode: TrackReaderMode.CUEBIN,
        trackIndex: 0,
        highWaterMark: 2352,
      });
      expect((await readable[Symbol.asyncIterator]().next()).done).toEqual(false);
      expect(await isFileOpen(fixture.inputPath)).toEqual(true);

      const closed = events.once(readable, 'close');
      readable.destroy();
      await closed;
      expect(readable.destroyed).toEqual(true);
      expect(await isFileOpen(fixture.inputPath)).toEqual(false);
    });
  });

  it('should release the CHD when destroyed before reading, emitting the same events as fs.ReadStream', async () => {
    await withTempDir(async (directory) => {
      const { inputPath: inputFilename } = await copyFixtureInto(directory, MIXED_PREGAP);
      const expected = await eventsAfterDestroy(fs.createReadStream(inputFilename));
      expect(expected).toEqual(['close']);

      const readable = chdman.openTrackReader({
        inputFilename,
        mode: TrackReaderMode.CUEBIN,
        trackIndex: 0,
      });
      expect(await eventsAfterDestroy(readable)).toEqual(expected);
      expect(await isFileOpen(inputFilename)).toEqual(false);
    });
  });

  it('should release the CHD when destroyed with a read in flight, reporting the same error as fs.ReadStream', async () => {
    await withTempDir(async (directory) => {
      const { inputPath: inputFilename } = await copyFixtureInto(directory, FRAME_STRADDLES_READ);
      const error = new Error('destroyed');
      // Flowing, so each stream has its next read in flight whenever a chunk arrives
      const fileStream = fs.createReadStream(inputFilename, { highWaterMark: 1 });
      await events.once(fileStream.resume(), 'data');
      const expected = await eventsAfterDestroy(fileStream, error);
      // The chunk that the read in flight returns is dropped
      expect(expected).toEqual(['error', 'close']);

      const readable = chdman.openTrackReader({
        inputFilename,
        mode: TrackReaderMode.CUEBIN,
        trackIndex: 0,
        highWaterMark: 1,
      });
      await events.once(readable.resume(), 'data');
      expect(await eventsAfterDestroy(readable, error)).toEqual(expected);
      expect(readable.errored).toEqual(error);
      expect(await isFileOpen(inputFilename)).toEqual(false);
    });
  });

  it.each(REJECTED)('should reject on $label, then release it', async ({ write }) => {
    await withTempDir(async (directory) => {
      const inputFilename = await write(directory);
      await expect(
        BufferUtil.fromReadable(
          chdman.openTrackReader({ inputFilename, mode: TrackReaderMode.CUEBIN, trackIndex: 0 }),
        ),
      ).rejects.toThrow('failed to open CHD');
      expect(await isFileOpen(inputFilename)).toEqual(false);
    });
  });
});

describe('openRawReader', () => {
  it.each(RAW_FIXTURES)(
    'should stream the logical image of $inputPath byte-identically to chdman, then release it',
    async (fixture) => {
      await withTempDir(async (directory) => {
        const inputFilename = await copyInto(directory, fixture.inputPath);
        await expect(readRaw(inputFilename)).resolves.toEqual(await readExpectedImage(fixture));
        expect(await isFileOpen(inputFilename)).toEqual(false);
      });
    },
  );

  it.each(
    expandHighWaterMarks([
      findFixture('codecs/hd-zlib-hunk6144.chd'),
      findFixture('layouts/raw-unit2448.chd'),
    ]),
  )(
    'should stream $fixture.inputPath with a highWaterMark of $highWaterMark byte-identically',
    async ({ fixture, highWaterMark }) => {
      await expect(readRaw(fixture.inputPath, highWaterMark)).resolves.toEqual(
        await readExpectedImage(fixture),
      );
    },
  );

  it('should allocate only the bytes left for the final chunk', async () => {
    const highWaterMark = 3000;
    const { size } = await readExpectedImage(HARD_DISK);
    const finalChunkSize = size % highWaterMark || highWaterMark;
    await expect(
      readFinalChunk(chdman.openRawReader({ inputFilename: HARD_DISK.inputPath, highWaterMark })),
    ).resolves.toEqual({ length: finalChunkSize, allocated: finalChunkSize });
  });

  it('should stream multiple raw readers over the same CHD in parallel', async () => {
    const image = await readExpectedImage(HARD_DISK);
    // Three independent readers over the same file, consumed concurrently. Each
    // owns its own chd_file, so all three must yield the identical logical image.
    await expect(
      Promise.all([0, 1, 2].map(async () => await readRaw(HARD_DISK.inputPath))),
    ).resolves.toEqual([image, image, image]);
  });

  it.each([
    {
      label: 'appended to',
      change: async (inputFilename: string): Promise<void> => {
        // A CHD's size is in its header, so bytes past it are never read
        await fs.promises.appendFile(inputFilename, crypto.randomBytes(2500));
      },
    },
    {
      label: 'renamed',
      change: async (inputFilename: string): Promise<void> => {
        await fs.promises.rename(inputFilename, `${inputFilename}.renamed`);
      },
    },
    {
      label: 'deleted',
      change: async (inputFilename: string): Promise<void> => {
        await fs.promises.rm(inputFilename);
      },
    },
    {
      label: 'rewritten in place',
      change: async (inputFilename: string): Promise<void> => {
        // Opening for writing only succeeds while every other handle to the file shares writes
        const contents = await FsUtil.readFile(inputFilename);
        const handle = await fs.promises.open(inputFilename, 'r+');
        try {
          await handle.write(contents, 0, contents.length, 0);
        } finally {
          await handle.close();
        }
      },
    },
  ])('should keep reading a CHD that is $label while open', async ({ change }) => {
    await withTempDir(async (directory) => {
      const inputFilename = await copyInto(directory, HARD_DISK.inputPath);

      const readable = chdman.openRawReader({ inputFilename, highWaterMark: 3000 });
      const chunks: Buffer[] = [];
      for await (const chunk of readable) {
        if (!Buffer.isBuffer(chunk)) {
          throw new TypeError('expected a Buffer chunk');
        }
        chunks.push(chunk);
        if (chunks.length === 1) {
          // The CHD is open once the first chunk has arrived
          await change(inputFilename);
        }
      }

      expect(computeDigest(Buffer.concat(chunks))).toEqual(await readExpectedImage(HARD_DISK));
    });
  });

  it('should reject on a missing file', async () => {
    await expect(readRaw(MISSING)).rejects.toThrow('failed to open CHD');
  });

  it.each(REJECTED)('should reject on $label, then release it', async ({ write }) => {
    await withTempDir(async (directory) => {
      const inputFilename = await write(directory);
      await expect(readRaw(inputFilename)).rejects.toThrow('failed to open CHD');
      expect(await isFileOpen(inputFilename)).toEqual(false);
    });
  });

  it('should reject on a CHD whose parent is missing, then release it', async () => {
    await withTempDir(async (directory) => {
      const inputFilename = await copyInto(directory, NEEDS_PARENT);
      await expect(readRaw(inputFilename)).rejects.toThrow('Requires parent');
      expect(await isFileOpen(inputFilename)).toEqual(false);
    });
  });

  it.each([
    {
      label: 'of zero instead of ending early',
      highWaterMark: 0,
      error: 'maxBytes must be a positive number',
    },
    { label: 'past 64 MiB', highWaterMark: 64 * 1024 * 1024 + 1, error: 'maxBytes is too large' },
    {
      label: 'past the largest request',
      highWaterMark: Number.MAX_SAFE_INTEGER * 2,
      error: 'maxBytes is too large',
    },
  ])('should reject a highWaterMark $label', async ({ highWaterMark, error }) => {
    await expect(readRaw(HARD_DISK.inputPath, highWaterMark)).rejects.toThrow(error);
  });

  it('should release the CHD once many readers are abandoned at different points', async () => {
    await withTempDir(async (directory) => {
      const inputFilename = await copyInto(directory, HARD_DISK.inputPath);
      await Promise.all(
        Array.from({ length: 16 }, async (_value, index) => {
          const readable = chdman.openRawReader({ inputFilename, highWaterMark: 512 });
          const iterator = readable[Symbol.asyncIterator]();
          for (let chunks = 0; chunks < index % 4; chunks++) {
            expect((await iterator.next()).done).toEqual(false);
          }
          const closed = events.once(readable, 'close');
          readable.destroy();
          await closed;
        }),
      );
      expect(await isFileOpen(inputFilename)).toEqual(false);
    });
  });

  // TODO(cemmer): Bun, unlike Node.js, reports a terminating Worker's termination as a pending
  // N-API exception, which node-addon-api cannot clear, so it aborts the process instead of
  // dropping the error. igir never terminates a Worker, so only this test is affected. Expected
  // to be fixed by https://github.com/oven-sh/bun/pull/40249
  it.skipIf(process.versions.bun)(
    'should terminate workers with pending native reads, releasing the CHD',
    async () => {
      await withTempDir(async (directory) => {
        const inputPath = await copyInto(directory, GD_ROM.inputPath);
        for (let i = 0; i < 20; i++) {
          const worker = new worker_threads.Worker(
            `const { parentPort, workerData } = require('node:worker_threads');
         import(workerData.indexUrl).then(({ default: chdman }) => {
           for (let j = 0; j < 32; j++) {
             chdman
               .openRawReader({ inputFilename: workerData.inputPath, highWaterMark: 2448 })
               .on('error', () => {})
               .resume();
           }
           parentPort.postMessage('ready');
           setInterval(() => {}, 1000);
         });`,
            {
              eval: true,
              workerData: {
                indexUrl: new URL('../index.ts', import.meta.url).href,
                inputPath,
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
          // Terminating waits for the worker's environment to tear down, which frees every reader
          expect(await isFileOpen(inputPath)).toEqual(false);
        }
      });
    },
    30_000,
  );
});
