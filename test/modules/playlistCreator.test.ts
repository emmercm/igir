import fs from 'node:fs';
import path from 'node:path';

import Temp from '../../src/globals/temp.js';
import DATDiscMerger from '../../src/modules/dats/datDiscMerger.js';
import PlaylistCreator from '../../src/modules/playlistCreator.js';
import FsPoly from '../../src/polyfill/fsPoly.js';
import DAT from '../../src/types/dats/dat.js';
import Game from '../../src/types/dats/game.js';
import Header from '../../src/types/dats/logiqx/header.js';
import LogiqxDAT from '../../src/types/dats/logiqx/logiqxDat.js';
import ROM from '../../src/types/dats/rom.js';
import Options from '../../src/types/options.js';
import ROMWithFiles from '../../src/types/romWithFiles.js';
import WriteCandidate from '../../src/types/writeCandidate.js';
import ProgressBarFake from '../console/progressBarFake.js';

const games: Game[] = [
  // Redump - single disc cue/bin
  new Game({
    name: 'Steel Reign (USA)',
    rom: [
      new ROM({ name: 'Steel Reign (USA).cue', size: 981, crc32: '3c9c6740' }),
      new ROM({ name: 'Steel Reign (USA) (Track 1).bin', size: 322_496_832, crc32: '6e335bb0' }),
      new ROM({ name: 'Steel Reign (USA) (Track 2).bin', size: 65_206_848, crc32: '0c8df541' }),
      new ROM({ name: 'Steel Reign (USA) (Track 3).bin', size: 36_129_072, crc32: 'd3728153' }),
      new ROM({ name: 'Steel Reign (USA) (Track 4).bin', size: 65_098_656, crc32: 'f3fa1ee4' }),
      new ROM({ name: 'Steel Reign (USA) (Track 5).bin', size: 44_481_024, crc32: 'ae14527e' }),
      new ROM({ name: 'Steel Reign (USA) (Track 6).bin', size: 36_129_072, crc32: 'd3728153' }),
      new ROM({ name: 'Steel Reign (USA) (Track 7).bin', size: 61_650_624, crc32: '8dab3af5' }),
      new ROM({ name: 'Steel Reign (USA) (Track 8).bin', size: 35_491_680, crc32: '3bd15aa9' }),
      new ROM({ name: 'Steel Reign (USA) (Track 9).bin', size: 30_020_928, crc32: 'eeca7136' }),
    ],
  }),
  // Redump - multi-disc cue/bin
  new Game({
    name: 'Final Fantasy VII (USA) (Disc 1)',
    rom: [
      new ROM({ name: 'Final Fantasy VII (USA) (Disc 1).cue', size: 98, crc32: '07a7324d' }),
      new ROM({
        name: 'Final Fantasy VII (USA) (Disc 1).bin',
        size: 747_435_024,
        crc32: '1459cbef',
      }),
    ],
  }),
  new Game({
    name: 'Final Fantasy VII (USA) (Disc 2)',
    rom: [
      new ROM({ name: 'Final Fantasy VII (USA) (Disc 2).cue', size: 98, crc32: '06fa149c' }),
      new ROM({
        name: 'Final Fantasy VII (USA) (Disc 2).bin',
        size: 732_657_408,
        crc32: 'a997a8cc',
      }),
    ],
  }),
  new Game({
    name: 'Final Fantasy VII (USA) (Disc 3)',
    rom: [
      new ROM({ name: 'Final Fantasy VII (USA) (Disc 3).cue', size: 98, crc32: 'b0e1f4ec' }),
      new ROM({
        name: 'Final Fantasy VII (USA) (Disc 3).bin',
        size: 659_561_952,
        crc32: '1c27b277',
      }),
    ],
  }),
  // Redump - multi-disc cue/bin (out of order)
  new Game({
    name: 'Panzer Dragoon Saga (USA) (Disc 2)',
    rom: [
      new ROM({ name: 'Panzer Dragoon Saga (USA) (Disc 2).cue', size: 366, crc32: '6c63097d' }),
      new ROM({
        name: 'Panzer Dragoon Saga (USA) (Disc 2) (Track 1).bin',
        size: 559_354_992,
        crc32: '4b175909',
      }),
      new ROM({
        name: 'Panzer Dragoon Saga (USA) (Disc 2) (Track 2).bin',
        size: 2_359_056,
        crc32: '6747ba1d',
      }),
      new ROM({
        name: 'Panzer Dragoon Saga (USA) (Disc 2) (Track 3).bin',
        size: 16_518_096,
        crc32: 'd0e2b605',
      }),
    ],
  }),
  new Game({
    name: 'Panzer Dragoon Saga (USA) (Disc 4)',
    rom: [
      new ROM({ name: 'Panzer Dragoon Saga (USA) (Disc 4).cue', size: 494, crc32: 'fb78c667' }),
      new ROM({
        name: 'Panzer Dragoon Saga (USA) (Disc 4) (Track 1).bin',
        size: 582_660_960,
        crc32: '266bf5ae',
      }),
      new ROM({
        name: 'Panzer Dragoon Saga (USA) (Disc 4) (Track 2).bin',
        size: 1_909_824,
        crc32: 'd5098cd0',
      }),
      new ROM({
        name: 'Panzer Dragoon Saga (USA) (Disc 4) (Track 3).bin',
        size: 16_518_096,
        crc32: '070b2227',
      }),
      new ROM({
        name: 'Panzer Dragoon Saga (USA) (Disc 4) (Track 4).bin',
        size: 45_029_040,
        crc32: 'c3ad089a',
      }),
    ],
  }),
  new Game({
    name: 'Panzer Dragoon Saga (USA) (Disc 1)',
    rom: [
      new ROM({ name: 'Panzer Dragoon Saga (USA) (Disc 1).cue', size: 366, crc32: 'd60ab132' }),
      new ROM({
        name: 'Panzer Dragoon Saga (USA) (Disc 1) (Track 1).bin',
        size: 645_501_696,
        crc32: '37481032',
      }),
      new ROM({
        name: 'Panzer Dragoon Saga (USA) (Disc 1) (Track 2).bin',
        size: 1_851_024,
        crc32: '222fb0e1',
      }),
      new ROM({
        name: 'Panzer Dragoon Saga (USA) (Disc 1) (Track 3).bin',
        size: 16_518_096,
        crc32: '8b07281c',
      }),
    ],
  }),
  new Game({
    name: 'Panzer Dragoon Saga (USA) (Disc 3)',
    rom: [
      new ROM({ name: 'Panzer Dragoon Saga (USA) (Disc 3).cue', size: 366, crc32: '05bb9eb8' }),
      new ROM({
        name: 'Panzer Dragoon Saga (USA) (Disc 3) (Track 1).bin',
        size: 632_248_176,
        crc32: '3d113c52',
      }),
      new ROM({
        name: 'Panzer Dragoon Saga (USA) (Disc 3) (Track 2).bin',
        size: 3_485_664,
        crc32: '83d7aba0',
      }),
      new ROM({
        name: 'Panzer Dragoon Saga (USA) (Disc 3) (Track 3).bin',
        size: 16_518_096,
        crc32: '970d3e99',
      }),
    ],
  }),
  // TOSEC - single disc gdi/bin/raw
  new Game({
    name: 'Phantasy Star Online v2.011 (2001)(Sega)(US)(M5)[!][3S][req. serial]',
    rom: [
      new ROM({
        name: 'Phantasy Star Online v2.011 (2001)(Sega)(US)(M5)[!][3S][req. serial].gdi',
        size: 89,
        crc32: 'd503d605',
      }),
      new ROM({ name: 'track01.bin', size: 25_770_864, crc32: 'eecf455e' }),
      new ROM({ name: 'track02.raw', size: 1_237_152, crc32: '81f661ae' }),
      new ROM({ name: 'track03.bin', size: 1_185_760_800, crc32: '6f65a922' }),
    ],
  }),
  // TOSEC - multi-disc gdi/bin/raw
  new Game({
    name: 'Resident Evil - Code Veronica v1.000 (2000)(Capcom)(US)(Disc 1 of 2)[!]',
    rom: [
      new ROM({
        name: 'Resident Evil - Code Veronica v1.000 (2000)(Capcom)(US)(Disc 1 of 2)[!].gdi',
        size: 87,
        crc32: 'd7ab4c6b',
      }),
      new ROM({ name: 'track01.bin', size: 705_600, crc32: 'fdf2bf73' }),
      new ROM({ name: 'track02.raw', size: 1_237_152, crc32: '48fff429' }),
      new ROM({ name: 'track03.bin', size: 1_185_760_800, crc32: '0843c0d9' }),
    ],
  }),
  new Game({
    name: 'Resident Evil - Code Veronica v1.000 (2000)(Capcom)(US)(Disc 2 of 2)[!]',
    rom: [
      new ROM({
        name: 'Resident Evil - Code Veronica v1.000 (2000)(Capcom)(US)(Disc 2 of 2)[!].gdi',
        size: 87,
        crc32: 'd7ab4c6b',
      }),
      new ROM({ name: 'track01.bin', size: 705_600, crc32: 'ac480b86' }),
      new ROM({ name: 'track02.raw', size: 1_237_152, crc32: '48fff429' }),
      new ROM({ name: 'track03.bin', size: 1_185_760_800, crc32: 'fa0d176e' }),
    ],
  }),
  // TOSEC - multi-disc gdi/bin/raw
  new Game({
    name: 'Skies of Arcadia v1.002 (2000)(Sega)(US)(Disc 1 of 2)[!]',
    rom: [
      new ROM({
        name: 'Skies of Arcadia v1.002 (2000)(Sega)(US)(Disc 1 of 2)[!].gdi',
        size: 87,
        crc32: 'b220115c',
      }),
      new ROM({ name: 'track01.bin', size: 1_470_000, crc32: '7f9465bc' }),
      new ROM({ name: 'track02.raw', size: 3_455_088, crc32: 'bd729ea9' }),
      new ROM({ name: 'track03.bin', size: 1_185_760_800, crc32: '2a1be648' }),
    ],
  }),
  new Game({
    name: 'Skies of Arcadia v1.002 (2000)(Sega)(US)(Disc 2 of 2)[!]',
    rom: [
      new ROM({
        name: 'Skies of Arcadia v1.002 (2000)(Sega)(US)(Disc 2 of 2)[!].gdi',
        size: 87,
        crc32: 'b220115c',
      }),
      new ROM({ name: 'track01.bin', size: 1_470_000, crc32: '14966244' }),
      new ROM({ name: 'track02.raw', size: 3_455_088, crc32: 'd45d6daf' }),
      new ROM({ name: 'track03.bin', size: 1_185_760_800, crc32: '722eae65' }),
    ],
  }),
];

const dat = new LogiqxDAT(new Header(), games);

async function datToCandidates(dat: DAT): Promise<WriteCandidate[]> {
  return Promise.all(
    dat.getGames().map(async (game) => {
      return new WriteCandidate(
        game,
        await Promise.all(
          game.getRoms().map(async (rom) => {
            const file = await rom.toFile();
            const inputFile = file.withFilePath(
              path.join(
                // Distinguish input and output directories
                'input',
                // Emulate: --dir-letter --dir-game-subdir always
                game.getName().slice(0, 1),
                game.getName(),
                rom.getName(),
              ),
            );
            const outputFile = file.withFilePath(
              path.join(
                // Distinguish input and output directories
                'output',
                // Emulate: --dir-game-subdir always
                game.getName(),
                rom.getName(),
              ),
            );
            return new ROMWithFiles(rom, inputFile, outputFile);
          }),
        ),
      );
    }),
  );
}

async function playlistCreator(
  options: Options,
  dat: DAT,
  candidates: WriteCandidate[],
): Promise<[string, string[]][]> {
  const writtenFiles = await new PlaylistCreator(options, new ProgressBarFake()).create(
    dat,
    candidates,
  );

  return Promise.all(
    writtenFiles.sort().map(async (filePath) => {
      const contents = (await fs.promises.readFile(filePath)).toString().trim().split('\n');
      await FsPoly.rm(filePath, { force: true });
      return [filePath.replace(Temp.getTempDir() + path.sep, ''), contents] satisfies [
        string,
        string[],
      ];
    }),
  );
}

it('should do nothing if command not specified', async () => {
  const options = new Options({
    mergeDiscs: true,
    playlistExtensions: ['.cue', '.gdi', '.mdf', '.chd'],
  });
  const candidates = await datToCandidates(dat);

  const mergedDat = new DATDiscMerger(options, new ProgressBarFake()).merge(dat);

  const results = await playlistCreator(options, mergedDat, candidates);
  expect(results).toEqual([]);
});

it('should do nothing if no playlist extensions specified', async () => {
  const options = new Options({
    commands: ['playlist'],
    mergeDiscs: true,
  });
  const candidates = await datToCandidates(dat);

  const mergedDat = new DATDiscMerger(options, new ProgressBarFake()).merge(dat);

  const results = await playlistCreator(options, mergedDat, candidates);
  expect(results).toEqual([]);
});

describe('when not writing', () => {
  test.each([[true], [false]])(
    'should create playlists for multi-disc games when merged: %s',
    async (mergeDiscs) => {
      const options = new Options({
        commands: ['playlist'],
        mergeDiscs,
        playlistExtensions: ['.cue', '.gdi', '.mdf', '.chd'],
      });
      const candidates = await datToCandidates(dat);

      // Merging shouldn't change the output because we're writing to the input directory
      const maybeMergedDat = new DATDiscMerger(options, new ProgressBarFake()).merge(dat);

      const results = await playlistCreator(options, maybeMergedDat, candidates);
      expect(results).toEqual([
        [
          path.join('input', 'F', 'Final Fantasy VII (USA).m3u'),
          [
            'Final Fantasy VII (USA) (Disc 1)/Final Fantasy VII (USA) (Disc 1).cue',
            'Final Fantasy VII (USA) (Disc 2)/Final Fantasy VII (USA) (Disc 2).cue',
            'Final Fantasy VII (USA) (Disc 3)/Final Fantasy VII (USA) (Disc 3).cue',
          ],
        ],
        [
          path.join('input', 'P', 'Panzer Dragoon Saga (USA).m3u'),
          [
            'Panzer Dragoon Saga (USA) (Disc 1)/Panzer Dragoon Saga (USA) (Disc 1).cue',
            'Panzer Dragoon Saga (USA) (Disc 2)/Panzer Dragoon Saga (USA) (Disc 2).cue',
            'Panzer Dragoon Saga (USA) (Disc 3)/Panzer Dragoon Saga (USA) (Disc 3).cue',
            'Panzer Dragoon Saga (USA) (Disc 4)/Panzer Dragoon Saga (USA) (Disc 4).cue',
          ],
        ],
        [
          path.join('input', 'R', 'Resident Evil - Code Veronica v1.000 (2000)(Capcom)(US)[!].m3u'),
          [
            'Resident Evil - Code Veronica v1.000 (2000)(Capcom)(US)(Disc 1 of 2)[!]/Resident Evil - Code Veronica v1.000 (2000)(Capcom)(US)(Disc 1 of 2)[!].gdi',
            'Resident Evil - Code Veronica v1.000 (2000)(Capcom)(US)(Disc 2 of 2)[!]/Resident Evil - Code Veronica v1.000 (2000)(Capcom)(US)(Disc 2 of 2)[!].gdi',
          ],
        ],
        [
          path.join('input', 'S', 'Skies of Arcadia v1.002 (2000)(Sega)(US)[!].m3u'),
          [
            'Skies of Arcadia v1.002 (2000)(Sega)(US)(Disc 1 of 2)[!]/Skies of Arcadia v1.002 (2000)(Sega)(US)(Disc 1 of 2)[!].gdi',
            'Skies of Arcadia v1.002 (2000)(Sega)(US)(Disc 2 of 2)[!]/Skies of Arcadia v1.002 (2000)(Sega)(US)(Disc 2 of 2)[!].gdi',
          ],
        ],
      ]);
    },
  );
});

describe.each([['copy'], ['move'], ['link']])('when writing: %s', (command) => {
  it('should create playlists for multi-disc games when discs merged', async () => {
    const options = new Options({
      commands: [command, 'playlist'],
      output: Temp.getTempDir(),
      mergeDiscs: true,
      playlistExtensions: ['.cue', '.gdi', '.mdf', '.chd'],
    });

    const maybeMergedDat = new DATDiscMerger(options, new ProgressBarFake()).merge(dat);
    const candidates = await datToCandidates(maybeMergedDat);

    const results = await playlistCreator(options, maybeMergedDat, candidates);
    expect(results).toEqual([
      [
        path.join('output', 'Final Fantasy VII (USA)', 'Final Fantasy VII (USA).m3u'),
        [
          'Final Fantasy VII (USA) (Disc 1).cue',
          'Final Fantasy VII (USA) (Disc 2).cue',
          'Final Fantasy VII (USA) (Disc 3).cue',
        ],
      ],
      [
        path.join('output', 'Panzer Dragoon Saga (USA)', 'Panzer Dragoon Saga (USA).m3u'),
        [
          'Panzer Dragoon Saga (USA) (Disc 1).cue',
          'Panzer Dragoon Saga (USA) (Disc 2).cue',
          'Panzer Dragoon Saga (USA) (Disc 3).cue',
          'Panzer Dragoon Saga (USA) (Disc 4).cue',
        ],
      ],
      [
        path.join(
          'output',
          'Resident Evil - Code Veronica v1.000 (2000)(Capcom)(US)[!]',
          'Resident Evil - Code Veronica v1.000 (2000)(Capcom)(US)[!].m3u',
        ),
        [
          'Resident Evil - Code Veronica v1.000 (2000)(Capcom)(US)(Disc 1 of 2)[!]/Resident Evil - Code Veronica v1.000 (2000)(Capcom)(US)(Disc 1 of 2)[!].gdi',
          'Resident Evil - Code Veronica v1.000 (2000)(Capcom)(US)(Disc 2 of 2)[!]/Resident Evil - Code Veronica v1.000 (2000)(Capcom)(US)(Disc 2 of 2)[!].gdi',
        ],
      ],
      [
        path.join(
          'output',
          'Skies of Arcadia v1.002 (2000)(Sega)(US)[!]',
          'Skies of Arcadia v1.002 (2000)(Sega)(US)[!].m3u',
        ),
        [
          'Skies of Arcadia v1.002 (2000)(Sega)(US)(Disc 1 of 2)[!]/Skies of Arcadia v1.002 (2000)(Sega)(US)(Disc 1 of 2)[!].gdi',
          'Skies of Arcadia v1.002 (2000)(Sega)(US)(Disc 2 of 2)[!]/Skies of Arcadia v1.002 (2000)(Sega)(US)(Disc 2 of 2)[!].gdi',
        ],
      ],
    ]);
  });

  it('should create playlists for multi-disc games when discs not merged', async () => {
    const options = new Options({
      commands: [command, 'playlist'],
      output: Temp.getTempDir(),
      mergeDiscs: false,
      playlistExtensions: ['.cue', '.gdi', '.mdf', '.chd'],
    });

    const maybeMergedDat = new DATDiscMerger(options, new ProgressBarFake()).merge(dat);
    const candidates = await datToCandidates(maybeMergedDat);

    const results = await playlistCreator(options, maybeMergedDat, candidates);
    expect(results).toEqual([
      [
        path.join('output', 'Final Fantasy VII (USA).m3u'),
        [
          'Final Fantasy VII (USA) (Disc 1)/Final Fantasy VII (USA) (Disc 1).cue',
          'Final Fantasy VII (USA) (Disc 2)/Final Fantasy VII (USA) (Disc 2).cue',
          'Final Fantasy VII (USA) (Disc 3)/Final Fantasy VII (USA) (Disc 3).cue',
        ],
      ],
      [
        path.join('output', 'Panzer Dragoon Saga (USA).m3u'),
        [
          'Panzer Dragoon Saga (USA) (Disc 1)/Panzer Dragoon Saga (USA) (Disc 1).cue',
          'Panzer Dragoon Saga (USA) (Disc 2)/Panzer Dragoon Saga (USA) (Disc 2).cue',
          'Panzer Dragoon Saga (USA) (Disc 3)/Panzer Dragoon Saga (USA) (Disc 3).cue',
          'Panzer Dragoon Saga (USA) (Disc 4)/Panzer Dragoon Saga (USA) (Disc 4).cue',
        ],
      ],
      [
        path.join('output', 'Resident Evil - Code Veronica v1.000 (2000)(Capcom)(US)[!].m3u'),
        [
          'Resident Evil - Code Veronica v1.000 (2000)(Capcom)(US)(Disc 1 of 2)[!]/Resident Evil - Code Veronica v1.000 (2000)(Capcom)(US)(Disc 1 of 2)[!].gdi',
          'Resident Evil - Code Veronica v1.000 (2000)(Capcom)(US)(Disc 2 of 2)[!]/Resident Evil - Code Veronica v1.000 (2000)(Capcom)(US)(Disc 2 of 2)[!].gdi',
        ],
      ],
      [
        path.join('output', 'Skies of Arcadia v1.002 (2000)(Sega)(US)[!].m3u'),
        [
          'Skies of Arcadia v1.002 (2000)(Sega)(US)(Disc 1 of 2)[!]/Skies of Arcadia v1.002 (2000)(Sega)(US)(Disc 1 of 2)[!].gdi',
          'Skies of Arcadia v1.002 (2000)(Sega)(US)(Disc 2 of 2)[!]/Skies of Arcadia v1.002 (2000)(Sega)(US)(Disc 2 of 2)[!].gdi',
        ],
      ],
    ]);
  });
});
