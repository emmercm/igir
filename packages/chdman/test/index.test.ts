import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import BufferUtil from '../../../src/utils/bufferUtil.js';
import chdman, { CHDType } from '../index.js';

const FIXTURES = path.join(import.meta.dirname, 'fixtures');

const sha1 = (buffer: Buffer): string => crypto.createHash('sha1').update(buffer).digest('hex');

interface ExpectedTrack {
  name: string;
  size: number;
  sha1: string;
  bytes: Buffer;
}

interface ExpectedTrackListing {
  tocName: string;
  tocText: string;
  tracks: ExpectedTrack[];
}

/**
 * Generate the expected track listing for a fixture directory: the single `.cue`/`.gdi`
 * file is the expected TOC, and every other file is an expected extracted track (sorted by
 * name to match the order tracks are listed in).
 */
const generateExpectedTrackListing = (directory: string): ExpectedTrackListing => {
  const root = path.join(FIXTURES, 'expected', directory);
  const entries = fs.readdirSync(root).filter((name) => !name.startsWith('.'));
  const tocName = entries.find((name) => name.endsWith('.cue') || name.endsWith('.gdi'));
  if (tocName === undefined) {
    throw new Error(`no .cue/.gdi TOC file in expected/${directory}`);
  }
  const tocText = fs.readFileSync(path.join(root, tocName)).toString();
  const tracks = entries
    .filter((name) => name !== tocName)
    .toSorted((a, b) => a.localeCompare(b))
    .map((name) => {
      const bytes = fs.readFileSync(path.join(root, name));
      return { name, size: bytes.length, sha1: sha1(bytes), bytes };
    });
  return { tocName, tocText, tracks };
};

describe('info', () => {
  it('should read a HARD_DISK CHD header', async () => {
    const info = await chdman.info({ inputFilename: path.join(FIXTURES, '2048.chd') });
    expect(info.type).toEqual(CHDType.HARD_DISK);
    expect(Object.values(CHDType)).toContain(info.type);
    expect(info.sha1).toMatch(/^[0-9a-f]{40}$/);
    expect(info.logicalSize).toBeGreaterThan(0);
  });

  it('should detect a CD-ROM CHD', async () => {
    const info = await chdman.info({ inputFilename: path.join(FIXTURES, 'CD-ROM.chd') });
    expect(info.type).toEqual(CHDType.CD_ROM);
  });

  it('should detect a GD-ROM CHD', async () => {
    const info = await chdman.info({ inputFilename: path.join(FIXTURES, 'GD-ROM.chd') });
    expect(info.type).toEqual(CHDType.GD_ROM);
  });
});

describe('listCdBinCueTracks', () => {
  it('should list CD-ROM cue/bin tracks with parity TOC text and sizes', async () => {
    const expected = generateExpectedTrackListing('cd-rom.cuebin');
    const result = await chdman.listCdBinCueTracks({
      inputFilename: path.join(FIXTURES, 'CD-ROM.chd'),
      binNamePattern: 'CD-ROM (Track %t).bin',
      cueName: expected.tocName,
    });
    expect(result.tocText).toEqual(expected.tocText);
    expect(
      result.tracks
        .toSorted((a, b) => a.filename.localeCompare(b.filename))
        .map((track) => ({ name: track.filename, size: track.size })),
    ).toEqual(expected.tracks.map((track) => ({ name: track.name, size: track.size })));
  });

  it('should refuse to list a GD-ROM as cue/bin instead of producing a runaway track', async () => {
    // Some GD-ROM CHDs cannot be expressed as cue/bin: a high-density track has
    // padframes exceeding frames+splitframes, so chdman's frame formula underflows
    // and extraction would decompress ~10 TB. This must be refused up front (the
    // protection the old chdman progress-watchdog provided), not streamed forever.
    await expect(
      chdman.listCdBinCueTracks({
        inputFilename: path.join(FIXTURES, 'GD-ROM.chd'),
        binNamePattern: 'GD-ROM (Track %t).bin',
        cueName: 'GD-ROM.cue',
      }),
    ).rejects.toThrow(/cannot be extracted as cue\/bin/);
  });
});

describe('listGdRomTracks', () => {
  it('should list GD-ROM gdi tracks with parity TOC text and sizes', async () => {
    const expected = generateExpectedTrackListing('gd-rom.gdi');
    const result = await chdman.listGdRomTracks({
      inputFilename: path.join(FIXTURES, 'GD-ROM.chd'),
      trackBaseName: 'track',
      gdiName: expected.tocName,
    });
    expect(result.tocText).toEqual(expected.tocText);
    expect(
      result.tracks
        .toSorted((a, b) => a.filename.localeCompare(b.filename))
        .map((track) => ({ name: track.filename, size: track.size })),
    ).toEqual(expected.tracks.map((track) => ({ name: track.name, size: track.size })));
  });
});

describe('openTrackReader', () => {
  it('should stream CD-ROM cue/bin tracks byte-identically to the expected tracks', async () => {
    const expected = generateExpectedTrackListing('cd-rom.cuebin');
    const listing = await chdman.listCdBinCueTracks({
      inputFilename: path.join(FIXTURES, 'CD-ROM.chd'),
      binNamePattern: 'CD-ROM (Track %t).bin',
      cueName: expected.tocName,
    });
    for (const track of listing.tracks) {
      const readable = await chdman.openTrackReader({
        inputFilename: path.join(FIXTURES, 'CD-ROM.chd'),
        mode: 'cuebin',
        trackIndex: track.index,
      });
      const got = await BufferUtil.fromReadable(readable);
      const want = expected.tracks.find((expectedTrack) => expectedTrack.name === track.filename);
      if (want === undefined) {
        throw new Error(`no expected track for ${track.filename}`);
      }
      expect({ size: got.length, sha1: sha1(got) }).toEqual({ size: want.size, sha1: want.sha1 });
    }
  });

  it('should stream GD-ROM gdi tracks byte-identically to the expected tracks', async () => {
    const expected = generateExpectedTrackListing('gd-rom.gdi');
    const listing = await chdman.listGdRomTracks({
      inputFilename: path.join(FIXTURES, 'GD-ROM.chd'),
      trackBaseName: 'track',
      gdiName: expected.tocName,
    });
    for (const track of listing.tracks) {
      const readable = await chdman.openTrackReader({
        inputFilename: path.join(FIXTURES, 'GD-ROM.chd'),
        mode: 'gdi',
        trackIndex: track.index,
      });
      const got = await BufferUtil.fromReadable(readable);
      const want = expected.tracks.find((expectedTrack) => expectedTrack.name === track.filename);
      if (want === undefined) {
        throw new Error(`no expected track for ${track.filename}`);
      }
      expect({ size: got.length, sha1: sha1(got) }).toEqual({ size: want.size, sha1: want.sha1 });
    }
  });

  it('should stream multiple independent readers in parallel byte-identically', async () => {
    const expected = generateExpectedTrackListing('cd-rom.cuebin');
    const listing = await chdman.listCdBinCueTracks({
      inputFilename: path.join(FIXTURES, 'CD-ROM.chd'),
      binNamePattern: 'CD-ROM (Track %t).bin',
      cueName: expected.tocName,
    });
    // Open every track reader at once and consume them concurrently; each owns
    // its own chd_file, so results must be independent of interleaving.
    const results = await Promise.all(
      listing.tracks.map(async (track) => {
        const readable = await chdman.openTrackReader({
          inputFilename: path.join(FIXTURES, 'CD-ROM.chd'),
          mode: 'cuebin',
          trackIndex: track.index,
        });
        return { filename: track.filename, bytes: await BufferUtil.fromReadable(readable) };
      }),
    );
    for (const result of results) {
      const want = expected.tracks.find((expectedTrack) => expectedTrack.name === result.filename);
      if (want === undefined) {
        throw new Error(`no expected track for ${result.filename}`);
      }
      expect({ size: result.bytes.length, sha1: sha1(result.bytes) }).toEqual({
        size: want.size,
        sha1: want.sha1,
      });
    }
  });

  it('should release the CHD when the Readable is destroyed before EOF', async () => {
    const readable = await chdman.openTrackReader({
      inputFilename: path.join(FIXTURES, 'CD-ROM.chd'),
      mode: 'cuebin',
      trackIndex: 0,
    });
    // Consume only the first chunk, then break: the for-await loop destroys the
    // Readable, which must close the native reader without erroring.
    let chunks = 0;
    for await (const chunk of readable) {
      if (!Buffer.isBuffer(chunk)) {
        continue;
      }

      chunks += 1;
      break;
    }
    expect(chunks).toEqual(1);
    expect(readable.destroyed).toBe(true);
  });

  it('should not drop the tail of the final frame when a read boundary falls mid-frame', async () => {
    // CD-ROM-large.chd has one 56-frame (131712-byte) track whose final frame straddles
    // the stream's 64KiB read boundary (131712 % 65536 = 640 < 2352), so the full track
    // must stream out even when a read boundary falls inside its last frame.
    const listing = await chdman.listCdBinCueTracks({
      inputFilename: path.join(FIXTURES, 'CD-ROM-large.chd'),
      binNamePattern: 'CD-ROM-large (Track %t).bin',
      cueName: 'CD-ROM-large.cue',
    });
    const readable = await chdman.openTrackReader({
      inputFilename: path.join(FIXTURES, 'CD-ROM-large.chd'),
      mode: 'cuebin',
      trackIndex: 0,
    });
    const got = await BufferUtil.fromReadable(readable);
    expect({ size: got.length, sha1: sha1(got) }).toEqual({
      size: listing.tracks[0].size,
      sha1: '5e16fcf761fb240f925da55682c9fba2a7717ea6',
    });
  });

  it('should refuse to open a runaway GD-ROM cue/bin track reader', async () => {
    // The same high-density-track frame underflow that blocks listCdBinCueTracks
    // (see that suite) must also be refused when opening a track reader directly,
    // rather than streaming a ~10 TB runaway.
    await expect(
      chdman.openTrackReader({
        inputFilename: path.join(FIXTURES, 'GD-ROM.chd'),
        mode: 'cuebin',
        trackIndex: 2,
      }),
    ).rejects.toThrow(/cannot be extracted as cue\/bin/);
  });
});

describe('openRawReader', () => {
  it('should stream a HARD_DISK CHD logical image with size == logicalSize', async () => {
    const info = await chdman.info({ inputFilename: path.join(FIXTURES, '2048.chd') });
    const readable = await chdman.openRawReader({ inputFilename: path.join(FIXTURES, '2048.chd') });
    const got = await BufferUtil.fromReadable(readable);
    expect(got.length).toEqual(info.logicalSize);
    expect(sha1(got)).toEqual(info.dataSha1);
  });

  it('should stream multiple raw readers over the same CHD in parallel', async () => {
    const info = await chdman.info({ inputFilename: path.join(FIXTURES, '2048.chd') });
    // Three independent readers over the same file, consumed concurrently. Each
    // owns its own chd_file, so all three must yield the identical logical image.
    const results = await Promise.all(
      [0, 1, 2].map(async () => {
        const readable = await chdman.openRawReader({
          inputFilename: path.join(FIXTURES, '2048.chd'),
        });
        return await BufferUtil.fromReadable(readable);
      }),
    );
    for (const bytes of results) {
      expect(bytes.length).toEqual(info.logicalSize);
      expect(sha1(bytes)).toEqual(info.dataSha1);
    }
  });
});
