import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';

import DriveSemaphore from '../../src/async/driveSemaphore.js';
import MappableSemaphore from '../../src/async/mappableSemaphore.js';
import Logger from '../../src/console/logger.js';
import { LogLevel } from '../../src/console/logLevel.js';
import Temp from '../../src/globals/temp.js';
import CandidateGenerator from '../../src/modules/candidates/candidateGenerator.js';
import MovedROMDeleter from '../../src/modules/movedRomDeleter.js';
import ROMIndexer from '../../src/modules/roms/romIndexer.js';
import ROMScanner from '../../src/modules/roms/romScanner.js';
import FsPoly from '../../src/polyfill/fsPoly.js';
import Game from '../../src/types/dats/game.js';
import Header from '../../src/types/dats/logiqx/header.js';
import LogiqxDAT from '../../src/types/dats/logiqx/logiqxDat.js';
import ROM from '../../src/types/dats/rom.js';
import Zip from '../../src/types/files/archives/zip.js';
import type File from '../../src/types/files/file.js';
import FileCache from '../../src/types/files/fileCache.js';
import FileFactory from '../../src/types/files/fileFactory.js';
import Options from '../../src/types/options.js';
import ProgressBarFake from '../console/progressBarFake.js';

it('should do nothing if no ROMs moved', async () => {
  const romFiles = await new ROMScanner(
    new Options({
      input: ['./test/fixtures/roms'],
    }),
    new ProgressBarFake(),
    new FileFactory(new FileCache(), new Logger(LogLevel.NEVER, new PassThrough())),
    new DriveSemaphore(os.cpus().length),
  ).scan();
  expect(romFiles.length).toBeGreaterThan(0);

  await new MovedROMDeleter(new Options({ commands: ['copy'] }), new ProgressBarFake()).delete(
    romFiles,
    [],
    new Map(),
  );

  const exists = await Promise.all(
    romFiles.map(async (romFile) => FsPoly.exists(romFile.getFilePath())),
  );
  expect(exists).not.toContain(false);
});

it('should delete raw files', () => {
  // TODO(cemmer)
});

describe('should delete archives', () => {
  describe.each([undefined, 'zip'])('command: %s', (command) => {
    test.each(
      (
        [
          // Game with duplicate ROMs
          [
            [
              new Game({
                name: 'Euro Demo 42 (Europe)',
                roms: [
                  new ROM({ name: 'Euro Demo 42 (Europe).cue', size: 1374, crc32: '96b2b896' }),
                  new ROM({
                    name: 'Euro Demo 42 (Europe) (Track 01).bin',
                    size: 326_168_304,
                    crc32: '738a3744',
                  }),
                  new ROM({
                    name: 'Euro Demo 42 (Europe) (Track 02).bin',
                    size: 12_199_824,
                    crc32: '1b77f37f',
                  }),
                  new ROM({
                    name: 'Euro Demo 42 (Europe) (Track 03).bin',
                    size: 1_147_776,
                    crc32: 'c39c78b2',
                  }),
                  new ROM({
                    name: 'Euro Demo 42 (Europe) (Track 04).bin',
                    size: 1_147_776,
                    crc32: 'c39c78b2',
                  }),
                  new ROM({
                    name: 'Euro Demo 42 (Europe) (Track 05).bin',
                    size: 10_746_288,
                    crc32: '30a1b973',
                  }),
                  new ROM({
                    name: 'Euro Demo 42 (Europe) (Track 06).bin',
                    size: 1_147_776,
                    crc32: 'c39c78b2',
                  }),
                  new ROM({
                    name: 'Euro Demo 42 (Europe) (Track 07).bin',
                    size: 1_147_776,
                    crc32: 'c39c78b2',
                  }),
                  new ROM({
                    name: 'Euro Demo 42 (Europe) (Track 08).bin',
                    size: 37_260_384,
                    crc32: '0c2c3820',
                  }),
                  new ROM({
                    name: 'Euro Demo 42 (Europe) (Track 09).bin',
                    size: 32_182_416,
                    crc32: '80784294',
                  }),
                  new ROM({
                    name: 'Euro Demo 42 (Europe) (Track 10).bin',
                    size: 26_619_936,
                    crc32: '227a67cf',
                  }),
                  new ROM({
                    name: 'Euro Demo 42 (Europe) (Track 11).bin',
                    size: 19_189_968,
                    crc32: '2ed908e7',
                  }),
                  new ROM({
                    name: 'Euro Demo 42 (Europe) (Track 12).bin',
                    size: 32_356_464,
                    crc32: 'f6f33c3b',
                  }),
                ],
              }),
            ],
            ['Euro Demo 42 (Europe).zip'],
          ],
          // Multiple games with shared ROMs
          [
            [
              new Game({
                name: 'Zero 4 Champ II (Japan)',
                roms: [
                  new ROM({ name: 'Zero 4 Champ II (Japan).cue', size: 4187, crc32: 'a8c5c66e' }),
                  new ROM({
                    name: 'Zero 4 Champ II (Japan) (Track 01).bin',
                    size: 7_916_832,
                    crc32: '22144d0f',
                  }),
                  new ROM({
                    name: 'Zero 4 Champ II (Japan) (Track 02).bin',
                    size: 25_542_720,
                    crc32: 'a3ecc4eb',
                  }),
                  new ROM({
                    name: 'Zero 4 Champ II (Japan) (Track 03).bin',
                    size: 13_041_840,
                    crc32: '5f4717be',
                  }),
                  new ROM({
                    name: 'Zero 4 Champ II (Japan) (Track 04).bin',
                    size: 11_741_184,
                    crc32: 'a929f0e1',
                  }),
                  new ROM({
                    name: 'Zero 4 Champ II (Japan) (Track 05).bin',
                    size: 11_475_408,
                    crc32: '8ce00863',
                  }),
                  new ROM({
                    name: 'Zero 4 Champ II (Japan) (Track 06).bin',
                    size: 10_151_232,
                    crc32: '1b052c36',
                  }),
                  new ROM({
                    name: 'Zero 4 Champ II (Japan) (Track 07).bin',
                    size: 13_135_920,
                    crc32: '54d7853c',
                  }),
                  new ROM({
                    name: 'Zero 4 Champ II (Japan) (Track 08).bin',
                    size: 24_213_840,
                    crc32: 'aad2c61a',
                  }),
                  new ROM({
                    name: 'Zero 4 Champ II (Japan) (Track 09).bin',
                    size: 11_799_984,
                    crc32: '10f0d49b',
                  }),
                  new ROM({
                    name: 'Zero 4 Champ II (Japan) (Track 10).bin',
                    size: 16_334_640,
                    crc32: '9eb8f90f',
                  }),
                  new ROM({
                    name: 'Zero 4 Champ II (Japan) (Track 11).bin',
                    size: 11_338_992,
                    crc32: 'fa3d048a',
                  }),
                  new ROM({
                    name: 'Zero 4 Champ II (Japan) (Track 12).bin',
                    size: 12_084_576,
                    crc32: '33167322',
                  }),
                  new ROM({
                    name: 'Zero 4 Champ II (Japan) (Track 13).bin',
                    size: 10_513_440,
                    crc32: '09fb1bd2',
                  }),
                  new ROM({
                    name: 'Zero 4 Champ II (Japan) (Track 14).bin',
                    size: 16_325_232,
                    crc32: '7404385c',
                  }),
                  new ROM({
                    name: 'Zero 4 Champ II (Japan) (Track 15).bin',
                    size: 15_266_832,
                    crc32: '7f2b9388',
                  }),
                  new ROM({
                    name: 'Zero 4 Champ II (Japan) (Track 16).bin',
                    size: 11_153_184,
                    crc32: '0c360c9b',
                  }),
                  new ROM({
                    name: 'Zero 4 Champ II (Japan) (Track 17).bin',
                    size: 11_148_480,
                    crc32: '2f712235',
                  }),
                  new ROM({
                    name: 'Zero 4 Champ II (Japan) (Track 18).bin',
                    size: 11_357_808,
                    crc32: '8a7b39b2',
                  }),
                  new ROM({
                    name: 'Zero 4 Champ II (Japan) (Track 19).bin',
                    size: 7_067_760,
                    crc32: '616c4702',
                  }),
                  new ROM({
                    name: 'Zero 4 Champ II (Japan) (Track 20).bin',
                    size: 13_279_392,
                    crc32: '27706096',
                  }),
                  new ROM({
                    name: 'Zero 4 Champ II (Japan) (Track 21).bin',
                    size: 7_923_888,
                    crc32: 'fecb096f',
                  }),
                  new ROM({
                    name: 'Zero 4 Champ II (Japan) (Track 22).bin',
                    size: 14_888_160,
                    crc32: '9528018f',
                  }),
                  new ROM({
                    name: 'Zero 4 Champ II (Japan) (Track 23).bin',
                    size: 6_385_680,
                    crc32: '26c2432a',
                  }),
                  new ROM({
                    name: 'Zero 4 Champ II (Japan) (Track 24).bin',
                    size: 16_367_568,
                    crc32: 'ce330910',
                  }),
                  new ROM({
                    name: 'Zero 4 Champ II (Japan) (Track 25).bin',
                    size: 846_720,
                    crc32: '11bf5dbd',
                  }),
                  new ROM({
                    name: 'Zero 4 Champ II (Japan) (Track 26).bin',
                    size: 3_281_040,
                    crc32: 'f9188f3a',
                  }),
                  new ROM({
                    name: 'Zero 4 Champ II (Japan) (Track 27).bin',
                    size: 846_720,
                    crc32: '11bf5dbd',
                  }),
                  new ROM({
                    name: 'Zero 4 Champ II (Japan) (Track 28).bin',
                    size: 4_887_456,
                    crc32: '8d2dbe56',
                  }),
                  new ROM({
                    name: 'Zero 4 Champ II (Japan) (Track 29).bin',
                    size: 12_945_408,
                    crc32: '8d234a26',
                  }),
                  new ROM({
                    name: 'Zero 4 Champ II (Japan) (Track 30).bin',
                    size: 17_611_776,
                    crc32: '92ee3fb4',
                  }),
                  new ROM({
                    name: 'Zero 4 Champ II (Japan) (Track 31).bin',
                    size: 21_073_920,
                    crc32: '7b03db99',
                  }),
                  new ROM({
                    name: 'Zero 4 Champ II (Japan) (Track 32).bin',
                    size: 14_556_528,
                    crc32: '1f3057c2',
                  }),
                  new ROM({
                    name: 'Zero 4 Champ II (Japan) (Track 33).bin',
                    size: 10_520_496,
                    crc32: '887d8c2a',
                  }),
                  new ROM({
                    name: 'Zero 4 Champ II (Japan) (Track 34).bin',
                    size: 11_219_040,
                    crc32: '05d3e3a4',
                  }),
                  new ROM({
                    name: 'Zero 4 Champ II (Japan) (Track 35).bin',
                    size: 12_411_504,
                    crc32: 'b4cabb3b',
                  }),
                  new ROM({
                    name: 'Zero 4 Champ II (Japan) (Track 36).bin',
                    size: 15_285_648,
                    crc32: '8f997117',
                  }),
                  new ROM({
                    name: 'Zero 4 Champ II (Japan) (Track 37).bin',
                    size: 11_284_896,
                    crc32: '798a830f',
                  }),
                  new ROM({
                    name: 'Zero 4 Champ II (Japan) (Track 38).bin',
                    size: 24_498_432,
                    crc32: 'ac1cbe07',
                  }),
                  new ROM({
                    name: 'Zero 4 Champ II (Japan) (Track 39).bin',
                    size: 19_533_360,
                    crc32: '36df83e6',
                  }),
                  new ROM({
                    name: 'Zero 4 Champ II (Japan) (Track 40).bin',
                    size: 21_897_120,
                    crc32: '137e2970',
                  }),
                  new ROM({
                    name: 'Zero 4 Champ II (Japan) (Track 41).bin',
                    size: 2_629_536,
                    crc32: 'd02a90b7',
                  }),
                  new ROM({
                    name: 'Zero 4 Champ II (Japan) (Track 42).bin',
                    size: 14_224_896,
                    crc32: 'aa345590',
                  }),
                  new ROM({
                    name: 'Zero 4 Champ II (Japan) (Track 43).bin',
                    size: 25_192_272,
                    crc32: '661f8f8e',
                  }),
                ],
              }),
              new Game({
                name: 'Adventure Quiz - Capcom World + Hatena no Daibouken (Japan)',
                roms: [
                  new ROM({
                    name: 'Adventure Quiz - Capcom World + Hatena no Daibouken (Japan).cue',
                    size: 984,
                    crc32: '54a01e7d',
                  }),
                  new ROM({
                    name: 'Adventure Quiz - Capcom World + Hatena no Daibouken (Japan) (Track 1).bin',
                    size: 7_916_832,
                    crc32: '22144d0f',
                  }),
                  new ROM({
                    name: 'Adventure Quiz - Capcom World + Hatena no Daibouken (Japan) (Track 2).bin',
                    size: 10_536_960,
                    crc32: '59cc5f3f',
                  }),
                  new ROM({
                    name: 'Adventure Quiz - Capcom World + Hatena no Daibouken (Japan) (Track 3).bin',
                    size: 7_785_120,
                    crc32: '877dde76',
                  }),
                  new ROM({
                    name: 'Adventure Quiz - Capcom World + Hatena no Daibouken (Japan) (Track 4).bin',
                    size: 18_992_400,
                    crc32: '3236adb9',
                  }),
                  new ROM({
                    name: 'Adventure Quiz - Capcom World + Hatena no Daibouken (Japan) (Track 5).bin',
                    size: 9_252_768,
                    crc32: '341cc45f',
                  }),
                  new ROM({
                    name: 'Adventure Quiz - Capcom World + Hatena no Daibouken (Japan) (Track 6).bin',
                    size: 27_854_736,
                    crc32: 'e3646dc1',
                  }),
                  new ROM({
                    name: 'Adventure Quiz - Capcom World + Hatena no Daibouken (Japan) (Track 7).bin',
                    size: 5_216_736,
                    crc32: 'e3792471',
                  }),
                ],
              }),
            ],
            [
              'Adventure Quiz - Capcom World + Hatena no Daibouken (Japan).zip',
              'Zero 4 Champ II (Japan).zip',
            ],
          ],
        ] satisfies [Game[], string[]][]
      ).map(([games, expectedDeletedFilePaths]) => [
        games.at(0)?.getName(),
        games,
        expectedDeletedFilePaths,
      ]),
    )('%s', async (_, games, expectedDeletedFilePaths) => {
      const inputPath = await FsPoly.mkdtemp(path.join(Temp.getTempDir(), 'input'));
      try {
        const options = new Options({
          commands: ['move', ...(command ? [command] : [])],
          input: [inputPath],
          output: 'output',
        });

        const dat = new LogiqxDAT({ header: new Header(), games });

        const rawRomFiles = (
          await Promise.all(
            dat.getGames().map(async (game): Promise<File[]> => {
              const zipPath = path.join(inputPath, `${game.getName()}.zip`);
              await FsPoly.touch(zipPath);
              const zip = new Zip(zipPath);
              return Promise.all(game.getRoms().map(async (rom) => rom.toArchiveEntry(zip)));
            }),
          )
        ).flat();

        const indexedRomFiles = new ROMIndexer(options, new ProgressBarFake()).index(rawRomFiles);
        const candidates = await new CandidateGenerator(
          options,
          new ProgressBarFake(),
          new MappableSemaphore(os.cpus().length),
        ).generate(dat, indexedRomFiles);

        const inputRoms = rawRomFiles;
        const movedRoms = candidates
          .flatMap((candidate) => candidate.getRomsWithFiles())
          .map((romWithFiles) => romWithFiles.getInputFile());

        const writtenRoms = candidates
          .flatMap((releaseCanddiate) => releaseCanddiate.getRomsWithFiles())
          .map((romWithFiles) => romWithFiles.getOutputFile());
        const datsToWrittenRoms = new Map([[dat, writtenRoms]]);

        const deletedFilePaths = (
          await new MovedROMDeleter(options, new ProgressBarFake()).delete(
            inputRoms,
            movedRoms,
            datsToWrittenRoms,
          )
        )
          .map((filePath) => filePath.replace(inputPath + path.sep, ''))
          .sort();

        expect(deletedFilePaths).toEqual(expectedDeletedFilePaths);
      } finally {
        await FsPoly.rm(inputPath, { recursive: true });
      }
    });
  });
});

it("should not delete files that weren't moved", () => {
  // TODO(cemmer)
});
