import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import chdman, { CHDType } from '../index.js';

const FIXTURES = path.join(import.meta.dirname, 'fixtures');

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

describe('extract (native)', () => {
  it('extracts a CD-ROM CHD to a cue + split bins', async () => {
    const out = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'chdman-test-'));
    try {
      const files = await chdman.extractCd({
        inputFilename: path.join(FIXTURES, 'CD-ROM.chd'),
        outputFilename: path.join(out, 'game.cue'),
        outputBinFilename: path.join(out, 'game (Track %t).bin'),
        splitBin: true,
      });
      expect(files.some((f) => f.endsWith('.cue'))).toBe(true);
      expect(files.some((f) => f.endsWith('.bin'))).toBe(true);
      for (const f of files) expect(fs.existsSync(f)).toBe(true);
    } finally {
      await fs.promises.rm(out, { recursive: true, force: true });
    }
  });
});

describe('runaway watchdog', () => {
  it('aborts extracting a GD-ROM CHD as a cue + split bins', async () => {
    const out = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'chdman-test-'));
    try {
      await expect(
        chdman.extractCd({
          inputFilename: path.join(FIXTURES, 'GD-ROM.chd'),
          outputFilename: path.join(out, 'game.cue'),
          outputBinFilename: path.join(out, 'game (Track %t).bin'),
          splitBin: true,
        }),
      ).rejects.toThrow(/aborted/i);
    } finally {
      await fs.promises.rm(out, { recursive: true, force: true });
    }
  });
});
