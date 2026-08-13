import type DAT from '../../src/models/dats/dat.js';
import Game from '../../src/models/dats/game.js';
import Header from '../../src/models/dats/logiqx/header.js';
import LogiqxDAT from '../../src/models/dats/logiqx/logiqxDat.js';
import Release from '../../src/models/dats/release.js';
import ROM from '../../src/models/dats/rom.js';
import DATStatus from '../../src/models/datStatus.js';
import File from '../../src/models/files/file.js';
import Options from '../../src/models/options.js';
import ROMWithFiles from '../../src/models/romWithFiles.js';
import WriteCandidate from '../../src/models/writeCandidate.js';

// NOTE(cemmer): the majority of tests would expect to be here are covered in
//  statusGenerator.test.ts instead in order to increase coverage

function givenDAT(): DAT {
  return new LogiqxDAT({
    header: new Header({
      name: 'dat name',
    }),
    games: [
      new Game({
        name: 'game with multiple ROMs and no releases',
        roms: [
          new ROM({ name: 'one.rom', size: 0, crc32: '00000001' }),
          new ROM({ name: 'two.rom', size: 0, crc32: '00000002' }),
        ],
      }),
      new Game({
        name: 'bios with one ROM and one release',
        isBios: 'yes',
        release: [new Release('USA', 'USA', 'EN')],
        roms: new ROM({ name: 'three.rom', size: 0, crc32: '00000003' }),
      }),
      new Game({
        name: 'game with one ROM and multiple releases',
        release: [
          new Release('USA', 'USA', 'EN'),
          new Release('EUR', 'EUR', 'EN'),
          new Release('JPN', 'JPN', 'JA'),
        ],
        roms: new ROM({ name: 'four.rom', size: 0, crc32: '00000004' }),
      }),
    ],
  });
}

it('getDATName', () => {
  const dat = givenDAT();
  const datStatus = new DATStatus(new Options(), dat, []);
  expect(datStatus.getDATName()).toEqual('dat name');
});

/**
 * Build a {@link WriteCandidate} for one of {@link givenDAT}'s games, with a distinct input and
 * output {@link File} for every one of its ROMs.
 */
async function givenCandidate(dat: DAT, gameName: string): Promise<WriteCandidate> {
  const game = dat.getGames().find((searchedGame) => searchedGame.getName() === gameName) as Game;
  return new WriteCandidate(
    game,
    await Promise.all(
      game.getRoms().map(async (rom) => {
        const inputFile = await File.fileOf({
          filePath: `input/${rom.getName()}`,
          size: rom.getSize(),
          crc32: rom.getCrc32(),
        });
        const outputFile = await File.fileOf({
          filePath: `output/${rom.getName()}`,
          size: rom.getSize(),
          crc32: rom.getCrc32(),
        });
        return new ROMWithFiles(rom, inputFile, outputFile);
      }),
    ),
  );
}

describe('getInputFilePaths', () => {
  it('should return nothing without candidates', () => {
    const datStatus = new DATStatus(new Options(), givenDAT(), []);
    expect(datStatus.getInputFilePaths()).toEqual([]);
  });

  it('should return the input path of every matched ROM', async () => {
    const dat = givenDAT();
    const candidates = [
      await givenCandidate(dat, 'game with multiple ROMs and no releases'),
      await givenCandidate(dat, 'game with one ROM and multiple releases'),
    ];

    const datStatus = new DATStatus(new Options(), dat, candidates);

    expect(datStatus.getInputFilePaths().toSorted((a, b) => a.localeCompare(b))).toEqual(
      candidates
        .flatMap((candidate) =>
          candidate.getRomsWithFiles().map((rwf) => rwf.getInputFile().getFilePath()),
        )
        .toSorted((a, b) => a.localeCompare(b)),
    );
  });

  it('should not return the paths of unmatched games', async () => {
    const dat = givenDAT();
    const candidate = await givenCandidate(dat, 'bios with one ROM and one release');

    const datStatus = new DATStatus(new Options(), dat, [candidate]);

    expect(datStatus.getInputFilePaths()).toHaveLength(1);
    expect(datStatus.getInputFilePaths().at(0)).toContain('three.rom');
  });
});

describe('getInputFileHashCodes', () => {
  it('should return nothing without candidates', () => {
    const datStatus = new DATStatus(new Options(), givenDAT(), []);
    expect(datStatus.getInputFileHashCodes()).toEqual([]);
  });

  it('should return the hash code of every matched input file', async () => {
    const dat = givenDAT();
    const candidate = await givenCandidate(dat, 'game with multiple ROMs and no releases');

    const datStatus = new DATStatus(new Options(), dat, [candidate]);

    expect(datStatus.getInputFileHashCodes().toSorted((a, b) => a.localeCompare(b))).toEqual(
      candidate
        .getRomsWithFiles()
        .map((rwf) => rwf.getInputFile().hashCode())
        .toSorted((a, b) => a.localeCompare(b)),
    );
  });
});
