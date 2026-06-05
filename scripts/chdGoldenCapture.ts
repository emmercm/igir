import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import chdman, { readableFromReader } from '../packages/chdman/index.js';

interface GoldenFile {
  name: string;
  size: number;
  sha1: string;
}
interface Golden {
  tocText: string;
  tocName: string;
  files: GoldenFile[];
}

/**
 * Capture a CD-ROM CHD's cue/bin golden snapshot using the current addon.
 */
async function captureCueBin(chdPath: string, prefix: string): Promise<Golden> {
  const listing = await chdman.listCdBinCueTracks({
    inputFilename: chdPath,
    binNamePattern: `${prefix} (Track %t).bin`,
    cueName: `${prefix}.cue`,
  });
  const files: GoldenFile[] = [];
  for (const track of listing.tracks) {
    const reader = await chdman.openTrackReader({
      inputFilename: chdPath,
      mode: 'cuebin',
      trackIndex: track.index,
    });
    const hash = crypto.createHash('sha1');
    let size = 0;
    for await (const chunk of readableFromReader(reader)) {
      if (Buffer.isBuffer(chunk)) {
        size += chunk.length;
        hash.update(chunk);
      }
    }
    files.push({ name: track.filename, size, sha1: hash.digest('hex') });
  }
  files.sort((a, b) => a.name.localeCompare(b.name));
  return { tocText: listing.tocText, tocName: `${prefix}.cue`, files };
}

/**
 * Capture a GD-ROM CHD's gdi golden snapshot using the current addon.
 */
async function captureGdi(chdPath: string, prefix: string): Promise<Golden> {
  const listing = await chdman.listGdRomTracks({
    inputFilename: chdPath,
    trackBaseName: 'track',
    gdiName: `${prefix}.gdi`,
  });
  const files: GoldenFile[] = [];
  for (const track of listing.tracks) {
    const reader = await chdman.openTrackReader({
      inputFilename: chdPath,
      mode: 'gdi',
      trackIndex: track.index,
    });
    const hash = crypto.createHash('sha1');
    let size = 0;
    for await (const chunk of readableFromReader(reader)) {
      if (Buffer.isBuffer(chunk)) {
        size += chunk.length;
        hash.update(chunk);
      }
    }
    files.push({ name: track.filename, size, sha1: hash.digest('hex') });
  }
  files.sort((a, b) => a.name.localeCompare(b.name));
  return { tocText: listing.tocText, tocName: `${prefix}.gdi`, files };
}

const fixtures = path.join('packages', 'chdman', 'test', 'fixtures');
const goldenDir = path.join(fixtures, 'golden');
fs.mkdirSync(goldenDir, { recursive: true });

const cd = await captureCueBin(path.join(fixtures, 'CD-ROM.chd'), 'CD-ROM');
fs.writeFileSync(
  path.join(goldenDir, 'cd-rom.cuebin.json'),
  `${JSON.stringify(cd, undefined, 2)}\n`,
);

const gd = await captureGdi(path.join(fixtures, 'GD-ROM.chd'), 'GD-ROM');
fs.writeFileSync(path.join(goldenDir, 'gd-rom.gdi.json'), `${JSON.stringify(gd, undefined, 2)}\n`);

console.log('wrote golden snapshots');
