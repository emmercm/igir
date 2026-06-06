import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import chdman, { CHDType, readableFromReader } from '../index.js';

const FIXTURES = path.join(import.meta.dirname, 'fixtures');

const sha1 = (buffer: Buffer): string => crypto.createHash('sha1').update(buffer).digest('hex');

interface GoldenFile {
  name: string;
  size: number;
  sha1: string;
  bytes: Buffer;
}

interface Golden {
  tocName: string;
  tocText: string;
  files: GoldenFile[];
}

/**
 * Load a golden directory: the single `.cue`/`.gdi` file is the expected TOC,
 * and every other file is an expected extracted track (sorted by name to match
 * the order tracks are listed in).
 */
const golden = (directory: string): Golden => {
  const root = path.join(FIXTURES, 'golden', directory);
  const entries = fs.readdirSync(root).filter((name) => !name.startsWith('.'));
  const tocName = entries.find((name) => name.endsWith('.cue') || name.endsWith('.gdi'));
  if (tocName === undefined) {
    throw new Error(`no .cue/.gdi TOC file in golden/${directory}`);
  }
  const tocText = fs.readFileSync(path.join(root, tocName)).toString();
  const files = entries
    .filter((name) => name !== tocName)
    .toSorted((a, b) => a.localeCompare(b))
    .map((name) => {
      const bytes = fs.readFileSync(path.join(root, name));
      return { name, size: bytes.length, sha1: sha1(bytes), bytes };
    });
  return { tocName, tocText, files };
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
    const expected = golden('cd-rom.cuebin');
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
    ).toEqual(expected.files.map((file) => ({ name: file.name, size: file.size })));
  });

  it('lists GD-ROM gdi tracks with parity TOC text and sizes', async () => {
    const expected = golden('gd-rom.gdi');
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
    ).toEqual(expected.files.map((file) => ({ name: file.name, size: file.size })));
  });
});

async function readAll(reader: {
  read: (n: number) => Promise<Buffer | null>;
  close: () => void;
}): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for (;;) {
    const chunk = await reader.read(64 * 1024);
    if (chunk === null || chunk.length === 0) {
      break;
    }
    chunks.push(chunk);
  }
  reader.close();
  return Buffer.concat(chunks);
}

describe('openTrackReader', () => {
  it('streams CD-ROM cue/bin tracks byte-identically to the golden', async () => {
    const expected = golden('cd-rom.cuebin');
    const listing = await chdman.listCdBinCueTracks({
      inputFilename: path.join(FIXTURES, 'CD-ROM.chd'),
      binNamePattern: 'CD-ROM (Track %t).bin',
      cueName: expected.tocName,
    });
    for (const track of listing.tracks) {
      const reader = await chdman.openTrackReader({
        inputFilename: path.join(FIXTURES, 'CD-ROM.chd'),
        mode: 'cuebin',
        trackIndex: track.index,
      });
      const got = await readAll(reader);
      const want = expected.files.find((file) => file.name === track.filename);
      if (want === undefined) {
        throw new Error(`no golden file for track ${track.filename}`);
      }
      expect({ size: got.length, sha1: sha1(got) }).toEqual({ size: want.size, sha1: want.sha1 });
    }
  });

  it('streams GD-ROM gdi tracks byte-identically to the golden', async () => {
    const expected = golden('gd-rom.gdi');
    const listing = await chdman.listGdRomTracks({
      inputFilename: path.join(FIXTURES, 'GD-ROM.chd'),
      trackBaseName: 'track',
      gdiName: expected.tocName,
    });
    for (const track of listing.tracks) {
      const reader = await chdman.openTrackReader({
        inputFilename: path.join(FIXTURES, 'GD-ROM.chd'),
        mode: 'gdi',
        trackIndex: track.index,
      });
      const got = await readAll(reader);
      const want = expected.files.find((file) => file.name === track.filename);
      if (want === undefined) {
        throw new Error(`no golden file for track ${track.filename}`);
      }
      expect({ size: got.length, sha1: sha1(got) }).toEqual({ size: want.size, sha1: want.sha1 });
    }
  });
});

describe('openRawReader', () => {
  it('streams a HARD_DISK CHD logical image with size == logicalSize', async () => {
    const info = await chdman.info({ inputFilename: path.join(FIXTURES, '2048.chd') });
    const reader = await chdman.openRawReader({ inputFilename: path.join(FIXTURES, '2048.chd') });
    const got = await readAll(reader);
    expect(got.length).toEqual(info.logicalSize);
    expect(sha1(got)).toEqual(info.dataSha1);
  });
});

describe('readableFromReader', () => {
  it('produces a Readable whose bytes match the golden track', async () => {
    const expected = golden('cd-rom.cuebin');
    const want = expected.files.find((file) => file.name === 'CD-ROM (Track 1).bin');
    if (want === undefined) {
      throw new Error('missing golden track CD-ROM (Track 1).bin');
    }
    const reader = await chdman.openTrackReader({
      inputFilename: path.join(FIXTURES, 'CD-ROM.chd'),
      mode: 'cuebin',
      trackIndex: 0,
    });
    const readable = readableFromReader(reader);
    const chunks: Buffer[] = [];
    for await (const chunk of readable) {
      if (Buffer.isBuffer(chunk)) {
        chunks.push(chunk);
      }
    }
    const got = Buffer.concat(chunks);
    expect({ size: got.length, sha1: sha1(got) }).toEqual({ size: want.size, sha1: want.sha1 });
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
