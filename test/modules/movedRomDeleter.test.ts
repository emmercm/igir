import path from 'path';

import CandidateGenerator from '../../src/modules/candidateGenerator.js';
import FileIndexer from '../../src/modules/fileIndexer.js';
import MovedROMDeleter from '../../src/modules/movedRomDeleter.js';
import ROMScanner from '../../src/modules/romScanner.js';
import fsPoly from '../../src/polyfill/fsPoly.js';
import Game from '../../src/types/dats/game.js';
import Header from '../../src/types/dats/logiqx/header.js';
import LogiqxDAT from '../../src/types/dats/logiqx/logiqxDat.js';
import ROM from '../../src/types/dats/rom.js';
import Zip from '../../src/types/files/archives/zip.js';
import File from '../../src/types/files/file.js';
import Options from '../../src/types/options.js';
import ProgressBarFake from '../console/progressBarFake.js';

it('should do nothing if no ROMs moved', async () => {
  const romFiles = await new ROMScanner(new Options({
    input: ['./test/fixtures/roms'],
  }), new ProgressBarFake()).scan();
  expect(romFiles.length).toBeGreaterThan(0);

  await new MovedROMDeleter(new ProgressBarFake()).delete(romFiles, [], new Map());

  const exists = Promise.all(romFiles.map(async (romFile) => fsPoly.exists(romFile.getFilePath())));
  expect(exists).not.toContain(false);
});

it('should delete raw files', () => {
  // TODO(cemmer)
});

describe('should delete archives', () => {
  describe.each(['extract', 'zip'])('command: %s', (command) => {
    test.each(([
      // Game with duplicate ROMs
      [[
        new Game({
          name: 'Euro Demo 42 (Europe)',
          rom: [
            new ROM({ name: 'Euro Demo 42 (Europe).cue', size: 1374, crc: '96b2b896' }),
            new ROM({ name: 'Euro Demo 42 (Europe) (Track 01).bin', size: 326168304, crc: '738a3744' }),
            new ROM({ name: 'Euro Demo 42 (Europe) (Track 02).bin', size: 12199824, crc: '1b77f37f' }),
            new ROM({ name: 'Euro Demo 42 (Europe) (Track 03).bin', size: 1147776, crc: 'c39c78b2' }),
            new ROM({ name: 'Euro Demo 42 (Europe) (Track 04).bin', size: 1147776, crc: 'c39c78b2' }),
            new ROM({ name: 'Euro Demo 42 (Europe) (Track 05).bin', size: 10746288, crc: '30a1b973' }),
            new ROM({ name: 'Euro Demo 42 (Europe) (Track 06).bin', size: 1147776, crc: 'c39c78b2' }),
            new ROM({ name: 'Euro Demo 42 (Europe) (Track 07).bin', size: 1147776, crc: 'c39c78b2' }),
            new ROM({ name: 'Euro Demo 42 (Europe) (Track 08).bin', size: 37260384, crc: '0c2c3820' }),
            new ROM({ name: 'Euro Demo 42 (Europe) (Track 09).bin', size: 32182416, crc: '80784294' }),
            new ROM({ name: 'Euro Demo 42 (Europe) (Track 10).bin', size: 26619936, crc: '227a67cf' }),
            new ROM({ name: 'Euro Demo 42 (Europe) (Track 11).bin', size: 19189968, crc: '2ed908e7' }),
            new ROM({ name: 'Euro Demo 42 (Europe) (Track 12).bin', size: 32356464, crc: 'f6f33c3b' }),
          ],
        }),
      ], [
        'Euro Demo 42 (Europe).zip',
      ]],
      // Multiple games with shared ROMs
      [[
        new Game({
          name: 'Zero 4 Champ II (Japan)',
          rom: [
            new ROM({ name: 'Zero 4 Champ II (Japan).cue', size: 4187, crc: 'a8c5c66e' }),
            new ROM({ name: 'Zero 4 Champ II (Japan) (Track 01).bin', size: 7916832, crc: '22144d0f' }),
            new ROM({ name: 'Zero 4 Champ II (Japan) (Track 02).bin', size: 25542720, crc: 'a3ecc4eb' }),
            new ROM({ name: 'Zero 4 Champ II (Japan) (Track 03).bin', size: 13041840, crc: '5f4717be' }),
            new ROM({ name: 'Zero 4 Champ II (Japan) (Track 04).bin', size: 11741184, crc: 'a929f0e1' }),
            new ROM({ name: 'Zero 4 Champ II (Japan) (Track 05).bin', size: 11475408, crc: '8ce00863' }),
            new ROM({ name: 'Zero 4 Champ II (Japan) (Track 06).bin', size: 10151232, crc: '1b052c36' }),
            new ROM({ name: 'Zero 4 Champ II (Japan) (Track 07).bin', size: 13135920, crc: '54d7853c' }),
            new ROM({ name: 'Zero 4 Champ II (Japan) (Track 08).bin', size: 24213840, crc: 'aad2c61a' }),
            new ROM({ name: 'Zero 4 Champ II (Japan) (Track 09).bin', size: 11799984, crc: '10f0d49b' }),
            new ROM({ name: 'Zero 4 Champ II (Japan) (Track 10).bin', size: 16334640, crc: '9eb8f90f' }),
            new ROM({ name: 'Zero 4 Champ II (Japan) (Track 11).bin', size: 11338992, crc: 'fa3d048a' }),
            new ROM({ name: 'Zero 4 Champ II (Japan) (Track 12).bin', size: 12084576, crc: '33167322' }),
            new ROM({ name: 'Zero 4 Champ II (Japan) (Track 13).bin', size: 10513440, crc: '09fb1bd2' }),
            new ROM({ name: 'Zero 4 Champ II (Japan) (Track 14).bin', size: 16325232, crc: '7404385c' }),
            new ROM({ name: 'Zero 4 Champ II (Japan) (Track 15).bin', size: 15266832, crc: '7f2b9388' }),
            new ROM({ name: 'Zero 4 Champ II (Japan) (Track 16).bin', size: 11153184, crc: '0c360c9b' }),
            new ROM({ name: 'Zero 4 Champ II (Japan) (Track 17).bin', size: 11148480, crc: '2f712235' }),
            new ROM({ name: 'Zero 4 Champ II (Japan) (Track 18).bin', size: 11357808, crc: '8a7b39b2' }),
            new ROM({ name: 'Zero 4 Champ II (Japan) (Track 19).bin', size: 7067760, crc: '616c4702' }),
            new ROM({ name: 'Zero 4 Champ II (Japan) (Track 20).bin', size: 13279392, crc: '27706096' }),
            new ROM({ name: 'Zero 4 Champ II (Japan) (Track 21).bin', size: 7923888, crc: 'fecb096f' }),
            new ROM({ name: 'Zero 4 Champ II (Japan) (Track 22).bin', size: 14888160, crc: '9528018f' }),
            new ROM({ name: 'Zero 4 Champ II (Japan) (Track 23).bin', size: 6385680, crc: '26c2432a' }),
            new ROM({ name: 'Zero 4 Champ II (Japan) (Track 24).bin', size: 16367568, crc: 'ce330910' }),
            new ROM({ name: 'Zero 4 Champ II (Japan) (Track 25).bin', size: 846720, crc: '11bf5dbd' }),
            new ROM({ name: 'Zero 4 Champ II (Japan) (Track 26).bin', size: 3281040, crc: 'f9188f3a' }),
            new ROM({ name: 'Zero 4 Champ II (Japan) (Track 27).bin', size: 846720, crc: '11bf5dbd' }),
            new ROM({ name: 'Zero 4 Champ II (Japan) (Track 28).bin', size: 4887456, crc: '8d2dbe56' }),
            new ROM({ name: 'Zero 4 Champ II (Japan) (Track 29).bin', size: 12945408, crc: '8d234a26' }),
            new ROM({ name: 'Zero 4 Champ II (Japan) (Track 30).bin', size: 17611776, crc: '92ee3fb4' }),
            new ROM({ name: 'Zero 4 Champ II (Japan) (Track 31).bin', size: 21073920, crc: '7b03db99' }),
            new ROM({ name: 'Zero 4 Champ II (Japan) (Track 32).bin', size: 14556528, crc: '1f3057c2' }),
            new ROM({ name: 'Zero 4 Champ II (Japan) (Track 33).bin', size: 10520496, crc: '887d8c2a' }),
            new ROM({ name: 'Zero 4 Champ II (Japan) (Track 34).bin', size: 11219040, crc: '05d3e3a4' }),
            new ROM({ name: 'Zero 4 Champ II (Japan) (Track 35).bin', size: 12411504, crc: 'b4cabb3b' }),
            new ROM({ name: 'Zero 4 Champ II (Japan) (Track 36).bin', size: 15285648, crc: '8f997117' }),
            new ROM({ name: 'Zero 4 Champ II (Japan) (Track 37).bin', size: 11284896, crc: '798a830f' }),
            new ROM({ name: 'Zero 4 Champ II (Japan) (Track 38).bin', size: 24498432, crc: 'ac1cbe07' }),
            new ROM({ name: 'Zero 4 Champ II (Japan) (Track 39).bin', size: 19533360, crc: '36df83e6' }),
            new ROM({ name: 'Zero 4 Champ II (Japan) (Track 40).bin', size: 21897120, crc: '137e2970' }),
            new ROM({ name: 'Zero 4 Champ II (Japan) (Track 41).bin', size: 2629536, crc: 'd02a90b7' }),
            new ROM({ name: 'Zero 4 Champ II (Japan) (Track 42).bin', size: 14224896, crc: 'aa345590' }),
            new ROM({ name: 'Zero 4 Champ II (Japan) (Track 43).bin', size: 25192272, crc: '661f8f8e' }),
          ],
        }),
        new Game({
          name: 'Adventure Quiz - Capcom World + Hatena no Daibouken (Japan)',
          rom: [
            new ROM({ name: 'Adventure Quiz - Capcom World + Hatena no Daibouken (Japan).cue', size: 984, crc: '54a01e7d' }),
            new ROM({ name: 'Adventure Quiz - Capcom World + Hatena no Daibouken (Japan) (Track 1).bin', size: 7916832, crc: '22144d0f' }),
            new ROM({ name: 'Adventure Quiz - Capcom World + Hatena no Daibouken (Japan) (Track 2).bin', size: 10536960, crc: '59cc5f3f' }),
            new ROM({ name: 'Adventure Quiz - Capcom World + Hatena no Daibouken (Japan) (Track 3).bin', size: 7785120, crc: '877dde76' }),
            new ROM({ name: 'Adventure Quiz - Capcom World + Hatena no Daibouken (Japan) (Track 4).bin', size: 18992400, crc: '3236adb9' }),
            new ROM({ name: 'Adventure Quiz - Capcom World + Hatena no Daibouken (Japan) (Track 5).bin', size: 9252768, crc: '341cc45f' }),
            new ROM({ name: 'Adventure Quiz - Capcom World + Hatena no Daibouken (Japan) (Track 6).bin', size: 27854736, crc: 'e3646dc1' }),
            new ROM({ name: 'Adventure Quiz - Capcom World + Hatena no Daibouken (Japan) (Track 7).bin', size: 5216736, crc: 'e3792471' }),
          ],
        }),
      ], [
        'Adventure Quiz - Capcom World + Hatena no Daibouken (Japan).zip',
        'Zero 4 Champ II (Japan).zip',
      ]],
    ]))('%s', async (games, expectedDeletedFilePaths) => {
      const inputPath = 'input';
      const options = new Options({
        commands: ['move', command],
        input: [inputPath],
        output: 'output',
      });

      const dat = new LogiqxDAT(new Header(), games);

      const rawRomFiles = (await Promise.all(dat.getParents()
        .flatMap((parent) => parent.getGames())
        .map(async (game): Promise<File[]> => {
          // A path that should not exist
          const zip = new Zip(path.join(inputPath, `${game.getName()}.zip`));
          return Promise.all(game.getRoms().map(async (rom) => rom.toArchiveEntry(zip)));
        }))).flatMap((files) => files);

      const indexedRomFiles = await new FileIndexer(options, new ProgressBarFake())
        .index(rawRomFiles);
      const parentsToCandidates = await new CandidateGenerator(options, new ProgressBarFake())
        .generate(dat, indexedRomFiles);

      const inputRoms = rawRomFiles;
      const movedRoms = [...parentsToCandidates.values()]
        .flatMap((releaseCandidates) => releaseCandidates)
        .flatMap((releaseCandidate) => releaseCandidate.getRomsWithFiles())
        .map((romWithFiles) => romWithFiles.getInputFile());

      const writtenRoms = [...parentsToCandidates.values()]
        .flatMap((releaseCandidates) => releaseCandidates)
        .flatMap((releaseCanddiate) => releaseCanddiate.getRomsWithFiles())
        .map((romWithFiles) => romWithFiles.getOutputFile());
      const datsToWrittenRoms = new Map([[dat, writtenRoms]]);

      const deletedFilePaths = (
        await new MovedROMDeleter(new ProgressBarFake())
          .delete(inputRoms, movedRoms, datsToWrittenRoms)
      )
        .map((filePath) => filePath.replace(inputPath + path.sep, ''))
        .sort();

      expect(deletedFilePaths).toEqual(expectedDeletedFilePaths);
    });
  });
});

it('should not delete files that weren\'t moved', () => {
  // TODO(cemmer)
});
