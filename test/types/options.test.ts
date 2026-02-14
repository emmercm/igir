import path from 'node:path';

import Temp from '../../src/globals/temp.js';
import FsPoly, { WalkMode } from '../../src/polyfill/fsPoly.js';
import Options from '../../src/types/options.js';

describe('scanPaths', () => {
  test.each([
    // Test parenthetical escaping
    [
      'Nintendo - Nintendo 64 (BigEndian)*/**',
      [
        path.join('Nintendo - Nintendo 64 (BigEndian) (Parent-Clone)', 'rom.z64'),
        path.join('Nintendo - Nintendo 64 (ByteSwapped) (Parent-Clone)', 'rom.v64'),
      ],
      [path.join('Nintendo - Nintendo 64 (BigEndian) (Parent-Clone)', 'rom.z64')],
    ],
    [
      // Extglobs on parentheticals still work
      `Nintendo - Nintendo 64 (*(BigEndian|ByteSwapped))*/**`,
      [
        path.join('Nintendo - Nintendo 64 (BigEndian) (Parent-Clone)', 'rom.z64'),
        path.join('Nintendo - Nintendo 64 (ByteSwapped) (Parent-Clone)', 'rom.v64'),
      ],
      [
        path.join('Nintendo - Nintendo 64 (BigEndian) (Parent-Clone)', 'rom.z64'),
        path.join('Nintendo - Nintendo 64 (ByteSwapped) (Parent-Clone)', 'rom.v64'),
      ],
    ],
    // Test curly brace escaping
    [
      // Brace expression lists still work
      `Nintendo - Nintendo 64 ({BigEndian,ByteSwapped})*/**`,
      [
        path.join('Nintendo - Nintendo 64 (BigEndian) (Parent-Clone)', 'rom.z64'),
        path.join('Nintendo - Nintendo 64 (ByteSwapped) (Parent-Clone)', 'rom.v64'),
      ],
      [
        path.join('Nintendo - Nintendo 64 (BigEndian) (Parent-Clone)', 'rom.z64'),
        path.join('Nintendo - Nintendo 64 (ByteSwapped) (Parent-Clone)', 'rom.v64'),
      ],
    ],
    [
      // Brace expression ranges still work
      'Apple - */* (Disk {2..3}) *',
      [
        path.join(
          'Apple - II (A2R) (Parent-Clone)',
          'The American Heritage Electronic Dictionary (Disk 1) (Unknown).a2r',
        ),
        path.join(
          'Apple - II (A2R) (Parent-Clone)',
          'The American Heritage Electronic Dictionary (Disk 2) (Unknown).a2r',
        ),
        path.join(
          'Apple - II (A2R) (Parent-Clone)',
          'The American Heritage Electronic Dictionary (Disk 3) (Unknown).a2r',
        ),
        path.join(
          'Apple - II (A2R) (Parent-Clone)',
          'The American Heritage Electronic Dictionary (Disk 4) (Unknown).a2r',
        ),
      ],
      [
        path.join(
          'Apple - II (A2R) (Parent-Clone)',
          'The American Heritage Electronic Dictionary (Disk 2) (Unknown).a2r',
        ),
        path.join(
          'Apple - II (A2R) (Parent-Clone)',
          'The American Heritage Electronic Dictionary (Disk 3) (Unknown).a2r',
        ),
      ],
    ],
    // Test square bracket escaping
    [
      '*/[BIOS] *',
      [
        path.join('Atari - Atari 7800 (BIN) (Parent-Clone)', '[BIOS] Atari 7800 (USA).bin'),
        path.join('Atari - Atari Jaguar (J64) (Parent-Clone)', '[BIOS] Atari Jaguar (World).j64'),
        path.join('Atari - Atari Lynx (LYX) (Parent-Clone)', '[BIOS] Atari Lynx (World).lyx'),
      ],
      [
        path.join('Atari - Atari 7800 (BIN) (Parent-Clone)', '[BIOS] Atari 7800 (USA).bin'),
        path.join('Atari - Atari Jaguar (J64) (Parent-Clone)', '[BIOS] Atari Jaguar (World).j64'),
        path.join('Atari - Atari Lynx (LYX) (Parent-Clone)', '[BIOS] Atari Lynx (World).lyx'),
      ],
    ],
    [
      // Regex character classes still work
      'Atari - Atari [7JL]*/*.[bjl]*',
      [
        path.join('Atari - Atari 7800 (BIN) (Parent-Clone)', 'Ace of Aces (Europe).bin'),
        path.join('Atari - Atari Jaguar (J64) (Parent-Clone)', 'Alien vs Predator (World).j64'),
        path.join('Atari - Atari Lynx (LYX) (Parent-Clone)', 'A.P.B. (USA, Europe).lyx'),
      ],
      [
        path.join('Atari - Atari 7800 (BIN) (Parent-Clone)', 'Ace of Aces (Europe).bin'),
        path.join('Atari - Atari Jaguar (J64) (Parent-Clone)', 'Alien vs Predator (World).j64'),
        path.join('Atari - Atari Lynx (LYX) (Parent-Clone)', 'A.P.B. (USA, Europe).lyx'),
      ],
    ],
  ])(
    'should sanitize glob-like patterns: %s',
    async (pattern, filePaths, expectedScannedFilePaths) => {
      const tempDir = await FsPoly.mkdtemp(Temp.getTempDir());
      try {
        await Promise.all(
          filePaths.map(async (filePath) => {
            const tempFilePath = path.join(tempDir, filePath);
            await FsPoly.touch(tempFilePath);
          }),
        );

        const scannedFilePaths = await Options.scanPaths(
          [path.join(tempDir, pattern)],
          WalkMode.FILES,
          undefined,
          false,
        );
        expect(
          scannedFilePaths
            .map((scannedFilePath) => scannedFilePath.replace(tempDir + path.sep, ''))
            .toSorted(),
        ).toEqual(expectedScannedFilePaths.toSorted());
      } finally {
        await FsPoly.rm(tempDir, { force: true, recursive: true });
      }
    },
  );
});

describe('getOutputDirRoot', () => {
  test.each([
    ['', ''],
    ['.', '.'],
    ['root', 'root'],
    ['foo/bar', path.join('foo', 'bar')],
    ['Assets/{pocket}/common/', 'Assets'],
    ['games/{mister}/', 'games'],
    ['Roms/{onion}/', 'Roms'],
    ['roms/{batocera}/', 'roms'],
    ['{datName}', ''],
    ['{datDescription}', ''],
  ])('should find the root dir: %s', (output, expectedPath) => {
    expect(new Options({ commands: ['copy'], output }).getOutputDirRoot()).toEqual(expectedPath);
  });
});

describe('canRemoveHeader', () => {
  test.each(['.a78', '.lnx', '.nes', '.fds', '.smc'])(
    'should not remove header when option not provided: %s',
    (extension) => {
      const options = new Options();
      expect(options.canRemoveHeader(extension)).toEqual(false);
    },
  );

  test.each(['.a78', '.lnx', '.nes', '.fds', '.smc', '.someotherextension'])(
    'should remove header when no arg provided: %s',
    (extension) => {
      const options = new Options({ removeHeaders: [''] });
      expect(options.canRemoveHeader(extension)).toEqual(true);
    },
  );

  test.each(['.lnx', '.smc', '.someotherextension'])(
    'should remove header when extension matches: %s',
    (extension) => {
      const options = new Options({ removeHeaders: ['.LNX', '.smc', '.someotherextension'] });
      expect(options.canRemoveHeader(extension)).toEqual(true);
    },
  );

  test.each(['.a78', '.nes', '.fds'])(
    'should not remove header when extension does not match: %s',
    (extension) => {
      const options = new Options({ removeHeaders: ['.LNX', '.smc', '.someotherextension'] });
      expect(options.canRemoveHeader(extension)).toEqual(false);
    },
  );
});
