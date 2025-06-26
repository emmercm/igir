import path from 'node:path';

import MappableSemaphore from '../../async/mappableSemaphore.js';
import ProgressBar, { ProgressBarSymbol } from '../../console/progressBar.js';
import ArrayPoly from '../../polyfill/arrayPoly.js';
import FsPoly from '../../polyfill/fsPoly.js';
import DAT from '../../types/dats/dat.js';
import Disk from '../../types/dats/disk.js';
import Game from '../../types/dats/game.js';
import ROM from '../../types/dats/rom.js';
import SingleValueGame from '../../types/dats/singleValueGame.js';
import TokenReplacementException from '../../types/exceptions/tokenReplacementException.js';
import Archive from '../../types/files/archives/archive.js';
import ArchiveEntry from '../../types/files/archives/archiveEntry.js';
import ArchiveFile from '../../types/files/archives/archiveFile.js';
import Chd from '../../types/files/archives/chd/chd.js';
import ChdBinCue from '../../types/files/archives/chd/chdBinCue.js';
import NkitIso from '../../types/files/archives/nkitIso.js';
import Zip from '../../types/files/archives/zip.js';
import File from '../../types/files/file.js';
import IndexedFiles from '../../types/indexedFiles.js';
import Options, { ZipFormat } from '../../types/options.js';
import OutputFactory, { OutputPath } from '../../types/outputFactory.js';
import ROMWithFiles from '../../types/romWithFiles.js';
import WriteCandidate from '../../types/writeCandidate.js';
import Module from '../module.js';

/**
 * For every {@link Game} in a {@link DAT}, look for its {@link ROM}s in the scanned ROM list,
 * and return a set of candidate files.
 */
export default class CandidateGenerator extends Module {
  private readonly options: Options;
  private readonly readerSemaphore: MappableSemaphore;

  constructor(options: Options, progressBar: ProgressBar, readerSemaphore: MappableSemaphore) {
    super(progressBar, CandidateGenerator.name);
    this.options = options;
    this.readerSemaphore = readerSemaphore;
  }

  /**
   * Generate the candidates.
   */
  async generate(dat: DAT, indexedFiles: IndexedFiles): Promise<WriteCandidate[]> {
    if (indexedFiles.getFiles().length === 0) {
      this.progressBar.logTrace(`${dat.getName()}: no input ROMs to make candidates from`);
      return [];
    }

    let candidates: WriteCandidate[] = [];

    this.progressBar.logTrace(`${dat.getName()}: generating candidates`);
    this.progressBar.setSymbol(ProgressBarSymbol.CANDIDATE_GENERATING);
    this.progressBar.resetProgress(dat.getGames().length);

    // For each game, try to generate a candidate
    await this.readerSemaphore.map(dat.getGames(), async (game) => {
      this.progressBar.incrementInProgress();
      const childBar = this.progressBar.addChildBar({
        name: game.getName(),
      });

      try {
        const gameCandidates = await this.buildCandidatesForGame(dat, game, indexedFiles);
        if (gameCandidates.length > 0) {
          this.progressBar.logTrace(
            `${dat.getName()}: ${game.getName()}: found candidate: ${gameCandidates[0]
              .getRomsWithFiles()
              .map((rwf) => rwf.getInputFile().toString())
              .join(', ')}`,
          );
        }
        candidates = [...candidates, ...gameCandidates];
      } catch (error) {
        // Ignore token replacement errors, just don't add the candidate
        if (!(error instanceof TokenReplacementException)) {
          throw error;
        }
        this.progressBar.logDebug(
          `${dat.getName()}: ${game.getName()}: failed to generate candidate: ${error.message}`,
        );
      } finally {
        childBar.delete();
      }

      this.progressBar.incrementCompleted();
    });

    const size = candidates
      .flatMap((candidate) => candidate.getRomsWithFiles())
      .reduce((sum, romWithFiles) => sum + romWithFiles.getRom().getSize(), 0);
    this.progressBar.logTrace(
      `${dat.getName()}: generated ${FsPoly.sizeReadable(size)} of ${candidates.length.toLocaleString()} candidate${candidates.length === 1 ? '' : 's'}`,
    );

    this.progressBar.logTrace(`${dat.getName()}: done generating candidates`);
    return candidates;
  }

  private async buildCandidatesForGame(
    dat: DAT,
    game: Game,
    indexedFiles: IndexedFiles,
  ): Promise<WriteCandidate[]> {
    const gameRoms = [
      ...game.getRoms(),
      ...(this.options.getExcludeDisks() ? [] : game.getDisks()),
    ];

    const romsAndInputFiles = gameRoms.map((rom): [ROM, File[]] => [
      rom,
      indexedFiles.findFiles(rom) ?? [],
    ]);
    const romsAndLegalInputFiles = this.filterLegalInputFilesForGame(dat, game, romsAndInputFiles);
    const romsToOptimalInputFile = this.findOptimalInputFileForGame(
      dat,
      game,
      gameRoms,
      romsAndLegalInputFiles,
      indexedFiles,
    );

    // For each Game's ROM, find the matching File
    const romsAndRomsWithFiles = (await Promise.all(
      gameRoms.map(async (rom) =>
        this.buildRomRomWithFilesPair(dat, game, rom, romsToOptimalInputFile),
      ),
    )) satisfies [ROM, ROMWithFiles | undefined][];
    const foundRomsWithFiles = romsAndRomsWithFiles
      .map(([, romWithFiles]) => romWithFiles)
      .filter((romWithFiles) => romWithFiles !== undefined);
    if (romsAndRomsWithFiles.length > 0 && foundRomsWithFiles.length === 0) {
      // The Game has ROMs, but none were found
      return [];
    }

    const foundRomsWithArchiveFiles = await this.buildRomsWithArchiveEntries(
      dat,
      game,
      foundRomsWithFiles,
    );

    // Ignore the Game if not every File is present
    const missingRoms = romsAndRomsWithFiles
      .filter(([, romWithFiles]) => !romWithFiles)
      .map(([rom]) => rom);
    if (missingRoms.length > 0 && !this.options.getAllowIncompleteSets()) {
      if (foundRomsWithArchiveFiles.length > 0) {
        this.logMissingRomFiles(dat, game, foundRomsWithArchiveFiles, missingRoms);
      }
      return [];
    }

    // Ignore the Game with conflicting input->output files
    if (this.hasConflictingOutputFiles(dat, foundRomsWithArchiveFiles)) {
      return [];
    }

    // If the found files have excess, and we aren't allowing it, then return no candidate
    if (
      !this.options.shouldZip() &&
      !this.options.shouldExtract() &&
      !this.options.getAllowExcessSets() &&
      this.hasExcessFiles(dat, game, foundRomsWithArchiveFiles, indexedFiles)
    ) {
      return [];
    }

    return await this.generateWriteCandidates(dat, game, foundRomsWithArchiveFiles);
  }

  private filterLegalInputFilesForGame(
    dat: DAT,
    game: Game,
    romsToInputFiles: [ROM, File[]][],
  ): [ROM, File[]][] {
    const singleValueGame = new SingleValueGame({ ...game });

    return romsToInputFiles.map(([rom, inputFiles]): [ROM, File[]] => {
      const rawCopying =
        this.options.shouldWrite() &&
        !this.options.shouldExtractRom(rom) &&
        !this.options.shouldZipRom(rom);

      const filteredInputFiles = inputFiles.filter((inputFile) => {
        if (
          !rawCopying &&
          inputFile instanceof ArchiveEntry &&
          inputFile.getArchive() instanceof NkitIso
        ) {
          // .nkit.iso can't be extracted
          return false;
        }

        if (rawCopying && inputFile instanceof ArchiveEntry) {
          if (this.options.getPatchFileCount() > 0 && !(rom instanceof Disk)) {
            // We MIGHT want to patch this ROM, but we can't if we're raw-copying it
            return false;
          }

          if (
            !(inputFile.getArchive() instanceof Chd) &&
            rom.getName().trim() !== '' &&
            OutputFactory.getPath(this.options, dat, singleValueGame, rom, inputFile).entryPath !==
              inputFile.getExtractedFilePath()
          ) {
            // The input file is an ArchiveEntry that we won't rewrite and its name doesn't match
            // what we want it to be
            return false;
          }
        }

        return true;
      });
      return [rom, filteredInputFiles];
    });
  }

  private findOptimalInputFileForGame(
    dat: DAT,
    game: Game,
    gameRoms: ROM[],
    romsAndInputFiles: [ROM, File[]][],
    indexedFiles: IndexedFiles,
  ): Map<ROM, File> {
    const archiveWithEveryRom = this.findArchiveFileWithEveryRomForGame(
      dat,
      game,
      gameRoms,
      romsAndInputFiles,
      indexedFiles,
    );
    if (archiveWithEveryRom !== undefined) {
      return archiveWithEveryRom;
    }

    return new Map(
      romsAndInputFiles
        .filter(([, inputFiles]) => inputFiles.length > 0)
        .map(([rom, inputFiles]) => {
          // Filter and rank the input files, we want to return the best match
          const rankedInputFiles = inputFiles.sort((a, b) => {
            // There is no legal archive that contains every ROM, prefer using raw files instead
            const aArchiveEntry = a instanceof ArchiveEntry ? 1 : 0;
            const bArchiveEntry = b instanceof ArchiveEntry ? 1 : 0;
            return aArchiveEntry - bArchiveEntry;
          });
          return [rom, rankedInputFiles[0]];
        }),
    );
  }

  private findArchiveFileWithEveryRomForGame(
    dat: DAT,
    game: Game,
    gameRoms: ROM[],
    romsAndInputFiles: [ROM, File[]][],
    indexedFiles: IndexedFiles,
  ): Map<ROM, File> | undefined {
    if (gameRoms.length === 0) {
      return undefined;
    }

    if (gameRoms.every((rom) => this.options.shouldExtractRom(rom))) {
      // We're extracting files, we don't particularly care where they come from, respect any
      // previous sorting
      return undefined;
    }

    // Detect if there is one input archive that contains every ROM, and prefer to use its entries.
    // If we don't do this, there are two situations that can happen:
    //  1. When raw writing (i.e. `igir copy`, `igir move`) archives of games with multiple ROMs, if
    //      some of those ROMs exist in multiple input archives, then you may get a conflict warning
    //      that multiple input files want to write to the same output file - and nothing will be
    //      written.
    //  2. When moving + archiving (i.e. `igir move zip`) games with multiple ROMs, if there are
    //      duplicates of the ROMs in some input archives, then you may get a warning that some of
    //      the input archives won't be deleted because not every entry in it was used for an
    //      output file.

    // Group this Game's ROMs by the input Archives that contain them
    const inputArchivesToRoms = romsAndInputFiles.reduce((map, [rom, files]) => {
      files
        .filter((file) => file instanceof ArchiveEntry)
        .map((archive): Archive => archive.getArchive())
        .forEach((archive) => {
          // We need to filter out duplicate ROMs because of Games that contain duplicate ROMs, e.g.
          //  optical media games that have the same track multiple times.
          if (!map.has(archive)) {
            map.set(archive, new Set());
          }
          map.get(archive)?.add(rom);
        });
      return map;
    }, new Map<Archive, Set<ROM>>());

    // Filter to the Archives that contain every ROM in this Game
    const archivesWithEveryRom = [...inputArchivesToRoms.entries()]
      .filter(([inputArchive, roms]) => {
        if (
          [...roms].map((rom) => rom.hashCode()).join(',') ===
          gameRoms.map((rom) => rom.hashCode()).join(',')
        ) {
          return true;
        }
        // If there is a CHD with every .bin file, and we're raw-copying it, then assume its .cue
        // file is accurate
        return (
          inputArchive instanceof ChdBinCue &&
          !gameRoms.some(
            (rom) => this.options.shouldZipRom(rom) || this.options.shouldExtractRom(rom),
          ) &&
          CandidateGenerator.onlyCueFilesMissingFromChd(game, [...roms])
        );
      })
      .map(([archive]) => archive);

    const filesByPath = indexedFiles.getFilesByFilePath();
    const filteredArchivesWithEveryRom = archivesWithEveryRom
      // Filter out Archives with excess entries
      .filter((archive) => {
        const unusedEntries = this.findArchiveUnusedEntryPaths(
          archive,
          romsAndInputFiles.flatMap(([, inputFiles]) => inputFiles),
          indexedFiles,
        );
        if (unusedEntries.length > 0) {
          this.progressBar.logTrace(
            `${dat.getName()}: ${game.getName()}: not preferring archive that contains every ROM, plus the excess entries:\n${unusedEntries.map((unusedEntry) => `  ${unusedEntry.toString()}`).join('\n')}`,
          );
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        // First, prefer the archive with the least number of entries
        const aEntries = filesByPath.get(a.getFilePath())?.length ?? 0;
        const bEntries = filesByPath.get(b.getFilePath())?.length ?? 0;
        if (aEntries !== bEntries) {
          return aEntries - bEntries;
        }

        // Then, prefer non-CHDs
        const aChd = a instanceof Chd ? 1 : 0;
        const bChd = b instanceof Chd ? 1 : 0;
        if (aChd !== bChd) {
          return bChd - aChd;
        }

        // Then, prefer archives whose filename contains the game name; this is particularly
        // helpful when working without DATs
        const aGameName = path.basename(a.getFilePath()).includes(game.getName()) ? 1 : 0;
        const bGameName = path.basename(b.getFilePath()).includes(game.getName()) ? 1 : 0;
        return bGameName - aGameName;
      });

    const archiveWithEveryRom = filteredArchivesWithEveryRom
      // If we're zipping, only consider zip archives
      .find((archive) => !this.options.shouldZip() || archive instanceof Zip);
    if (archiveWithEveryRom === undefined) {
      return undefined;
    }

    // An Archive was found, use that as the only possible input file
    // For each of this Game's ROMs, find the matching ArchiveEntry from this Archive
    return new Map(
      romsAndInputFiles.map(([rom, inputFiles]) => {
        this.progressBar.logTrace(
          `${dat.getName()}: ${game.getName()}: preferring input archive that contains every ROM: ${archiveWithEveryRom.getFilePath()}`,
        );
        let archiveEntry = inputFiles.find(
          (inputFile) =>
            inputFile.getFilePath() === archiveWithEveryRom.getFilePath() &&
            inputFile instanceof ArchiveEntry &&
            inputFile.getArchive() === archiveWithEveryRom,
        );

        if (
          !archiveEntry &&
          rom.getName().toLowerCase().endsWith('.cue') &&
          archiveWithEveryRom instanceof ChdBinCue
        ) {
          // We assumed this CHD was fine above, find its .cue file
          archiveEntry = filesByPath
            .get(archiveWithEveryRom.getFilePath())
            ?.find((file) => file.getExtractedFilePath().toLowerCase().endsWith('.cue'));
        }

        return [rom, archiveEntry as ArchiveEntry<Archive>];
      }),
    );
  }

  private async buildRomRomWithFilesPair(
    dat: DAT,
    game: Game,
    rom: ROM,
    romsToInputFiles: Map<ROM, File>,
  ): Promise<[ROM, ROMWithFiles | undefined]> {
    let inputFile = romsToInputFiles.get(rom);
    if (inputFile === undefined) {
      return [rom, undefined];
    }

    // If we're not writing (report only) then just use the input file for the output file
    if (!this.options.shouldWrite() && !this.options.shouldTest()) {
      return [rom, new ROMWithFiles(rom, inputFile, inputFile)];
    }

    /**
     * WARN(cemmer): {@link inputFile} may not be an exact match for {@link rom}. There are two
     * situations we can be in:
     *  - {@link rom} is headered and so is {@link inputFile}, so we have an exact match
     *  - {@link rom} is headerless but {@link inputFile} is headered, because we know how to
     *    remove headers from ROMs - but we can't remove headers in all writing modes!
     */

    // If the input file is headered...
    if (
      inputFile.getFileHeader() &&
      // ...and we can rewrite the file
      !this.options.shouldWrite()
    ) {
      // ...then forget the input file's header, so that it doesn't report as incorrect
      // when tested
      inputFile = inputFile.withoutFileHeader();
    }

    // If the input file is headered...
    if (
      inputFile.getFileHeader() &&
      // ...and we want a headered ROM
      ((inputFile.getCrc32() !== undefined && inputFile.getCrc32() === rom.getCrc32()) ||
        (inputFile.getMd5() !== undefined && inputFile.getMd5() === rom.getMd5()) ||
        (inputFile.getSha1() !== undefined && inputFile.getSha1() === rom.getSha1()) ||
        (inputFile.getSha256() !== undefined && inputFile.getSha256() === rom.getSha256())) &&
      // ...and we shouldn't remove the header
      !this.options.canRemoveHeader(path.extname(inputFile.getExtractedFilePath()))
    ) {
      // ...then forget the input file's header, so that we don't later remove it
      this.progressBar.logTrace(
        `${dat.getName()}: ${game.getName()}: not removing header, ignoring that one was found for: ${inputFile.toString()}`,
      );
      inputFile = inputFile.withoutFileHeader();
    }

    // If the input file is headered...
    if (
      inputFile.getFileHeader() &&
      // ...and we DON'T want a headered ROM
      !(
        (inputFile.getCrc32() !== undefined && inputFile.getCrc32() === rom.getCrc32()) ||
        (inputFile.getMd5() !== undefined && inputFile.getMd5() === rom.getMd5()) ||
        (inputFile.getSha1() !== undefined && inputFile.getSha1() === rom.getSha1()) ||
        (inputFile.getSha256() !== undefined && inputFile.getSha256() === rom.getSha256())
      ) &&
      // ...and we're writing file links
      this.options.shouldLink()
    ) {
      // ...then we can't use this file
      this.progressBar.logTrace(
        `${dat.getName()}: ${game.getName()}: can't use headered ROM as target for link: ${inputFile.toString()}`,
      );
      return [rom, undefined];
    }

    const singleValueGame = new SingleValueGame({ ...game });
    try {
      const outputFile = await this.getOutputFile(dat, singleValueGame, rom, inputFile);
      if (outputFile === undefined) {
        return [rom, undefined];
      }
      const romWithFiles = new ROMWithFiles(rom, inputFile, outputFile);
      return [rom, romWithFiles];
    } catch (error) {
      this.progressBar.logError(`${dat.getName()}: ${game.getName()}: ${error}`);
      return [rom, undefined];
    }
  }

  private async shouldGenerateArchiveFile(
    dat: DAT,
    game: Game,
    romsWithFiles: ROMWithFiles[],
  ): Promise<boolean> {
    if (this.options.shouldDir2Dat()) {
      // We want to keep the scanned archive entries for dir2dat
      return false;
    }

    if (this.options.getZipDatName()) {
      // All candidates will be later combined, so we can't raw-copy this archive
      return false;
    }

    const singleValueGame = new SingleValueGame({ ...game });

    // Checks for all archive types, zips and otherwise
    for (const romWithFiles of romsWithFiles) {
      const rom = romWithFiles.getRom();
      const inputFile = romWithFiles.getInputFile();

      if (!(inputFile instanceof ArchiveEntry)) {
        // Non-archived files can't be made into an ArchiveFile
        return false;
      }

      if (
        // If the input file is headered...
        inputFile.getFileHeader() &&
        // ...and we want an unheadered ROM
        ((inputFile.getCrc32WithoutHeader() !== undefined &&
          inputFile.getCrc32WithoutHeader() !== rom.getCrc32()) ||
          (inputFile.getMd5WithoutHeader() !== undefined &&
            inputFile.getMd5WithoutHeader() !== rom.getMd5()) ||
          (inputFile.getSha1WithoutHeader() !== undefined &&
            inputFile.getSha1WithoutHeader() !== rom.getSha1()) ||
          (inputFile.getSha256WithoutHeader() !== undefined &&
            inputFile.getSha256WithoutHeader() !== rom.getSha256()))
      ) {
        // ...then we can't use this archive as-is
        return false;
      }

      if (this.options.shouldExtractRom(rom)) {
        // We want to extract the ROM, we shouldn't make an ArchiveFile
        return false;
      }

      if (this.options.shouldZipRom(rom) && !(inputFile.getArchive() instanceof Zip)) {
        // We want to zip the ROM, and the input file isn't already in a zip
        return false;
      }

      if (
        this.options.getPatchFileCount() > 0 &&
        !(this.options.shouldExtractRom(rom) || this.options.shouldZipRom(rom)) &&
        !(rom instanceof Disk)
      ) {
        // We might want to patch this file, but won't be able to, so we can't use this archive
        return false;
      }

      if (
        !(inputFile.getArchive() instanceof Chd) &&
        rom.getName().trim() !== '' &&
        OutputFactory.getPath(this.options, dat, singleValueGame, rom, inputFile).entryPath !==
          inputFile.getExtractedFilePath()
      ) {
        // This file doesn't have the correct entry path, we need to rewrite it
        return false;
      }
    }

    if (
      romsWithFiles.filter(
        ArrayPoly.filterUniqueMapped((romWithFiles) => romWithFiles.getInputFile().getFilePath()),
      ).length !== 1
    ) {
      // Every input file has to be coming from the same archive
      return false;
    }
    const inputArchive = (romsWithFiles[0].getInputFile() as ArchiveEntry<Archive>).getArchive();

    // Checks for when every input file is from a zip
    if (inputArchive instanceof Zip) {
      if (
        this.options.getZipFormat() === ZipFormat.TORRENTZIP &&
        !(await inputArchive.isTorrentZip())
      ) {
        // The input file isn't a TorrentZip, it needs to be rewritten
        return false;
      }

      if (this.options.getZipFormat() === ZipFormat.RVZSTD && !(await inputArchive.isRVZSTD())) {
        // The input file isn't RVZSTD, it needs to be rewritten
        return false;
      }
    }

    return true;
  }

  private async buildRomsWithArchiveEntries(
    dat: DAT,
    game: Game,
    foundRomsWithFiles: ROMWithFiles[],
  ): Promise<ROMWithFiles[]> {
    if (foundRomsWithFiles.length === 0) {
      return foundRomsWithFiles;
    }

    // If every matched input file is from the same archive, and we can raw-copy that entire
    // archive, then treat the file as "raw" so it can be copied/moved as-is
    const shouldGenerateArchiveFile = await this.shouldGenerateArchiveFile(
      dat,
      game,
      foundRomsWithFiles,
    );
    return (
      await Promise.all(
        foundRomsWithFiles.map(async (romWithFiles) => {
          if (!shouldGenerateArchiveFile && !(romWithFiles.getRom() instanceof Disk)) {
            return romWithFiles;
          }

          const oldInputFile = romWithFiles.getInputFile();
          if (!(oldInputFile instanceof ArchiveEntry)) {
            // This shouldn't happen, but if it does, just ignore
            return romWithFiles;
          }

          /**
           * Note: we're delaying checksum calculations for now,
           * {@link CandidateArchiveFileHasher} will handle it later
           */
          try {
            const newInputFile = new ArchiveFile(oldInputFile.getArchive(), {
              size: await FsPoly.size(oldInputFile.getFilePath()),
              checksumBitmask: oldInputFile.getChecksumBitmask(),
            });
            return romWithFiles.withInputFile(newInputFile);
          } catch (error) {
            this.progressBar.logWarn(`${dat.getName()}: ${game.getName()}: ${error}`);
            return undefined;
          }
        }),
      )
    ).filter((romWithFiles) => romWithFiles !== undefined);
    // Note: we'll have duplicate input->output files here, but we can't get rid of them until
    // checking for missing ROMs or excess files
  }

  private logMissingRomFiles(
    dat: DAT,
    game: Game,
    foundRomsWithFiles: ROMWithFiles[],
    missingRoms: ROM[],
  ): void {
    let message = `${dat.getName()}: ${game.getName()}: found ${foundRomsWithFiles.length.toLocaleString()} file${foundRomsWithFiles.length === 1 ? '' : 's'}, missing ${missingRoms.length.toLocaleString()} file${missingRoms.length === 1 ? '' : 's'}`;
    missingRoms.forEach((rom) => {
      message += `\n  ${rom.getName()}`;
    });
    this.progressBar.logTrace(message);
  }

  private hasConflictingOutputFiles(dat: DAT, romsWithFiles: ROMWithFiles[]): boolean {
    // If we're not writing, then don't bother looking for conflicts
    if (!this.options.shouldWrite()) {
      return false;
    }

    // For all the ROMs for a Game+Release, find all non-archive output files that have a duplicate
    //  output file path. In other words, there are multiple input files that want to write to the
    //  same output file.
    const duplicateOutputPaths = romsWithFiles
      .map((romWithFiles) => romWithFiles.getOutputFile())
      .filter((outputFile) => !(outputFile instanceof ArchiveEntry))
      .map((outputFile) => outputFile.getFilePath())
      // Is a duplicate output path
      .filter((outputPath, idx, outputPaths) => outputPaths.indexOf(outputPath) !== idx)
      // Only return one copy of duplicate output paths
      .reduce(ArrayPoly.reduceUnique(), [])
      .sort();
    if (duplicateOutputPaths.length === 0) {
      // There are no duplicate non-archive output file paths
      return false;
    }

    let hasConflict = false;
    for (const duplicateOutput of duplicateOutputPaths) {
      // For an output path that has multiple input paths, filter to only the unique input paths,
      //  and if there are still multiple input file paths then we won't be able to resolve this
      //  at write time
      const conflictedInputFiles = romsWithFiles
        .filter((romWithFiles) => romWithFiles.getOutputFile().getFilePath() === duplicateOutput)
        .map((romWithFiles) => romWithFiles.getInputFile().toString())
        .reduce(ArrayPoly.reduceUnique(), []);
      if (conflictedInputFiles.length > 1) {
        hasConflict = true;
        let message = `${dat.getName()}: no single archive contains all necessary files, cannot ${this.options.writeString()} these different input files to: ${duplicateOutput}:`;
        conflictedInputFiles.forEach((conflictedInputFile) => {
          message += `\n  ${conflictedInputFile}`;
        });
        this.progressBar.logWarn(message);
      }
    }
    return hasConflict;
  }

  /**
   * Given a {@link Game}, return true if all conditions are met:
   * - The {@link Game} only has .bin and .cue files
   * - Out of the {@link ROM}s that were found in an input directory for the {@link Game}, every
   *    .bin was found but at least one .cue file is missing
   * This is only relevant when we are raw-copying CHD files, where it is difficult to ensure that
   * the .cue file is accurate.
   */
  private static onlyCueFilesMissingFromChd(game: Game, foundRoms: ROM[]): boolean {
    if (foundRoms.length === 0) {
      // No ROMs were found, including any .bin files
      return false;
    }

    // Only games with only bin/cue files can have only a cue file missing
    let hasCue = false;
    let hasBin = false;
    let hasOther = false;
    for (const rom of game.getRoms()) {
      const romName = rom.getName().toLowerCase();
      if (romName.endsWith('.cue')) {
        hasCue = true;
      } else if (romName.endsWith('.bin')) {
        hasBin = true;
      } else {
        hasOther = true;
      }
    }
    if (!hasCue || !hasBin || hasOther) {
      // This is not a .cue/.bin only game
      return false;
    }

    const foundRomNames = new Set(foundRoms.map((rom) => rom.getName()));
    return game
      .getRoms()
      .every(
        (rom) => foundRomNames.has(rom.getName()) || rom.getName().toLowerCase().endsWith('.cue'),
      );
  }

  private hasExcessFiles(
    dat: DAT,
    game: Game,
    romsWithFiles: ROMWithFiles[],
    indexedFiles: IndexedFiles,
  ): boolean {
    // For this Game, find every input file that is an ArchiveEntry
    const inputArchiveEntries = romsWithFiles
      // We need to rehydrate information from IndexedFiles because raw-copying/moving archives
      // would have lost this information
      .map((romWithFiles) => {
        const inputFile = romWithFiles.getInputFile();
        return indexedFiles
          .findFiles(romWithFiles.getRom())
          ?.find(
            (foundFile) =>
              foundFile.getFilePath() === inputFile.getFilePath() &&
              inputFile instanceof ArchiveEntry &&
              foundFile instanceof ArchiveEntry &&
              inputFile.getArchive() === foundFile.getArchive(),
          );
      })
      .filter((inputFile) => inputFile instanceof ArchiveEntry || inputFile instanceof ArchiveFile);
    // ...then translate those ArchiveEntries into a list of unique Archives
    const inputArchives = inputArchiveEntries
      .map((archiveEntry) => archiveEntry.getArchive())
      .filter(ArrayPoly.filterUniqueMapped((archive) => archive.getFilePath()));

    if (
      inputArchives.length === 1 &&
      inputArchives[0] instanceof ChdBinCue &&
      CandidateGenerator.onlyCueFilesMissingFromChd(
        game,
        romsWithFiles.map((romWithFiles) => romWithFiles.getRom()),
      )
    ) {
      // We couldn't match the CHD's .cue files, so don't consider them as excess
      return false;
    }

    for (const inputArchive of inputArchives) {
      const unusedEntries = this.findArchiveUnusedEntryPaths(
        inputArchive,
        inputArchiveEntries,
        indexedFiles,
      );
      if (unusedEntries.length > 0) {
        this.progressBar.logTrace(
          `${dat.getName()}: ${game.getName()}: cannot use '${inputArchive.getFilePath()}' as an input file, it has the excess entries:\n${unusedEntries.map((unusedEntry) => `  ${unusedEntry.toString()}`).join('\n')}`,
        );
        return true;
      }
    }

    return false;
  }

  /**
   * Given an input {@link archive} and a set of {@link inputFiles} that match to a {@link ROM} from
   * a {@link Game}, determine if every entry from the {@link archive} was matched.
   */
  private findArchiveUnusedEntryPaths(
    archive: Archive,
    inputFiles: File[],
    indexedFiles: IndexedFiles,
  ): ArchiveEntry<Archive>[] {
    if (this.options.shouldExtract() || this.options.getAllowExcessSets()) {
      // We don't particularly care where input files come from
      return [];
    }

    /**
     * Find the Archive's entries (all of them, not just ones that match ROMs in this Game)
     * NOTE(cemmer): we need to use hashCode() because a Game may have duplicate ROMs that all got
     *  matched to the same input file, so not every archive entry may be in {@link inputFiles}
     */
    const archiveEntryHashCodes = new Set(
      inputFiles
        .filter(
          (file) =>
            file.getFilePath() === archive.getFilePath() &&
            file instanceof ArchiveEntry &&
            file.getArchive() === archive,
        )
        .map((entry) => entry.hashCode()),
    );

    // Find which of the Archive's entries didn't match to a ROM from this Game
    return (indexedFiles.getFilesByFilePath().get(archive.getFilePath()) ?? []).filter(
      (file): file is ArchiveEntry<Archive> => {
        if (!(file instanceof ArchiveEntry)) {
          // A non-archive file exists at the same path as the archive (this shouldn't happen)
          return false;
        }
        if (file.getArchive() !== archive) {
          // This archive entry is coming from a different archive at the same path (probably a
          // different archive type)
          return false;
        }

        return (
          (!(archive instanceof ChdBinCue) ||
            !file.getExtractedFilePath().toLowerCase().endsWith('.cue')) &&
          !archiveEntryHashCodes.has(file.hashCode())
        );
      },
    );
  }

  private async getOutputFile(
    dat: DAT,
    game: SingleValueGame,
    rom: ROM,
    inputFile: File,
  ): Promise<File | undefined> {
    // Determine the output file's path
    let outputPathParsed: OutputPath;
    try {
      outputPathParsed = OutputFactory.getPath(this.options, dat, game, rom, inputFile);
    } catch (error) {
      this.progressBar.logTrace(`${dat.getName()}: ${game.getName()}: ${error}`);
      return undefined;
    }
    const outputFilePath = outputPathParsed.format();

    // Determine the output CRC of the file
    let outputFileCrc32 = inputFile.getCrc32();
    let outputFileMd5 = inputFile.getMd5();
    let outputFileSha1 = inputFile.getSha1();
    let outputFileSha256 = inputFile.getSha256();
    let outputFileSize = inputFile.getSize();
    if (inputFile.getFileHeader()) {
      outputFileCrc32 = inputFile.getCrc32WithoutHeader();
      outputFileMd5 = inputFile.getMd5WithoutHeader();
      outputFileSha1 = inputFile.getSha1WithoutHeader();
      outputFileSha256 = inputFile.getSha256WithoutHeader();
      outputFileSize = inputFile.getSizeWithoutHeader();
    }

    // Determine the output file type
    if (
      (this.options.shouldZipRom(rom) && !(inputFile instanceof ArchiveFile)) ||
      (!this.options.shouldWrite() &&
        inputFile instanceof ArchiveEntry &&
        inputFile.getArchive() instanceof Zip)
    ) {
      // Should zip, return an archive entry within an output zip
      return ArchiveEntry.entryOf({
        archive: new Zip(outputFilePath),
        entryPath: outputPathParsed.entryPath,
        size: outputFileSize,
        crc32: outputFileCrc32,
        md5: outputFileMd5,
        sha1: outputFileSha1,
        sha256: outputFileSha256,
      });
    }
    // Otherwise, return a raw file
    return File.fileOf({
      filePath: outputFilePath,
      size: outputFileSize,
      crc32: outputFileCrc32,
      md5: outputFileMd5,
      sha1: outputFileSha1,
      sha256: outputFileSha256,
    });
  }

  private async generateWriteCandidates(
    dat: DAT,
    game: Game,
    foundRomsWithFiles: ROMWithFiles[],
  ): Promise<WriteCandidate[]> {
    const singleValueGames = (
      game.getRegions().length > 0 ? game.getRegions() : [undefined]
    ).flatMap((region) =>
      (game.getLanguages().length > 0 ? game.getLanguages() : [undefined]).flatMap((language) =>
        (game.getCategories().length > 0 ? game.getCategories() : [undefined]).flatMap(
          (category) => new SingleValueGame({ ...game, region, language, category }),
        ),
      ),
    );
    const writeCandidates = await Promise.all(
      (singleValueGames.length > 0 ? singleValueGames : [new SingleValueGame({ ...game })]).map(
        async (singleValueGame) => {
          const romWithFiles = (
            await Promise.all(
              foundRomsWithFiles.map(async (romWithFiles) => {
                const outputFile = await this.getOutputFile(
                  dat,
                  singleValueGame,
                  romWithFiles.getRom(),
                  romWithFiles.getInputFile(),
                );
                if (!outputFile) {
                  return undefined;
                }
                return new ROMWithFiles(
                  romWithFiles.getRom(),
                  romWithFiles.getInputFile(),
                  outputFile,
                );
              }),
            )
          ).filter((romWithFiles) => romWithFiles !== undefined);
          return new WriteCandidate(singleValueGame, romWithFiles);
        },
      ),
    );

    return (
      writeCandidates
        // Deduplicate ROMWithFiles within the candidates
        .map((writeCandidate) => {
          const uniqueRomsWithFiles = writeCandidate
            .getRomsWithFiles()
            .filter(
              ArrayPoly.filterUniqueMapped(
                (romWithFiles) =>
                  `${romWithFiles.getInputFile().toString()}|${romWithFiles.getOutputFile().toString()}`,
              ),
            );
          return writeCandidate.withRomsWithFiles(uniqueRomsWithFiles);
        })
        // Deduplicate WriteCandidates
        .filter(ArrayPoly.filterUniqueMapped((candidate) => candidate.hashCode()))
    );
  }
}
