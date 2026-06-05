import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import chdman, { CHDType, readableFromReader } from '../index.js';

const FIXTURES = path.join(import.meta.dirname, 'fixtures');

interface Golden {
  tocText: string;
  tocName: string;
  files: { name: string; size: number; sha1: string }[];
}

const isGolden = (value: unknown): value is Golden =>
  typeof value === 'object' &&
  value !== null &&
  'tocText' in value &&
  typeof value.tocText === 'string' &&
  'tocName' in value &&
  typeof value.tocName === 'string' &&
  'files' in value &&
  Array.isArray(value.files);

const golden = (name: string): Golden => {
  const parsed: unknown = JSON.parse(
    fs.readFileSync(path.join(FIXTURES, 'golden', name)).toString(),
  );
  if (!isGolden(parsed)) {
    throw new Error(`invalid golden fixture: ${name}`);
  }
  return parsed;
};

describe('info', () => {
  it('reads a HARD_DISK CHD header', async () => {
    const info = await chdman.info({ inputFilename: path.join(FIXTURES, '2048.chd') });
    expect(info.type).toEqual(CHDType.HARD_DISK);
    expect(Object.values(CHDType)).toContain(info.type);
    expect(info.sha1).toMatch(/^[0-9a-f]{40}$/);
    expect(info.logicalSize).toBeGreaterThan(0);
  });

  it('detects a CD-ROM CHD', async () => {
    const info = await chdman.info({ inputFilename: path.join(FIXTURES, 'CD-ROM.chd') });
    expect(info.type).toEqual(CHDType.CD_ROM);
  });

  it('detects a GD-ROM CHD', async () => {
    const info = await chdman.info({ inputFilename: path.join(FIXTURES, 'GD-ROM.chd') });
    expect(info.type).toEqual(CHDType.GD_ROM);
  });
});

describe('listTracks', () => {
  it('lists CD-ROM cue/bin tracks with parity TOC text and sizes', async () => {
    const expected = golden('cd-rom.cuebin.json');
    const result = await chdman.listCdBinCueTracks({
      inputFilename: path.join(FIXTURES, 'CD-ROM.chd'),
      binNamePattern: 'CD-ROM (Track %t).bin',
      cueName: 'CD-ROM.cue',
    });
    expect(result.tocText).toEqual(expected.tocText);
    expect(result.tracks.map((t) => ({ name: t.filename, size: t.size }))).toEqual(
      expected.files.map((f) => ({ name: f.name, size: f.size })),
    );
  });

  it('lists GD-ROM gdi tracks with parity TOC text and sizes', async () => {
    const expected = golden('gd-rom.gdi.json');
    const result = await chdman.listGdRomTracks({
      inputFilename: path.join(FIXTURES, 'GD-ROM.chd'),
      trackBaseName: 'track',
      gdiName: 'GD-ROM.gdi',
    });
    expect(result.tocText).toEqual(expected.tocText);
    expect(result.tracks.map((t) => ({ name: t.filename, size: t.size }))).toEqual(
      expected.files.map((f) => ({ name: f.name, size: f.size })),
    );
  });
});

async function readerSha1(reader: {
  read: (n: number) => Promise<Buffer | null>;
  close: () => void;
}): Promise<{ size: number; sha1: string }> {
  const hash = crypto.createHash('sha1');
  let size = 0;
  for (;;) {
    const chunk = await reader.read(64 * 1024);
    if (chunk === null || chunk.length === 0) break;
    size += chunk.length;
    hash.update(chunk);
  }
  reader.close();
  return { size, sha1: hash.digest('hex') };
}

describe('openTrackReader', () => {
  it('streams CD-ROM cue/bin tracks byte-identically to the golden', async () => {
    const expected = golden('cd-rom.cuebin.json');
    const listing = await chdman.listCdBinCueTracks({
      inputFilename: path.join(FIXTURES, 'CD-ROM.chd'),
      binNamePattern: 'CD-ROM (Track %t).bin',
      cueName: 'CD-ROM.cue',
    });
    for (const track of listing.tracks) {
      const reader = await chdman.openTrackReader({
        inputFilename: path.join(FIXTURES, 'CD-ROM.chd'),
        mode: 'cuebin',
        trackIndex: track.index,
      });
      const got = await readerSha1(reader);
      const want = expected.files.find((f) => f.name === track.filename);
      expect(want).toBeDefined();
      expect(got).toEqual({ size: want?.size, sha1: want?.sha1 });
    }
  });

  it('streams GD-ROM gdi tracks byte-identically to the golden', async () => {
    const expected = golden('gd-rom.gdi.json');
    const listing = await chdman.listGdRomTracks({
      inputFilename: path.join(FIXTURES, 'GD-ROM.chd'),
      trackBaseName: 'track',
      gdiName: 'GD-ROM.gdi',
    });
    for (const track of listing.tracks) {
      const reader = await chdman.openTrackReader({
        inputFilename: path.join(FIXTURES, 'GD-ROM.chd'),
        mode: 'gdi',
        trackIndex: track.index,
      });
      const got = await readerSha1(reader);
      const want = expected.files.find((f) => f.name === track.filename);
      expect(want).toBeDefined();
      expect(got).toEqual({ size: want?.size, sha1: want?.sha1 });
    }
  });
});

describe('openRawReader', () => {
  it('streams a HARD_DISK CHD logical image with size == logicalSize', async () => {
    const info = await chdman.info({ inputFilename: path.join(FIXTURES, '2048.chd') });
    const reader = await chdman.openRawReader({ inputFilename: path.join(FIXTURES, '2048.chd') });
    const got = await readerSha1(reader);
    expect(got.size).toEqual(info.logicalSize);
    expect(got.sha1).toEqual(info.dataSha1);
  });
});

describe('readableFromReader', () => {
  it('produces a Readable whose bytes match the golden track', async () => {
    const expected = golden('cd-rom.cuebin.json');
    const reader = await chdman.openTrackReader({
      inputFilename: path.join(FIXTURES, 'CD-ROM.chd'),
      mode: 'cuebin',
      trackIndex: 0,
    });
    const readable = readableFromReader(reader);
    const hash = crypto.createHash('sha1');
    let size = 0;
    for await (const chunk of readable) {
      if (Buffer.isBuffer(chunk)) {
        size += chunk.length;
        hash.update(chunk);
      }
    }
    const want = expected.files.find((f) => f.name === 'CD-ROM (Track 1).bin');
    expect(want).toBeDefined();
    expect({ size, sha1: hash.digest('hex') }).toEqual({ size: want?.size, sha1: want?.sha1 });
  });
});

describe('cue/bin runaway guard', () => {
  // Some GD-ROM CHDs cannot be expressed as cue/bin: a high-density track has
  // padframes exceeding frames+splitframes, so chdman's frame formula underflows
  // and extraction would decompress ~10 TB. This must be refused up front (the
  // protection the old chdman progress-watchdog provided), not streamed forever.
  it('refuses to list a GD-ROM as cue/bin instead of producing a runaway track', async () => {
    await expect(
      chdman.listCdBinCueTracks({
        inputFilename: path.join(FIXTURES, 'GD-ROM.chd'),
        binNamePattern: 'GD-ROM (Track %t).bin',
        cueName: 'GD-ROM.cue',
      }),
    ).rejects.toThrow(/cannot be extracted as cue\/bin/);
  });

  it('refuses to open a runaway GD-ROM cue/bin track reader', async () => {
    await expect(
      chdman.openTrackReader({
        inputFilename: path.join(FIXTURES, 'GD-ROM.chd'),
        mode: 'cuebin',
        trackIndex: 2,
      }),
    ).rejects.toThrow(/cannot be extracted as cue\/bin/);
  });
});
