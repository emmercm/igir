import path from 'path';

import ProgressBar, { ProgressBarSymbol } from '../console/progressBar.js';
import fsPoly from '../polyfill/fsPoly.js';
import Archive from '../types/files/archives/archive.js';
import ArchiveEntry from '../types/files/archives/archiveEntry.js';
import Zip from '../types/files/archives/zip.js';
import File from '../types/files/file.js';
import DAT from '../types/logiqx/dat.js';
import Game from '../types/logiqx/game.js';
import Parent from '../types/logiqx/parent.js';
import Release from '../types/logiqx/release.js';
import ROM from '../types/logiqx/rom.js';
import Options from '../types/options.js';
import ReleaseCandidate from '../types/releaseCandidate.js';
import ROMWithFiles from '../types/romWithFiles.js';
import DATFilter from './datFilter.js';
import Module from './module.js';

/**
 * For every {@link Parent} in the {@link DAT}, look for its {@link ROM}s in the scanned ROM list,
 * and return a set of candidate files.
 *
 * This class may be run concurrently with other classes.
 */
export default class CandidateGenerator extends Module {
  private readonly options: Options;

  constructor(options: Options, progressBar: ProgressBar) {
    super(progressBar, DATFilter.name);
    this.options = options;
  }

  async generate(
    dat: DAT,
    hashCodeToInputFiles: Map<string, File[]>,
  ): Promise<Map<Parent, ReleaseCandidate[]>> {
    this.progressBar.logInfo(`${dat.getNameShort()}: generating candidates`);

    const output = new Map<Parent, ReleaseCandidate[]>();
    if (!hashCodeToInputFiles.size) {
      this.progressBar.logDebug(`${dat.getNameShort()}: no input ROMs to make candidates from`);
      return output;
    }

    const parents = dat.getParents();
    await this.progressBar.setSymbol(ProgressBarSymbol.GENERATING);
    await this.progressBar.reset(parents.length);

    // For each parent, try to generate a parent candidate
    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < parents.length; i += 1) {
      const parent = parents[i];
      await this.progressBar.incrementProgress();
      const waitingMessage = `${parent.getName()} ...`;
      this.progressBar.addWaitingMessage(waitingMessage);

      const releaseCandidates: ReleaseCandidate[] = [];

      // For every game
      for (let j = 0; j < parent.getGames().length; j += 1) {
        const game = parent.getGames()[j];

        // For every release (ensuring at least one), find all release candidates
        const releases = game.getReleases().length ? game.getReleases() : [undefined];
        for (let k = 0; k < releases.length; k += 1) {
          const release = releases[k];

          const releaseCandidate = await this.buildReleaseCandidateForRelease(
            dat,
            game,
            release,
            hashCodeToInputFiles,
          );
          if (releaseCandidate) {
            releaseCandidates.push(releaseCandidate);
          }
        }
      }

      this.progressBar.logTrace(`${dat.getNameShort()}: ${parent.getName()}: found ${releaseCandidates.length.toLocaleString()} candidate${releaseCandidates.length !== 1 ? 's' : ''}`);
      output.set(parent, releaseCandidates);

      this.progressBar.removeWaitingMessage(waitingMessage);
      await this.progressBar.incrementDone();
    }

    const size = [...output.values()]
      .flatMap((releaseCandidates) => releaseCandidates)
      .flatMap((releaseCandidate) => releaseCandidate.getRomsWithFiles())
      .reduce((sum, romWithFiles) => sum + romWithFiles.getRom().getSize(), 0);
    const totalCandidates = [...output.values()].reduce((sum, rc) => sum + rc.length, 0);
    this.progressBar.logDebug(`${dat.getNameShort()}: generated ${fsPoly.sizeReadable(size)} of ${totalCandidates.toLocaleString()} candidate${totalCandidates !== 1 ? 's' : ''} for ${output.size.toLocaleString()} parent${output.size !== 1 ? 's' : ''}`);

    this.progressBar.logInfo(`${dat.getNameShort()}: done generating candidates`);
    return output;
  }

  private async buildReleaseCandidateForRelease(
    dat: DAT,
    game: Game,
    release: Release | undefined,
    hashCodeToInputFiles: Map<string, File[]>,
  ): Promise<ReleaseCandidate | undefined> {
    const romsToInputFiles = this.getInputFilesForGame(game, hashCodeToInputFiles);

    // For each Game's ROM, find the matching File
    const romFiles = await Promise.all(
      game.getRoms().map(async (rom) => {
        // NOTE(cemmer): if the ROM's CRC includes a header, then this will only find headered
        //  files. If the ROM's CRC excludes a header, this can find either a headered or non-
        //  headered file.
        const originalInputFile = romsToInputFiles.get(rom);
        if (!originalInputFile) {
          return [rom, undefined];
        }

        // If we're not writing (report only) then just use the input file for the output file
        if (!this.options.shouldWrite()) {
          return [rom, new ROMWithFiles(rom, originalInputFile, originalInputFile)];
        }

        /**
         * If the matched input file is from an archive, and we're not zipping or extracting, then
         * treat the file as "raw" so it can be copied/moved as-is.
         * Matches {@link HeaderProcessor.getFileWithHeader}
         */
        let finalInputFile = originalInputFile;
        if (originalInputFile instanceof ArchiveEntry
          && !this.options.shouldZip(rom.getName())
          && !this.options.shouldExtract()
        ) {
          // No automatic header removal will be performed when raw-copying an archive, so return no
          //  match if we wanted a headerless ROM but got a headered one.
          if (rom.hashCode() !== originalInputFile.hashCodeWithHeader()
            && rom.hashCode() === originalInputFile.hashCodeWithoutHeader()
          ) {
            return [rom, undefined];
          }

          finalInputFile = await originalInputFile.getArchive().asRawFile();
        }

        try {
          const outputFile = await this.getOutputFile(dat, game, release, rom, finalInputFile);
          const romWithFiles = new ROMWithFiles(rom, finalInputFile, outputFile);
          return [rom, romWithFiles];
        } catch (e) {
          this.progressBar.logInfo(`${dat.getNameShort()}: ${game.getName()}: ${e}`);
          return [rom, undefined];
        }
      }),
    ) as [ROM, ROMWithFiles | undefined][];

    const foundRomsWithFiles = romFiles
      .filter(([, romWithFiles]) => romWithFiles)
      .map(([, romWithFiles]) => romWithFiles) as ROMWithFiles[];
    const missingRoms = romFiles
      .filter(([, romWithFiles]) => !romWithFiles)
      .map(([rom]) => rom);

    // Ignore the Game if not every File is present
    if (missingRoms.length > 0) {
      if (foundRomsWithFiles.length > 0) {
        this.logMissingRomFiles(dat, game, release, foundRomsWithFiles, missingRoms);
      }
      return undefined;
    }

    // Ignore the Game with conflicting input->output files
    if (this.hasConflictingOutputFiles(foundRomsWithFiles)) {
      return undefined;
    }

    return new ReleaseCandidate(game, release, foundRomsWithFiles);
  }

  private getInputFilesForGame(
    game: Game,
    hashCodeToInputFiles: Map<string, File[]>,
  ): Map<ROM, File> {
    let romsAndInputFiles = game.getRoms().map((rom) => ([
      rom,
      (hashCodeToInputFiles.get(rom.hashCode()) || []),
    ])) as [ROM, File[]][];

    // Detect if there is one input archive that contains every ROM, and prefer to use its entries.
    // If we don't do this, here are two situations that can happen:
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
          const roms = map.get(archive) || [];
          roms.push(rom);
          // We need to filter out duplicate ROMs because of Games that contain duplicate ROMs, e.g.
          //  optical media games that have the same track multiple times.
          const uniqueRoms = roms.filter((val, idx, values) => values.indexOf(val) === idx);
          map.set(archive, uniqueRoms);
        });
      return map;
    }, new Map<Archive, ROM[]>());

    // Only filter the input files if this game has multiple ROMs, and we found some archives
    if (!this.options.shouldExtract() && game.getRoms().length > 1 && inputArchivesToRoms.size) {
      // Filter to the Archives that contain every ROM in this Game
      const archivesWithEveryRom = [...inputArchivesToRoms.entries()]
        .filter(([, roms]) => roms.length === game.getRoms().length)
        .map(([archive]) => archive);

      const archiveWithEveryRom = archivesWithEveryRom[0];
      if (archiveWithEveryRom) {
        // An Archive was found, use that as the only possible input file
        // For each of this Game's ROMs, find the matching ArchiveEntry from this Archive
        romsAndInputFiles = romsAndInputFiles.map(([rom, inputFiles]) => {
          const archiveEntry = inputFiles.find((
            inputFile,
          ) => inputFile.getFilePath() === archiveWithEveryRom.getFilePath()) as File;
          return [rom, [archiveEntry]];
        });
      }
    }

    return new Map(romsAndInputFiles
      .filter(([, inputFiles]) => inputFiles.length)
      .map(([rom, inputFiles]) => [rom, inputFiles[0]]));
  }

  private async getOutputFile(
    dat: DAT,
    game: Game,
    release: Release | undefined,
    rom: ROM,
    inputFile: File,
  ): Promise<File> {
    // Determine the output file's basename and archive entry path
    const [outputFileBasename, outputEntryPath] = this.options.getOutputBasenameAndEntryPath(
      dat,
      game,
      release,
      rom,
      inputFile,
    );
    const outputFilePath = this.options.getOutputFileParsed(
      dat,
      inputFile.getFilePath(),
      game,
      release,
      outputFileBasename,
    );

    // Determine the output CRC of the file
    let outputFileCrc = inputFile.getCrc32();
    if (inputFile.getFileHeader()
      && this.options.canRemoveHeader(dat, path.extname(outputEntryPath))
    ) {
      outputFileCrc = inputFile.getCrc32WithoutHeader();
    }

    // Determine the output file type
    if (this.options.shouldZip(rom.getName())) {
      // Should zip, return an archive entry within the zip
      return ArchiveEntry.entryOf(
        new Zip(outputFilePath),
        outputEntryPath,
        inputFile.getSize(),
        outputFileCrc,
      );
    } if (!(inputFile instanceof ArchiveEntry) || this.options.shouldExtract()) {
      // Should extract (if needed), return a raw file using the ROM's size/CRC
      return File.fileOf(
        outputFilePath,
        inputFile.getSize(),
        outputFileCrc,
      );
    }
    // Should leave archived
    const inputArchiveRaw = await inputFile.getArchive().asRawFile();
    return File.fileOf(
      outputFilePath,
      inputArchiveRaw.getSize(),
      inputArchiveRaw.getCrc32(),
    );
  }

  private logMissingRomFiles(
    dat: DAT,
    game: Game,
    release: Release | undefined,
    foundRomsWithFiles: ROMWithFiles[],
    missingRoms: ROM[],
  ): void {
    let message = `${dat.getNameShort()}: ${game.getName()}: found ${foundRomsWithFiles.length.toLocaleString()} file${missingRoms.length !== 1 ? 's' : ''}, missing ${missingRoms.length.toLocaleString()} file${missingRoms.length !== 1 ? 's' : ''}`;
    if (release?.getRegion()) {
      message += ` (${release?.getRegion()})`;
    }
    missingRoms.forEach((rom) => {
      message += `\n  ${rom.getName()}`;
    });
    this.progressBar.logDebug(message);
  }

  private hasConflictingOutputFiles(romsWithFiles: ROMWithFiles[]): boolean {
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
      .filter((outputPath, idx, outputPaths) => outputPaths.indexOf(outputPath) !== idx)
      .filter((duplicatePath, idx, duplicatePaths) => duplicatePaths
        .indexOf(duplicatePath) === idx)
      .sort();
    if (!duplicateOutputPaths.length) {
      // There are no duplicate non-archive output file paths
      return false;
    }

    /* eslint-disable no-await-in-loop */
    let hasConflict = false;
    for (let i = 0; i < duplicateOutputPaths.length; i += 1) {
      const duplicateOutput = duplicateOutputPaths[i];

      // For an output path that has multiple input paths, filter to only the unique input paths,
      //  and if there are still multiple input file paths then we won't be able to resolve this
      //  at write time
      const conflictedInputFiles = romsWithFiles
        .filter((romWithFiles) => romWithFiles.getOutputFile().getFilePath() === duplicateOutput)
        .map((romWithFiles) => romWithFiles.getInputFile().toString())
        .filter((inputFile, idx, inputFiles) => inputFiles.indexOf(inputFile) === idx);
      if (conflictedInputFiles.length > 1) {
        hasConflict = true;
        let message = `Cannot ${this.options.writeString()} different files to: ${duplicateOutput}:`;
        conflictedInputFiles.forEach((conflictedInputFile) => { message += `\n  ${conflictedInputFile}`; });
        this.progressBar.logWarn(message);
      }
    }
    return hasConflict;
  }
}
