import path from 'node:path';

import { Semaphore } from 'async-mutex';

import ProgressBar, { ProgressBarSymbol } from '../console/progressBar.js';
import ArrayPoly from '../polyfill/arrayPoly.js';
import fsPoly from '../polyfill/fsPoly.js';
import DAT from '../types/dats/dat.js';
import Game from '../types/dats/game.js';
import Parent from '../types/dats/parent.js';
import Release from '../types/dats/release.js';
import ROM from '../types/dats/rom.js';
import Archive from '../types/files/archives/archive.js';
import ArchiveEntry from '../types/files/archives/archiveEntry.js';
import ArchiveFile from '../types/files/archives/archiveFile.js';
import Chd from '../types/files/archives/chd/chd.js';
import Zip from '../types/files/archives/zip.js';
import File from '../types/files/file.js';
import IndexedFiles from '../types/indexedFiles.js';
import Options from '../types/options.js';
import OutputFactory, { OutputPath } from '../types/outputFactory.js';
import ReleaseCandidate from '../types/releaseCandidate.js';
import ROMWithFiles from '../types/romWithFiles.js';
import Module from './module.js';

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
  async generate(
    dat: DAT,
    indexedFiles: IndexedFiles,
  ): Promise<Map<Parent, ReleaseCandidate[]>> {
    if (indexedFiles.getFiles().length === 0) {
      this.progressBar.logTrace(`${dat.getNameShort()}: no input ROMs to make candidates from`);
      return new Map(dat.getParents().map((parent) => ([parent, []])));
    }

    const output = new Map<Parent, ReleaseCandidate[]>();
    const parents = dat.getParents();

    this.progressBar.logTrace(`${dat.getNameShort()}: generating candidates`);
    await this.progressBar.setSymbol(ProgressBarSymbol.GENERATING);
    await this.progressBar.reset(parents.length);

    // For each parent, try to generate a parent candidate
    await Promise.all(parents.map(async (
      parent,
    ) => CandidateGenerator.THREAD_SEMAPHORE.runExclusive(async () => {
      await this.progressBar.incrementProgress();
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

        this.progressBar.logTrace(`${dat.getNameShort()}: ${game.getName()}: found ${foundCandidates.toLocaleString()} candidate${foundCandidates !== 1 ? 's' : ''}`);
      }

      this.progressBar.logTrace(`${dat.getNameShort()}: ${parent.getName()} (parent): found ${releaseCandidates.length.toLocaleString()} candidate${releaseCandidates.length !== 1 ? 's' : ''}`);
      output.set(parent, releaseCandidates);

      this.progressBar.removeWaitingMessage(waitingMessage);
      await this.progressBar.incrementDone();
    })));

    const size = [...output.values()]
      .flat()
      .flatMap((releaseCandidate) => releaseCandidate.getRomsWithFiles())
      .reduce((sum, romWithFiles) => sum + romWithFiles.getRom().getSize(), 0);
    const totalCandidates = [...output.values()].reduce((sum, rc) => sum + rc.length, 0);
    this.progressBar.logTrace(`${dat.getNameShort()}: generated ${fsPoly.sizeReadable(size)} of ${totalCandidates.toLocaleString()} candidate${totalCandidates !== 1 ? 's' : ''} for ${output.size.toLocaleString()} parent${output.size !== 1 ? 's' : ''}`);

    this.progressBar.logTrace(`${dat.getNameShort()}: done generating candidates`);
    return output;
  }

  private async buildReleaseCandidateForRelease(
    dat: DAT,
    game: Game,
    release: Release | undefined,
    indexedFiles: IndexedFiles,
  ): Promise<ReleaseCandidate | undefined> {
    const romsToInputFiles = this.getInputFilesForGame(dat, game, indexedFiles);

    // For each Game's ROM, find the matching File
    const romFiles = await Promise.all(
      game.getRoms().map(async (rom) => {
        if (!romsToInputFiles.has(rom)) {
          return [rom, undefined];
        }
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
        if (inputFile.getFileHeader()
          // ...and we want a headered ROM
          && ((inputFile.getCrc32() !== undefined && inputFile.getCrc32() === rom.getCrc32())
            || (inputFile.getMd5() !== undefined && inputFile.getMd5() === rom.getMd5())
            || (inputFile.getSha1() !== undefined && inputFile.getSha1() === rom.getSha1())
            || (inputFile.getSha256() !== undefined && inputFile.getSha256() === rom.getSha256()))
          // ...and we shouldn't remove the header
          && !this.options.canRemoveHeader(
            dat,
            path.extname(inputFile.getExtractedFilePath()),
          )
        ) {
          // ...then forget the input file's header, so that we don't later remove it
          this.progressBar.logTrace(`${dat.getNameShort()}: ${game.getName()}: not removing header, ignoring that one was found for: ${inputFile.toString()}`);
          inputFile = inputFile.withoutFileHeader();
        }

        // If the input file is headered...
        if (inputFile.getFileHeader()
          // ...and we DON'T want a headered ROM
          && !((inputFile.getCrc32() !== undefined && inputFile.getCrc32() === rom.getCrc32())
            || (inputFile.getMd5() !== undefined && inputFile.getMd5() === rom.getMd5())
            || (inputFile.getSha1() !== undefined && inputFile.getSha1() === rom.getSha1())
            || (inputFile.getSha256() !== undefined && inputFile.getSha256() === rom.getSha256()))
          // ...and we're writing file links
          && this.options.shouldLink()
        ) {
          // ...then we can't use this file
          this.progressBar.logTrace(`${dat.getNameShort()}: ${game.getName()}: can't use headered ROM as target for link: ${inputFile.toString()}`);
          return [rom, undefined];
        }

        /**
         * If the matched input file is from an archive, and we're not zipping or extracting, then
         * treat the file as "raw" so it can be copied/moved as-is.
         * Matches {@link ROMHeaderProcessor.getFileWithHeader}
         */
        if (inputFile instanceof ArchiveEntry
          && !this.options.shouldZipFile(rom.getName())
          && !this.options.shouldExtract()
        ) {
          try {
            // Note: we're delaying checksum calculation for now, {@link CandidateArchiveFileHasher}
            //  will handle it later
            inputFile = new ArchiveFile(
              inputFile.getArchive(),
              { checksumBitmask: inputFile.getChecksumBitmask() },
            );
          } catch (error) {
            this.progressBar.logWarn(`${dat.getNameShort()}: ${game.getName()}: ${error}`);
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
          this.progressBar.logError(`${dat.getNameShort()}: ${game.getName()}: ${error}`);
          return [rom, undefined];
        }
      }),
    ) satisfies [ROM, ROMWithFiles | undefined][];

    const foundRomsWithFiles = romFiles
      .map(([, romWithFiles]) => romWithFiles)
      .filter(ArrayPoly.filterNotNullish);
    if (romFiles.length > 0 && foundRomsWithFiles.length === 0) {
      // The Game has ROMs, but none were found
      return undefined;
    }

    const missingRoms = romFiles
      .filter(([, romWithFiles]) => !romWithFiles)
      .map(([rom]) => rom);

    if (missingRoms.length > 0 && CandidateGenerator.onlyCueFilesMissingFromChd(
      game,
      foundRomsWithFiles.map((romWithFiles) => romWithFiles.getRom()),
    )) {
      const inputChds = foundRomsWithFiles
        .map((romWithFiles) => romWithFiles.getOutputFile())
        .filter((file) => path.extname(file.getFilePath()).toLowerCase() === '.chd')
        .filter(ArrayPoly.filterUniqueMapped((file) => file.hashCode()));
      if (inputChds.length === 1) {
        this.progressBar.logTrace(`${dat.getNameShort()}: ${game.getName()}: `);
        return new ReleaseCandidate(game, release, [
          ...foundRomsWithFiles,
          // Fill in missing .cue files for reporting reasons
          ...missingRoms.map((rom) => new ROMWithFiles(
            rom,
            foundRomsWithFiles[0].getInputFile(),
            foundRomsWithFiles[0].getOutputFile(),
          )),
        ]);
      }
    }

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

    return new ReleaseCandidate(game, release, foundRomsWithFiles);
  }

  private getInputFilesForGame(
    dat: DAT,
    game: Game,
    indexedFiles: IndexedFiles,
  ): Map<ROM, File> {
    const romsAndInputFiles = game.getRoms().map((rom) => ([
      rom,
      indexedFiles.findFiles(rom) ?? [],
    ])) satisfies [ROM, File[]][];

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
        .map((file): Archive => (file as ArchiveEntry<never>).getArchive())
        .forEach((archive) => {
          const roms = map.get(archive) ?? [];
          roms.push(rom);
          // We need to filter out duplicate ROMs because of Games that contain duplicate ROMs, e.g.
          //  optical media games that have the same track multiple times.
          const uniqueRoms = roms.reduce(ArrayPoly.reduceUnique(), []);
          map.set(archive, uniqueRoms);
        });
      return map;
    }, new Map<Archive, ROM[]>());

    // Filter to the Archives that contain every ROM in this Game
    const archivesWithEveryRom = [...inputArchivesToRoms.entries()]
      .filter(([archive, roms]) => {
        if (roms.length === game.getRoms().length) {
          return true;
        }
        // If there is a CHD with every .bin file, and we're raw-copying it, then assume its .cue
        // file is accurate
        return archive instanceof Chd
          && !game.getRoms().some((rom) => this.options.shouldZipFile(rom.getName()))
          && !this.options.shouldExtract()
          && CandidateGenerator.onlyCueFilesMissingFromChd(game, roms);
      })
      .map(([archive]) => archive);
    const archiveWithEveryRom = archivesWithEveryRom.at(0);

    // Do nothing if any of...
    if (
      // The Game has zero or one ROM, therefore, we don't really care where the file comes from,
      //  and we should respect any previous sorting of the input files
      game.getRoms().length <= 1
      // No input archive contains every ROM from this Game
      || archiveWithEveryRom === undefined
      // We're extracting files, therefore, we don't really care where the file comes from, and we
      //  should respect any previous sorting of the input files
      || this.options.shouldExtract()
    ) {
      return new Map(romsAndInputFiles
        .filter(([, inputFiles]) => inputFiles.length)
        .map(([rom, inputFiles]) => [rom, inputFiles[0]]));
    }

    // An Archive was found, use that as the only possible input file
    // For each of this Game's ROMs, find the matching ArchiveEntry from this Archive
    return new Map(romsAndInputFiles.map(([rom, inputFiles]) => {
      this.progressBar.logTrace(`${dat.getNameShort()}: ${game.getName()}: preferring input archive that contains every ROM: ${archiveWithEveryRom.getFilePath()}`);
      const archiveEntry = inputFiles.find((
        inputFile,
      ) => inputFile.getFilePath() === archiveWithEveryRom.getFilePath()) as File;
      return [rom, archiveEntry];
    }));
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
      outputPathParsed = OutputFactory.getPath(
        this.options,
        dat,
        game,
        release,
        rom,
        inputFile,
      );
    } catch (error) {
      this.progressBar.logTrace(`${dat.getNameShort()}: ${game.getName()}: ${error}`);
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
    if (this.options.shouldZipFile(rom.getName())) {
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
    let message = `${dat.getNameShort()}: ${game.getName()}: found ${foundRomsWithFiles.length.toLocaleString()} file${foundRomsWithFiles.length !== 1 ? 's' : ''}, missing ${missingRoms.length.toLocaleString()} file${missingRoms.length !== 1 ? 's' : ''}`;
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
        let message = `${dat.getNameShort()}: no single archive contains all necessary files, cannot ${this.options.writeString()} these different input files to: ${duplicateOutput}:`;
        conflictedInputFiles.forEach((conflictedInputFile) => { message += `\n  ${conflictedInputFile}`; });
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
  private static onlyCueFilesMissingFromChd(
    game: Game,
    foundRoms: ROM[],
  ): boolean {
    // Only games with only bin/cue files can have only a cue file missing
    const allCueBin = game.getRoms()
      .flat()
      .every((rom) => ['.bin', '.cue'].includes(path.extname(rom.getName()).toLowerCase()));
    if (foundRoms.length === 0 || !allCueBin) {
      return false;
    }

    const foundRomNames = new Set(foundRoms.map((rom) => rom.getName()));
    const missingCueRoms = game.getRoms()
      .filter((rom) => !foundRomNames.has(rom.getName()))
      .filter((rom) => path.extname(rom.getName()).toLowerCase() === '.cue');
    const missingNonCueRoms = game.getRoms()
      .filter((rom) => !foundRomNames.has(rom.getName()))
      .filter((rom) => path.extname(rom.getName()).toLowerCase() !== '.cue');
    return missingCueRoms.length > 0 && missingNonCueRoms.length === 0;
  }
}
