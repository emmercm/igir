import path from 'node:path';

import { Semaphore } from 'async-mutex';

import ProgressBar, { ProgressBarSymbol } from '../../console/progressBar.js';
import ArrayPoly from '../../polyfill/arrayPoly.js';
import FsPoly from '../../polyfill/fsPoly.js';
import DAT from '../../types/dats/dat.js';
import Game from '../../types/dats/game.js';
import Parent from '../../types/dats/parent.js';
import Release from '../../types/dats/release.js';
import ROM from '../../types/dats/rom.js';
import Archive from '../../types/files/archives/archive.js';
import ArchiveEntry from '../../types/files/archives/archiveEntry.js';
import ArchiveFile from '../../types/files/archives/archiveFile.js';
import Chd from '../../types/files/archives/chd/chd.js';
import Zip from '../../types/files/archives/zip.js';
import File from '../../types/files/file.js';
import IndexedFiles from '../../types/indexedFiles.js';
import Options from '../../types/options.js';
import OutputFactory, { OutputPath } from '../../types/outputFactory.js';
import ReleaseCandidate from '../../types/releaseCandidate.js';
import ROMWithFiles from '../../types/romWithFiles.js';
import Module from '../module.js';

/**
 * For every {@link Parent} in the {@link DAT}, look for its {@link ROM}s in the scanned ROM list,
 * and return a set of candidate files.
 */
export default class CandidateGenerator extends Module {
  private static readonly THREAD_SEMAPHORE = new Semaphore(Number.MAX_SAFE_INTEGER);

  private readonly options: Options;

  constructor(options: Options, progressBar: ProgressBar) {
    super(progressBar, CandidateGenerator.name);
    this.options = options;

    // This will be the same value globally, but we can't know the value at file import time
    if (options.getReaderThreads() < CandidateGenerator.THREAD_SEMAPHORE.getValue()) {
      CandidateGenerator.THREAD_SEMAPHORE.setValue(options.getReaderThreads());
    }
  }

  /**
   * Generate the candidates.
   */
  async generate(dat: DAT, indexedFiles: IndexedFiles): Promise<Map<Parent, ReleaseCandidate[]>> {
    if (indexedFiles.getFiles().length === 0) {
      this.progressBar.logTrace(`${dat.getName()}: no input ROMs to make candidates from`);
      return new Map(dat.getParents().map((parent) => [parent, []]));
    }

    const output = new Map<Parent, ReleaseCandidate[]>();
    const parents = dat.getParents();

    this.progressBar.logTrace(`${dat.getName()}: generating candidates`);
    this.progressBar.setSymbol(ProgressBarSymbol.CANDIDATE_GENERATING);
    this.progressBar.reset(parents.length);

    // For each parent, try to generate a parent candidate
    await Promise.all(
      parents.map(async (parent) =>
        CandidateGenerator.THREAD_SEMAPHORE.runExclusive(async () => {
          this.progressBar.incrementProgress();
          const waitingMessage = `${parent.getName()} ...`;
          this.progressBar.addWaitingMessage(waitingMessage);

          const releaseCandidates: ReleaseCandidate[] = [];

          // For every game
          for (let j = 0; j < parent.getGames().length; j += 1) {
            const game = parent.getGames()[j];
            let foundCandidates = 0;

            // For every release (ensuring at least one), find all release candidates
            const releases = game.getReleases().length > 0 ? game.getReleases() : [undefined];
            for (const release of releases) {
              const releaseCandidate = await this.buildReleaseCandidateForRelease(
                dat,
                game,
                release,
                indexedFiles,
              );
              if (releaseCandidate) {
                releaseCandidates.push(releaseCandidate);
                foundCandidates += 1;
              }
            }

            this.progressBar.logTrace(
              `${dat.getName()}: ${game.getName()}: found ${foundCandidates.toLocaleString()} candidate${foundCandidates !== 1 ? 's' : ''}`,
            );
          }

          this.progressBar.logTrace(
            `${dat.getName()}: ${parent.getName()} (parent): found ${releaseCandidates.length.toLocaleString()} candidate${releaseCandidates.length !== 1 ? 's' : ''}`,
          );
          output.set(parent, releaseCandidates);

          this.progressBar.removeWaitingMessage(waitingMessage);
          this.progressBar.incrementDone();
        }),
      ),
    );

    const size = [...output.values()]
      .flat()
      .flatMap((releaseCandidate) => releaseCandidate.getRomsWithFiles())
      .reduce((sum, romWithFiles) => sum + romWithFiles.getRom().getSize(), 0);
    const totalCandidates = [...output.values()].reduce((sum, rc) => sum + rc.length, 0);
    this.progressBar.logTrace(
      `${dat.getName()}: generated ${FsPoly.sizeReadable(size)} of ${totalCandidates.toLocaleString()} candidate${totalCandidates !== 1 ? 's' : ''} for ${output.size.toLocaleString()} parent${output.size !== 1 ? 's' : ''}`,
    );

    this.progressBar.logTrace(`${dat.getName()}: done generating candidates`);
    return output;
  }

  private async buildReleaseCandidateForRelease(
    dat: DAT,
    game: Game,
    release: Release | undefined,
    indexedFiles: IndexedFiles,
  ): Promise<ReleaseCandidate | undefined> {
    const romsToInputFiles = this.getInputFilesForGame(dat, game, indexedFiles);

    const gameRoms = [
      ...game.getRoms(),
      ...(this.options.getExcludeDisks() ? [] : game.getDisks()),
    ];

    // For each Game's ROM, find the matching File
    const romFiles = (await Promise.all(
      gameRoms.map(async (rom) => {
        let inputFile = romsToInputFiles.get(rom);
        if (inputFile === undefined) {
          return [rom, undefined];
        }

        /**
         * WARN(cemmer): {@link inputFile} may not be an exact match for {@link rom}. There are two
         * situations we can be in:
         *  - {@link rom} is headered and so is {@link inputFile}, so we have an exact match
         *  - {@link rom} is headerless but {@link inputFile} is headered, because we know how to
         *    remove headers from ROMs - but we can't remove headers in all writing modes!
         */

        // If we're not writing (report only) then just use the input file for the output file
        if (!this.options.shouldWrite()) {
          return [rom, new ROMWithFiles(rom, inputFile, inputFile)];
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

        /**
         * If the matched input file is from an archive, and we can raw-copy that entire archive,
         * then treat the file as "raw" so it can be copied/moved as-is.
         */
        if (
          inputFile instanceof ArchiveEntry &&
          this.shouldGenerateArchiveFile(dat, game, release, rom, romsToInputFiles)
        ) {
          try {
            // Note: we're delaying checksum calculations for now,
            // {@link CandidateArchiveFileHasher} will handle it later
            inputFile = new ArchiveFile(inputFile.getArchive(), {
              size: await FsPoly.size(inputFile.getFilePath()),
              checksumBitmask: inputFile.getChecksumBitmask(),
            });
          } catch (error) {
            this.progressBar.logWarn(`${dat.getName()}: ${game.getName()}: ${error}`);
            return [rom, undefined];
          }
        }

        try {
          const outputFile = await this.getOutputFile(dat, game, release, rom, inputFile);
          if (outputFile === undefined) {
            return [rom, undefined];
          }
          const romWithFiles = new ROMWithFiles(rom, inputFile, outputFile);
          return [rom, romWithFiles];
        } catch (error) {
          this.progressBar.logError(`${dat.getName()}: ${game.getName()}: ${error}`);
          return [rom, undefined];
        }
      }),
    )) satisfies [ROM, ROMWithFiles | undefined][];

    const foundRomsWithFiles = romFiles
      .map(([, romWithFiles]) => romWithFiles)
      .filter((romWithFiles) => romWithFiles !== undefined);
    if (romFiles.length > 0 && foundRomsWithFiles.length === 0) {
      // The Game has ROMs, but none were found
      return undefined;
    }

    const missingRoms = romFiles.filter(([, romWithFiles]) => !romWithFiles).map(([rom]) => rom);

    // Ignore the Game if not every File is present
    if (missingRoms.length > 0 && !this.options.getAllowIncompleteSets()) {
      if (foundRomsWithFiles.length > 0) {
        this.logMissingRomFiles(dat, game, release, foundRomsWithFiles, missingRoms);
      }
      return undefined;
    }

    // Ignore the Game with conflicting input->output files
    if (this.hasConflictingOutputFiles(dat, foundRomsWithFiles)) {
      return undefined;
    }

    // If the found files have excess and we aren't allowing it, then return no candidate
    if (
      !this.options.shouldZip() &&
      !this.options.shouldExtract() &&
      !this.options.getAllowExcessSets() &&
      this.hasExcessFiles(dat, game, foundRomsWithFiles, indexedFiles)
    ) {
      return undefined;
    }

    return new ReleaseCandidate(game, release, foundRomsWithFiles);
  }

  private getInputFilesForGame(dat: DAT, game: Game, indexedFiles: IndexedFiles): Map<ROM, File> {
    const gameRoms = [
      ...game.getRoms(),
      ...(this.options.getExcludeDisks() ? [] : game.getDisks()),
    ];

    const romsAndInputFiles = gameRoms.map((rom) => [
      rom,
      indexedFiles.findFiles(rom) ?? [],
    ]) satisfies [ROM, File[]][];

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
          inputArchive instanceof Chd &&
          !gameRoms.some((rom) => this.options.shouldZipRom(rom)) &&
          !gameRoms.some((rom) => this.options.shouldExtractRom(rom)) &&
          CandidateGenerator.onlyCueFilesMissingFromChd(game, [...roms])
        );
      })
      .map(([archive]) => archive);

    const filesByPath = indexedFiles.getFilesByFilePath();
    const filteredArchivesWithEveryRom = archivesWithEveryRom
      .sort((a, b) => {
        // First, prefer the archive with the least number of entries
        const aEntries = filesByPath.get(a.getFilePath())?.length ?? 0;
        const bEntries = filesByPath.get(b.getFilePath())?.length ?? 0;
        if (aEntries !== bEntries) {
          return aEntries - bEntries;
        }

        // Then, prefer archives whose filename contains the game name
        const aGameName = path.basename(a.getFilePath()).includes(game.getName()) ? 1 : 0;
        const bGameName = path.basename(b.getFilePath()).includes(game.getName()) ? 1 : 0;
        return aGameName - bGameName;
      })
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
        }
        return unusedEntries.length === 0;
      });

    const archiveWithEveryRom = filteredArchivesWithEveryRom.at(0);

    // Do nothing if any of...
    if (
      // The Game has zero or one ROM, therefore, we don't really care where the file comes from,
      //  and we should respect any previous sorting of the input files
      gameRoms.length <= 1 ||
      // No input archive contains every ROM from this Game
      archiveWithEveryRom === undefined ||
      // We're extracting files, therefore, we don't really care where the file comes from, and we
      //  should respect any previous sorting of the input files
      this.options.shouldExtract()
    ) {
      return new Map(
        romsAndInputFiles
          .filter(([, inputFiles]) => inputFiles.length > 0)
          .map(([rom, inputFiles]) => [rom, inputFiles[0]]),
      );
    }

    // An Archive was found, use that as the only possible input file
    // For each of this Game's ROMs, find the matching ArchiveEntry from this Archive
    return new Map(
      romsAndInputFiles.map(([rom, inputFiles]) => {
        this.progressBar.logTrace(
          `${dat.getName()}: ${game.getName()}: preferring input archive that contains every ROM: ${archiveWithEveryRom.getFilePath()}`,
        );
        let archiveEntry = inputFiles.find(
          (inputFile) => inputFile.getFilePath() === archiveWithEveryRom.getFilePath(),
        );

        if (
          !archiveEntry &&
          rom.getName().toLowerCase().endsWith('.cue') &&
          archiveWithEveryRom instanceof Chd
        ) {
          // We assumed this CHD was fine above, find its .cue file
          archiveEntry = filesByPath
            .get(archiveWithEveryRom.getFilePath())
            ?.find((file) => file.getExtractedFilePath().toLowerCase().endsWith('.cue'));
        }

        return [rom, archiveEntry as File];
      }),
    );
  }

  private shouldGenerateArchiveFile(
    dat: DAT,
    game: Game,
    release: Release | undefined,
    rom: ROM,
    romsToInputFiles: Map<ROM, File>,
  ): boolean {
    if (
      [...romsToInputFiles.values()].some(
        (inputFile) =>
          inputFile.getFileHeader() !== undefined || inputFile.getPatch() !== undefined,
      )
    ) {
      // At least one output file won't exactly match its input file, don't generate an archive
      // file
      return false;
    }

    if (
      romsToInputFiles.get(rom) instanceof ArchiveEntry &&
      !this.options.shouldZipRom(rom) &&
      !this.options.shouldExtractRom(rom)
    ) {
      // This ROM's input file is already archived, and we're not [re-]zipping or extracting, so
      // we want to leave it as-is. We'll check later if the input archive has excess files.
      return true;
    }

    // TODO(cemmer): delay this until after CandidatePatchGenerator
    if (
      this.options.getPatchFileCount() === 0 &&
      !this.options.getZipDatName() &&
      [...romsToInputFiles.entries()].every(
        ([inputRom, inputFile]) =>
          inputFile instanceof ArchiveEntry &&
          inputFile.getArchive() instanceof Zip &&
          this.options.shouldZipRom(inputRom) &&
          OutputFactory.getPath(this.options, dat, game, release, inputRom, inputFile).entryPath ===
            inputFile.getExtractedFilePath(),
      ) &&
      [...romsToInputFiles.values()]
        .map((inputFile) => inputFile.getFilePath())
        .reduce(ArrayPoly.reduceUnique(), []).length === 1
    ) {
      // Every ROM should be zipped, and every input file is already in the same zip, and the
      // archive entry paths match, so it's safe to copy the zip as-is
      return true;
    }

    // Return false by default
    return false;
  }

  private async getOutputFile(
    dat: DAT,
    game: Game,
    release: Release | undefined,
    rom: ROM,
    inputFile: File,
  ): Promise<File | undefined> {
    // Determine the output file's path
    let outputPathParsed: OutputPath;
    try {
      outputPathParsed = OutputFactory.getPath(this.options, dat, game, release, rom, inputFile);
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
    if (this.options.shouldZipRom(rom) && !(inputFile instanceof ArchiveFile)) {
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

  private logMissingRomFiles(
    dat: DAT,
    game: Game,
    release: Release | undefined,
    foundRomsWithFiles: ROMWithFiles[],
    missingRoms: ROM[],
  ): void {
    let message = `${dat.getName()}: ${game.getName()}: found ${foundRomsWithFiles.length.toLocaleString()} file${foundRomsWithFiles.length !== 1 ? 's' : ''}, missing ${missingRoms.length.toLocaleString()} file${missingRoms.length !== 1 ? 's' : ''}`;
    if (release?.getRegion()) {
      message += ` (${release?.getRegion()})`;
    }
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
    // Only games with only bin/cue files can have only a cue file missing
    const allCueBin = game
      .getRoms()
      .flat()
      .every((rom) => ['.bin', '.cue'].includes(path.extname(rom.getName()).toLowerCase()));
    if (foundRoms.length === 0 || !allCueBin) {
      return false;
    }

    const foundRomNames = new Set(foundRoms.map((rom) => rom.getName()));
    const missingCueRoms = game
      .getRoms()
      .filter(
        (rom) =>
          !foundRomNames.has(rom.getName()) && path.extname(rom.getName()).toLowerCase() === '.cue',
      );
    const missingNonCueRoms = game
      .getRoms()
      .filter(
        (rom) =>
          !foundRomNames.has(rom.getName()) && path.extname(rom.getName()).toLowerCase() !== '.cue',
      );
    return missingCueRoms.length > 0 && missingNonCueRoms.length === 0;
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
          ?.find((foundFile) => foundFile.getFilePath() === inputFile.getFilePath());
      })
      .filter((inputFile) => inputFile instanceof ArchiveEntry || inputFile instanceof ArchiveFile);
    // ...then translate those ArchiveEntries into a list of unique Archives
    const inputArchives = inputArchiveEntries
      .map((archiveEntry) => archiveEntry.getArchive())
      .filter(ArrayPoly.filterUniqueMapped((archive) => archive.getFilePath()));

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
    if (
      this.options.shouldZip() ||
      this.options.shouldExtract() ||
      this.options.getAllowExcessSets()
    ) {
      // We don't particularly care where input files come from
      return [];
    }

    // Find the Archive's entries (all of them, not just ones that match ROMs in this Game)
    // NOTE(cemmer): we need to use hashCode() because a Game may have duplicate ROMs that all got
    //  matched to the same input file, so not every archive entry may be in {@link inputFiles}
    const archiveEntryHashCodes = new Set(
      inputFiles
        .filter(
          (file) => file.getFilePath() === archive.getFilePath() && file instanceof ArchiveEntry,
        )
        .map((entry) => entry.hashCode()),
    );

    // Find which of the Archive's entries didn't match to a ROM from this Game
    return (indexedFiles.getFilesByFilePath().get(archive.getFilePath()) ?? []).filter(
      (file): file is ArchiveEntry<Archive> => {
        if (!(file instanceof ArchiveEntry)) {
          return false;
        }

        return (
          (!(archive instanceof Chd) ||
            !file.getExtractedFilePath().toLowerCase().endsWith('.cue')) &&
          !archiveEntryHashCodes.has(file.hashCode())
        );
      },
    );
  }
}
