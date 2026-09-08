import IgirException from '../../../src/exceptions/igirException.js';
import ROM from '../../../src/models/dats/rom.js';

describe('constructor', () => {
  test.each([
    '..',
    '../evil.rom',
    '../../../../tmp/evil.rom',
    'roms/../../evil.rom',
    'roms/..',
    '..\\evil.rom',
    'roms\\..\\..\\evil.rom',
    '/etc/passwd',
    '//server/share/evil.rom',
    'C:\\Windows\\evil.rom',
    'c:/windows/evil.rom',
  ])('should throw on a name that escapes the output directory: %s', (name) => {
    expect(() => new ROM({ name, size: 0 })).toThrow(IgirException);
  });

  test.each([
    'Tetris (World).gb',
    'Nintendo - Game Boy/Tetris (World).gb',
    './Tetris (World).gb',
    // Only whole segments count, these are all legal filenames
    'Final Fantasy VII..disc1.bin',
    '..hidden.rom',
    'Game.../rom.bin',
  ])('should not throw on a legal name: %s', (name) => {
    expect(() => new ROM({ name, size: 0 })).not.toThrow();
  });
});
