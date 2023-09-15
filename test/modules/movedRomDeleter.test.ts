import path from 'path';

import CandidateGenerator from '../../src/modules/candidateGenerator.js';
import FileIndexer from '../../src/modules/fileIndexer.js';
import MovedROMDeleter from '../../src/modules/movedRomDeleter.js';
import ROMScanner from '../../src/modules/romScanner.js';
import fsPoly from '../../src/polyfill/fsPoly.js';
import Zip from '../../src/types/files/archives/zip.js';
import File from '../../src/types/files/file.js';
import DAT from '../../src/types/logiqx/dat.js';
import Game from '../../src/types/logiqx/game.js';
import Header from '../../src/types/logiqx/header.js';
import ROM from '../../src/types/logiqx/rom.js';
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
            new ROM('Euro Demo 42 (Europe).cue', 1374, '96b2b896'),
            new ROM('Euro Demo 42 (Europe) (Track 01).bin', 326168304, '738a3744'),
            new ROM('Euro Demo 42 (Europe) (Track 02).bin', 12199824, '1b77f37f'),
            new ROM('Euro Demo 42 (Europe) (Track 03).bin', 1147776, 'c39c78b2'),
            new ROM('Euro Demo 42 (Europe) (Track 04).bin', 1147776, 'c39c78b2'),
            new ROM('Euro Demo 42 (Europe) (Track 05).bin', 10746288, '30a1b973'),
            new ROM('Euro Demo 42 (Europe) (Track 06).bin', 1147776, 'c39c78b2'),
            new ROM('Euro Demo 42 (Europe) (Track 07).bin', 1147776, 'c39c78b2'),
            new ROM('Euro Demo 42 (Europe) (Track 08).bin', 37260384, '0c2c3820'),
            new ROM('Euro Demo 42 (Europe) (Track 09).bin', 32182416, '80784294'),
            new ROM('Euro Demo 42 (Europe) (Track 10).bin', 26619936, '227a67cf'),
            new ROM('Euro Demo 42 (Europe) (Track 11).bin', 19189968, '2ed908e7'),
            new ROM('Euro Demo 42 (Europe) (Track 12).bin', 32356464, 'f6f33c3b'),
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
            new ROM('Zero 4 Champ II (Japan).cue', 4187, 'a8c5c66e'),
            new ROM('Zero 4 Champ II (Japan) (Track 01).bin', 7916832, '22144d0f'),
            new ROM('Zero 4 Champ II (Japan) (Track 02).bin', 25542720, 'a3ecc4eb'),
            new ROM('Zero 4 Champ II (Japan) (Track 03).bin', 13041840, '5f4717be'),
            new ROM('Zero 4 Champ II (Japan) (Track 04).bin', 11741184, 'a929f0e1'),
            new ROM('Zero 4 Champ II (Japan) (Track 05).bin', 11475408, '8ce00863'),
            new ROM('Zero 4 Champ II (Japan) (Track 06).bin', 10151232, '1b052c36'),
            new ROM('Zero 4 Champ II (Japan) (Track 07).bin', 13135920, '54d7853c'),
            new ROM('Zero 4 Champ II (Japan) (Track 08).bin', 24213840, 'aad2c61a'),
            new ROM('Zero 4 Champ II (Japan) (Track 09).bin', 11799984, '10f0d49b'),
            new ROM('Zero 4 Champ II (Japan) (Track 10).bin', 16334640, '9eb8f90f'),
            new ROM('Zero 4 Champ II (Japan) (Track 11).bin', 11338992, 'fa3d048a'),
            new ROM('Zero 4 Champ II (Japan) (Track 12).bin', 12084576, '33167322'),
            new ROM('Zero 4 Champ II (Japan) (Track 13).bin', 10513440, '09fb1bd2'),
            new ROM('Zero 4 Champ II (Japan) (Track 14).bin', 16325232, '7404385c'),
            new ROM('Zero 4 Champ II (Japan) (Track 15).bin', 15266832, '7f2b9388'),
            new ROM('Zero 4 Champ II (Japan) (Track 16).bin', 11153184, '0c360c9b'),
            new ROM('Zero 4 Champ II (Japan) (Track 17).bin', 11148480, '2f712235'),
            new ROM('Zero 4 Champ II (Japan) (Track 18).bin', 11357808, '8a7b39b2'),
            new ROM('Zero 4 Champ II (Japan) (Track 19).bin', 7067760, '616c4702'),
            new ROM('Zero 4 Champ II (Japan) (Track 20).bin', 13279392, '27706096'),
            new ROM('Zero 4 Champ II (Japan) (Track 21).bin', 7923888, 'fecb096f'),
            new ROM('Zero 4 Champ II (Japan) (Track 22).bin', 14888160, '9528018f'),
            new ROM('Zero 4 Champ II (Japan) (Track 23).bin', 6385680, '26c2432a'),
            new ROM('Zero 4 Champ II (Japan) (Track 24).bin', 16367568, 'ce330910'),
            new ROM('Zero 4 Champ II (Japan) (Track 25).bin', 846720, '11bf5dbd'),
            new ROM('Zero 4 Champ II (Japan) (Track 26).bin', 3281040, 'f9188f3a'),
            new ROM('Zero 4 Champ II (Japan) (Track 27).bin', 846720, '11bf5dbd'),
            new ROM('Zero 4 Champ II (Japan) (Track 28).bin', 4887456, '8d2dbe56'),
            new ROM('Zero 4 Champ II (Japan) (Track 29).bin', 12945408, '8d234a26'),
            new ROM('Zero 4 Champ II (Japan) (Track 30).bin', 17611776, '92ee3fb4'),
            new ROM('Zero 4 Champ II (Japan) (Track 31).bin', 21073920, '7b03db99'),
            new ROM('Zero 4 Champ II (Japan) (Track 32).bin', 14556528, '1f3057c2'),
            new ROM('Zero 4 Champ II (Japan) (Track 33).bin', 10520496, '887d8c2a'),
            new ROM('Zero 4 Champ II (Japan) (Track 34).bin', 11219040, '05d3e3a4'),
            new ROM('Zero 4 Champ II (Japan) (Track 35).bin', 12411504, 'b4cabb3b'),
            new ROM('Zero 4 Champ II (Japan) (Track 36).bin', 15285648, '8f997117'),
            new ROM('Zero 4 Champ II (Japan) (Track 37).bin', 11284896, '798a830f'),
            new ROM('Zero 4 Champ II (Japan) (Track 38).bin', 24498432, 'ac1cbe07'),
            new ROM('Zero 4 Champ II (Japan) (Track 39).bin', 19533360, '36df83e6'),
            new ROM('Zero 4 Champ II (Japan) (Track 40).bin', 21897120, '137e2970'),
            new ROM('Zero 4 Champ II (Japan) (Track 41).bin', 2629536, 'd02a90b7'),
            new ROM('Zero 4 Champ II (Japan) (Track 42).bin', 14224896, 'aa345590'),
            new ROM('Zero 4 Champ II (Japan) (Track 43).bin', 25192272, '661f8f8e'),
          ],
        }),
        new Game({
          name: 'Adventure Quiz - Capcom World + Hatena no Daibouken (Japan)',
          rom: [
            new ROM('Adventure Quiz - Capcom World + Hatena no Daibouken (Japan).cue', 984, '54a01e7d'),
            new ROM('Adventure Quiz - Capcom World + Hatena no Daibouken (Japan) (Track 1).bin', 7916832, '22144d0f'),
            new ROM('Adventure Quiz - Capcom World + Hatena no Daibouken (Japan) (Track 2).bin', 10536960, '59cc5f3f'),
            new ROM('Adventure Quiz - Capcom World + Hatena no Daibouken (Japan) (Track 3).bin', 7785120, '877dde76'),
            new ROM('Adventure Quiz - Capcom World + Hatena no Daibouken (Japan) (Track 4).bin', 18992400, '3236adb9'),
            new ROM('Adventure Quiz - Capcom World + Hatena no Daibouken (Japan) (Track 5).bin', 9252768, '341cc45f'),
            new ROM('Adventure Quiz - Capcom World + Hatena no Daibouken (Japan) (Track 6).bin', 27854736, 'e3646dc1'),
            new ROM('Adventure Quiz - Capcom World + Hatena no Daibouken (Japan) (Track 7).bin', 5216736, 'e3792471'),
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

      const dat = new DAT(new Header(), games);

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
