import ROM from '../../src/types/dats/rom.js';
import SingleValueGame from '../../src/types/dats/singleValueGame.js';
import File from '../../src/types/files/file.js';
import IPSPatch from '../../src/types/patches/ipsPatch.js';
import ROMWithFiles from '../../src/types/romWithFiles.js';
import WriteCandidate from '../../src/types/writeCandidate.js';

async function dummyFile(): Promise<File> {
  return await File.fileOf({ filePath: 'dummy.rom', size: 0, crc32: '00000000' });
}

async function patchedFile(): Promise<File> {
  const file = await File.fileOf({ filePath: 'file.rom', size: 0, crc32: 'DEADBEEF' });
  const patch = IPSPatch.patchFrom(await File.fileOf({ filePath: 'patch deadbeef.ips' }));
  return file.withPatch(patch);
}

describe('getName', () => {
  it('should return the game name', async () => {
    const game = new SingleValueGame({ name: 'My Game' });
    const file = await dummyFile();
    const rom = new ROM({ name: 'my.rom', size: 0 });
    const candidate = new WriteCandidate(game, [new ROMWithFiles(rom, file, file)]);
    expect(candidate.getName()).toEqual('My Game');
  });
});

describe('isPatched', () => {
  it('should return false when no ROMs have patches', async () => {
    const game = new SingleValueGame({ name: 'Test Game' });
    const file = await dummyFile();
    const rom = new ROM({ name: 'test.rom', size: 0 });
    const candidate = new WriteCandidate(game, [new ROMWithFiles(rom, file, file)]);
    expect(candidate.isPatched()).toEqual(false);
  });

  it('should return false for an empty candidate', () => {
    const game = new SingleValueGame({ name: 'Empty Game' });
    const candidate = new WriteCandidate(game, []);
    expect(candidate.isPatched()).toEqual(false);
  });

  it('should return true when at least one ROM has a patch', async () => {
    const game = new SingleValueGame({ name: 'Patched Game' });
    const outputFile = await dummyFile();
    const inputFileWithPatch = await patchedFile();
    const rom = new ROM({ name: 'file.rom', size: 0 });
    const candidate = new WriteCandidate(game, [
      new ROMWithFiles(rom, inputFileWithPatch, outputFile),
    ]);
    expect(candidate.isPatched()).toEqual(true);
  });
});

describe('withGame', () => {
  it('should return a new instance with the new game', async () => {
    const game = new SingleValueGame({ name: 'Original' });
    const file = await dummyFile();
    const rom = new ROM({ name: 'test.rom', size: 0 });
    const candidate = new WriteCandidate(game, [new ROMWithFiles(rom, file, file)]);
    const newGame = new SingleValueGame({ name: 'Updated' });
    const updated = candidate.withGame(newGame);
    expect(updated).not.toBe(candidate);
    expect(updated.getName()).toEqual('Updated');
    expect(candidate.getName()).toEqual('Original');
  });
});

describe('withRomsWithFiles', () => {
  it('should return the same instance when ROMs are identical', async () => {
    const game = new SingleValueGame({ name: 'Test' });
    const file = await dummyFile();
    const rom = new ROM({ name: 'test.rom', size: 0 });
    const romsWithFiles = [new ROMWithFiles(rom, file, file)];
    const candidate = new WriteCandidate(game, romsWithFiles);
    const result = candidate.withRomsWithFiles(romsWithFiles);
    expect(result).toBe(candidate);
  });

  it('should return a new instance when ROMs are different', async () => {
    const game = new SingleValueGame({ name: 'Test' });
    const file = await dummyFile();
    const rom1 = new ROM({ name: 'one.rom', size: 1, crc32: '11111111' });
    const rom2 = new ROM({ name: 'two.rom', size: 2, crc32: '22222222' });
    const original = new WriteCandidate(game, [new ROMWithFiles(rom1, file, file)]);
    const newRomsWithFiles = [new ROMWithFiles(rom2, file, file)];
    const updated = original.withRomsWithFiles(newRomsWithFiles);
    expect(updated).not.toBe(original);
    expect(updated.getRomsWithFiles()).toHaveLength(1);
    expect(updated.getRomsWithFiles()[0].getRom()).toEqual(rom2);
  });
});

describe('hashCode', () => {
  it('should return a stable hashCode', async () => {
    const game = new SingleValueGame({ name: 'Stable' });
    const file = await dummyFile();
    const rom = new ROM({ name: 'stable.rom', size: 0 });
    const candidate = new WriteCandidate(game, [new ROMWithFiles(rom, file, file)]);
    expect(candidate.hashCode()).toEqual(candidate.hashCode());
  });

  it('should produce different hashCodes for different games', async () => {
    const file = await dummyFile();
    const rom = new ROM({ name: 'game.rom', size: 0 });
    const game1 = new SingleValueGame({ name: 'Game A' });
    const game2 = new SingleValueGame({ name: 'Game B' });
    const candidate1 = new WriteCandidate(game1, [new ROMWithFiles(rom, file, file)]);
    const candidate2 = new WriteCandidate(game2, [new ROMWithFiles(rom, file, file)]);
    expect(candidate1.hashCode()).not.toEqual(candidate2.hashCode());
  });

  it('should produce different hashCodes for different ROMs', async () => {
    const game = new SingleValueGame({ name: 'Same Game' });
    const file = await dummyFile();
    const rom1 = new ROM({ name: 'one.rom', size: 1, crc32: '11111111' });
    const rom2 = new ROM({ name: 'two.rom', size: 2, crc32: '22222222' });
    const outputFile1 = await File.fileOf({ filePath: 'out1.rom', size: 1, crc32: '11111111' });
    const outputFile2 = await File.fileOf({ filePath: 'out2.rom', size: 2, crc32: '22222222' });
    const candidate1 = new WriteCandidate(game, [new ROMWithFiles(rom1, file, outputFile1)]);
    const candidate2 = new WriteCandidate(game, [new ROMWithFiles(rom2, file, outputFile2)]);
    expect(candidate1.hashCode()).not.toEqual(candidate2.hashCode());
  });
});
