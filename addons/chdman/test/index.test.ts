import crypto from 'node:crypto';
import events from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import worker_threads from 'node:worker_threads';

import BufferUtil from '../../../src/utils/bufferUtil.js';
import FsUtil from '../../../src/utils/fsUtil.js';
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

// Files that no reader can open
const UNOPENABLE = [
  { label: 'a missing file', inputFilename: MISSING },
  { label: 'a file that is not a CHD', inputFilename: import.meta.filename },
  { label: 'a truncated CHD', inputFilename: TRUNCATED },
];

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
 * @returns the size and SHA-1 of the logical image of {@link inputPath}, streamed by the addon
 */
async function readRaw(inputPath: string, highWaterMark?: number): Promise<Digest> {
  return computeDigest(
    await BufferUtil.fromReadable(
      chdman.openRawReader({ inputFilename: inputPath, highWaterMark }),
    ),
  );
}

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
    'should read the info of $inputPath',
    async ({ inputPath, expectedInfo }) => {
      await expect(chdman.info({ inputFilename: inputPath })).resolves.toEqual(expectedInfo);
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

  it.each(UNOPENABLE)('should reject on $label', async ({ inputFilename }) => {
    await expect(chdman.info({ inputFilename })).rejects.toThrow('failed to open CHD');
  });

  it('should read the info of a CHD whose parent is missing', async () => {
    await expect(chdman.info({ inputFilename: NEEDS_PARENT })).resolves.toEqual({
      inputFile: NEEDS_PARENT,
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
  });

  it('should read many CHDs concurrently', async () => {
    const infos = await Promise.all(
      Array.from(
        { length: 16 },
        async () => await chdman.info({ inputFilename: HARD_DISK.inputPath }),
      ),
    );
    expect(infos).toEqual(Array.from({ length: 16 }, () => HARD_DISK.expectedInfo));
  });
});

describe('listCdBinCueTracks', () => {
  it.each(CUEBIN_FIXTURES)(
    "should list $inputPath with chdman's cue text and track sizes",
    expectListing,
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

  it('should reject on a missing file', async () => {
    await expect(
      chdman.listCdBinCueTracks({
        inputFilename: MISSING,
        binNamePattern: 'missing (Track %t).bin',
        cueName: 'missing.cue',
      }),
    ).rejects.toThrow('failed to open CHD');
  });
});

describe('listGdRomTracks', () => {
  it.each(GDI_FIXTURES)(
    "should list $inputPath with chdman's gdi text and track sizes",
    expectListing,
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
    'should stream every track of $inputPath byte-identically to chdman',
    async (fixture) => {
      await expectTracks(fixture);
    },
  );

  it.each(expandHighWaterMarks([MIXED_PREGAP, GD_ROM]))(
    'should stream $fixture.inputPath with a high-water mark of $highWaterMark byte-identically',
    async ({ fixture, highWaterMark }) => {
      await expectTracks(fixture, highWaterMark);
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
    'should reject with a RangeError for track index %i, which the CHD does not have',
    async (trackIndex) => {
      const read = BufferUtil.fromReadable(
        chdman.openTrackReader({
          inputFilename: MIXED_PREGAP.inputPath,
          mode: TrackReaderMode.CUEBIN,
          trackIndex,
        }),
      );
      await expect(read).rejects.toThrow(RangeError);
      await expect(read).rejects.toThrow('track index out of range');
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

  it('should close cleanly when destroyed mid-stream', async () => {
    const readable = chdman.openTrackReader({
      inputFilename: FRAME_STRADDLES_READ.inputPath,
      mode: TrackReaderMode.CUEBIN,
      trackIndex: 0,
      highWaterMark: 2352,
    });
    await new Promise<void>((resolve, reject) => {
      readable.once('data', () => {
        readable.destroy();
        resolve();
      });
      readable.once('error', reject);
    });
    await new Promise<void>((resolve) => {
      readable.once('close', resolve);
    });
    expect(readable.destroyed).toEqual(true);
  });
});

describe('openRawReader', () => {
  it.each(RAW_FIXTURES)(
    'should stream the logical image of $inputPath byte-identically to chdman',
    async (fixture) => {
      await expect(readRaw(fixture.inputPath)).resolves.toEqual(await readExpectedImage(fixture));
    },
  );

  it.each(
    expandHighWaterMarks([
      findFixture('codecs/hd-zlib-hunk6144.chd'),
      findFixture('layouts/raw-unit2448.chd'),
    ]),
  )(
    'should stream $fixture.inputPath with a high-water mark of $highWaterMark byte-identically',
    async ({ fixture, highWaterMark }) => {
      await expect(readRaw(fixture.inputPath, highWaterMark)).resolves.toEqual(
        await readExpectedImage(fixture),
      );
    },
  );

  it('should stream multiple raw readers over the same CHD in parallel', async () => {
    const image = await readExpectedImage(HARD_DISK);
    // Three independent readers over the same file, consumed concurrently. Each
    // owns its own chd_file, so all three must yield the identical logical image.
    await expect(
      Promise.all([0, 1, 2].map(async () => await readRaw(HARD_DISK.inputPath))),
    ).resolves.toEqual([image, image, image]);
  });

  it.each(UNOPENABLE)('should reject on $label', async ({ inputFilename }) => {
    await expect(readRaw(inputFilename)).rejects.toThrow('failed to open CHD');
  });

  it('should reject on a CHD whose parent is missing', async () => {
    await expect(readRaw(NEEDS_PARENT)).rejects.toThrow('Requires parent');
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
  ])('should reject a high-water mark $label', async ({ highWaterMark, error }) => {
    await expect(readRaw(HARD_DISK.inputPath, highWaterMark)).rejects.toThrow(error);
  });

  // TODO(cemmer): Bun, unlike Node.js, reports a terminating Worker's termination as a pending
  // N-API exception, which node-addon-api cannot clear, so it aborts the process instead of
  // dropping the error. igir never terminates a Worker, so only this test is affected. Expected
  // to be fixed by https://github.com/oven-sh/bun/pull/40249
  it.skipIf(process.versions.bun)(
    'should terminate workers with pending native reads',
    async () => {
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
              inputPath: GD_ROM.inputPath,
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
    },
    30_000,
  );
});
