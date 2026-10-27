import type DAT from '../../../src/models/dats/dat.js';
import Game from '../../../src/models/dats/game.js';
import Header from '../../../src/models/dats/logiqx/header.js';
import LogiqxDAT from '../../../src/models/dats/logiqx/logiqxDat.js';
import ROM from '../../../src/models/dats/rom.js';
import File from '../../../src/models/files/file.js';
import Options from '../../../src/models/options.js';
import IPSPatch from '../../../src/models/patches/ipsPatch.js';
import ROMWithFiles from '../../../src/models/romWithFiles.js';
import WriteCandidate from '../../../src/models/writeCandidate.js';
import CandidateValidator from '../../../src/modules/candidates/candidateValidator.js';
import ProgressBarFake from '../../console/progressBarFake.js';

async function datToCandidates(dat: DAT): Promise<WriteCandidate[]> {
  return await Promise.all(
    dat.getGames().map(
      async (game) =>
        new WriteCandidate(
          new Game({ ...game }),
          await Promise.all(
            game.getRoms().map(async (rom) => {
              const dummyFile = await rom.toFile();
              return new ROMWithFiles(rom, dummyFile, dummyFile);
            }),
          ),
        ),
    ),
  );
}

it('should do nothing with no candidates', async () => {
  const dat = new LogiqxDAT({ header: new Header() });
  const candidates = await datToCandidates(dat);

  const invalidCandidates = new CandidateValidator(
    new Options({ commands: ['copy'] }),
    new ProgressBarFake(),
  ).validate(dat, candidates);

  expect(invalidCandidates).toHaveLength(0);
});

it('should return nothing if all candidates have unique paths', async () => {
  const dat = new LogiqxDAT({
    header: new Header(),
    games: [
      new Game({
        name: 'game with no ROMs',
      }),
      new Game({
        name: 'game with one ROM',
        roms: [new ROM({ name: 'one', size: 1 })],
      }),
      new Game({
        name: 'game with two ROMs',
        roms: [new ROM({ name: 'two', size: 2 }), new ROM({ name: 'three', size: 3 })],
      }),
    ],
  });
  const candidates = await datToCandidates(dat);

  const invalidCandidates = new CandidateValidator(
    new Options({ commands: ['copy'] }),
    new ProgressBarFake(),
  ).validate(dat, candidates);

  expect(invalidCandidates).toHaveLength(0);
});

it('should return something if some candidates have conflicting paths', async () => {
  const dat = new LogiqxDAT({
    header: new Header(),
    games: [
      new Game({
        name: 'game with no ROMs',
      }),
      new Game({
        name: 'game one',
        roms: [new ROM({ name: 'one', size: 1 })],
      }),
      new Game({
        name: 'game two',
        roms: [
          new ROM({ name: 'two', size: 2 }),
          new ROM({ name: 'three', size: 3, crc32: '33333333' }),
        ],
      }),
      new Game({
        name: 'game three',
        roms: [
          new ROM({ name: 'three', size: 3, crc32: '00000003' }),
          new ROM({ name: 'four', size: 4, crc32: '44444444' }),
        ],
      }),
      new Game({
        name: 'game four',
        roms: [
          new ROM({ name: 'four', size: 4, crc32: '00000004' }),
          new ROM({ name: 'five', size: 5 }),
        ],
      }),
    ],
  });
  const candidates = await datToCandidates(dat);

  const invalidCandidates = new CandidateValidator(
    new Options({ commands: ['copy'] }),
    new ProgressBarFake(),
  ).validate(dat, candidates);

  const invalidCandidateNames = invalidCandidates
    .map((candidate) => candidate.getName())
    .toSorted((a, b) => a.localeCompare(b));
  expect(invalidCandidateNames).toEqual(['game four', 'game three', 'game two']);
});

it('should return nothing if candidates write the same contents to the same paths', async () => {
  const dat = new LogiqxDAT({
    header: new Header(),
    games: [
      new Game({
        name: 'game one',
        roms: [new ROM({ name: 'shared', size: 1, crc32: '11111111' })],
      }),
      new Game({
        name: 'game two',
        roms: [new ROM({ name: 'shared', size: 1, crc32: '11111111' })],
      }),
    ],
  });
  const candidates = await datToCandidates(dat);

  const invalidCandidates = new CandidateValidator(
    new Options({ commands: ['copy'] }),
    new ProgressBarFake(),
  ).validate(dat, candidates);

  expect(invalidCandidates).toHaveLength(0);
});

it('should return nothing if different input files write the same contents to the same path', async () => {
  const rom = new ROM({ name: 'game.rom', size: 1, crc32: '11111111' });
  const outputFile = await File.fileOf({
    filePath: 'output/game.rom',
    size: 1,
    crc32: '11111111',
  });
  const candidates = [
    new WriteCandidate(new Game({ name: 'game one', roms: [rom] }), [
      new ROMWithFiles(
        rom,
        await File.fileOf({ filePath: 'input/one.rom', size: 1, crc32: '11111111' }),
        outputFile,
      ),
    ]),
    new WriteCandidate(new Game({ name: 'game two', roms: [rom] }), [
      new ROMWithFiles(
        rom,
        await File.fileOf({
          filePath: 'input/two.rom',
          size: 1,
          crc32: '11111111',
          symlinkSource: 'input/one.rom',
        }),
        outputFile,
      ),
    ]),
  ];
  const dat = new LogiqxDAT({
    header: new Header(),
    games: candidates.map((candidate) => candidate.getGame()),
  });

  const invalidCandidates = new CandidateValidator(
    new Options({ commands: ['copy'] }),
    new ProgressBarFake(),
  ).validate(dat, candidates);

  expect(invalidCandidates).toHaveLength(0);
});

it('should return something if patched and unpatched files write to the same path', async () => {
  const rom = new ROM({ name: 'game.rom', size: 1, crc32: '00000000' });
  const inputFile = await File.fileOf({ filePath: 'input/game.rom', size: 1, crc32: '00000000' });
  const patch = IPSPatch.patchFrom(await File.fileOf({ filePath: 'patch 00000000.ips' }));
  const candidates = [
    new WriteCandidate(new Game({ name: 'game (patched)', roms: [rom] }), [
      new ROMWithFiles(
        rom,
        inputFile.withPatch(patch),
        await File.fileOf({ filePath: 'output/game.rom', size: 1, crc32: '12345678' }),
      ),
    ]),
    new WriteCandidate(new Game({ name: 'game (unpatched)', roms: [rom] }), [
      new ROMWithFiles(
        rom,
        inputFile,
        await File.fileOf({ filePath: 'output/game.rom', size: 1, crc32: '00000000' }),
      ),
    ]),
  ];
  const dat = new LogiqxDAT({
    header: new Header(),
    games: candidates.map((candidate) => candidate.getGame()),
  });

  const invalidCandidates = new CandidateValidator(
    new Options({ commands: ['copy'] }),
    new ProgressBarFake(),
  ).validate(dat, candidates);

  expect(invalidCandidates).toEqual(candidates);
});
