import path from 'path';

import ProgressBar, { Symbols } from '../console/progressBar.js';
import Zip from '../types/archives/zip.js';
import ArchiveEntry from '../types/files/archiveEntry.js';
import File from '../types/files/file.js';
import DAT from '../types/logiqx/dat.js';
import Game from '../types/logiqx/game.js';
import Parent from '../types/logiqx/parent.js';
import Release from '../types/logiqx/release.js';
import ROM from '../types/logiqx/rom.js';
import Options from '../types/options.js';
import ReleaseCandidate from '../types/releaseCandidate.js';
import ROMWithFiles from '../types/romWithFiles.js';
import CandidateFilter from './candidateFilter.js';
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
    super(progressBar, CandidateFilter.name);
    this.options = options;
  }

  async generate(
    dat: DAT,
    inputRomFiles: File[],
  ): Promise<Map<Parent, ReleaseCandidate[]>> {
    await this.progressBar.logInfo(`${dat.getName()}: Generating candidates`);

    const output = new Map<Parent, ReleaseCandidate[]>();
    if (!inputRomFiles.length) {
      await this.progressBar.logDebug(`${dat.getName()}: No input ROMs to make candidates from`);
      return output;
    }

    await this.progressBar.setSymbol(Symbols.GENERATING);
    await this.progressBar.reset(dat.getParents().length);

    // TODO(cemmer): only do this once globally, not per DAT
    // TODO(cemmer): ability to index files by some other property such as name
    const hashCodeToInputFiles = CandidateGenerator.indexFilesByHashCode(inputRomFiles);
    await this.progressBar.logDebug(`${dat.getName()}: ${hashCodeToInputFiles.size.toLocaleString()} unique ROMs found`);

    // For each parent, try to generate a parent candidate
    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < dat.getParents().length; i += 1) {
      const parent = dat.getParents()[i];

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

      await this.progressBar.logTrace(`${dat.getName()}: ${parent.getName()}: found ${releaseCandidates.length.toLocaleString()} candidates`);
      output.set(parent, releaseCandidates);

      await this.progressBar.increment();
    }

    const totalCandidates = [...output.values()].reduce((sum, rc) => sum + rc.length, 0);
    await this.progressBar.logDebug(`${dat.getName()}: ${totalCandidates.toLocaleString()} candidate${totalCandidates !== 1 ? 's' : ''} found`);

    await this.progressBar.logInfo(`${dat.getName()}: Done generating candidates`);
    return output;
  }

  private static indexFilesByHashCode(files: File[]): Map<string, File> {
    const filesByHashCodeWithHeader = new Map<string, File>();
    const filesByHashCodeWithoutHeader = new Map<string, File>();

    files.forEach((file) => {
      // Index on full file contents
      this.setFileInMap(filesByHashCodeWithHeader, file.hashCodeWithHeader(), file);

      // Optionally index without a header
      if (file.getFileHeader()) {
        this.setFileInMap(filesByHashCodeWithoutHeader, file.hashCodeWithoutHeader(), file);
      }
    });

    // Merge the two maps, preferring files that were indexed on their full file contents
    const filesByHashCode = filesByHashCodeWithHeader;
    filesByHashCodeWithoutHeader.forEach((file, hashCodeWithoutHeader) => {
      if (!filesByHashCode.has(hashCodeWithoutHeader)) {
        filesByHashCode.set(hashCodeWithoutHeader, file);
      }
    });
    return filesByHashCode;
  }

  private static setFileInMap<K>(map: Map<K, File>, key: K, file: File): void {
    if (!map.has(key)) {
      map.set(key, file);
      return;
    }

    // Prefer non-archived files
    const existing = map.get(key) as File;
    if (existing instanceof ArchiveEntry && !(file instanceof ArchiveEntry)) {
      map.set(key, file);
    }
  }

  private async buildReleaseCandidateForRelease(
    dat: DAT,
    game: Game,
    release: Release | undefined,
    hashCodeToInputFiles: Map<string, File>,
  ): Promise<ReleaseCandidate | undefined> {
    // For each Game's ROM, find the matching File
    const romFiles = await Promise.all(
      game.getRoms().map(async (rom) => {
        // NOTE(cemmer): if the ROM's CRC includes a header, then this will only find headered
        //  files. If the ROM's CRC excludes a header, this can find either a headered or non-
        //  headered file.
        const romFile = hashCodeToInputFiles.get(rom.hashCode());
        if (romFile) {
          try {
            const outputFile = await this.getOutputFile(dat, game, release, rom, romFile);
            const romWithFiles = new ROMWithFiles(rom, romFile, outputFile);
            return [rom, romWithFiles];
          } catch (e) {
            await this.progressBar.logWarn(`${dat.getName()}: ${game.getName()}: ${e}`);
            return [rom, undefined];
          }
        }
        return [rom, undefined];
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
        await this.logMissingRomFiles(dat, game, release, missingRoms);
      }
      return undefined;
    }

    return new ReleaseCandidate(game, release, foundRomsWithFiles);
  }

  private async getOutputFile(
    dat: DAT,
    game: Game,
    release: Release | undefined,
    rom: ROM,
    inputFile: File,
  ): Promise<File> {
    const { base, ...parsedPath } = path.parse(rom.getName());
    if (parsedPath.ext && inputFile.getFileHeader()) {
      // If the ROM has a header then we're going to ignore the file extension from the DAT
      if (this.options.canRemoveHeader(dat, parsedPath.ext)) {
        parsedPath.ext = inputFile.getFileHeader()?.unheaderedFileExtension as string;
      } else {
        parsedPath.ext = inputFile.getFileHeader()?.headeredFileExtension as string;
      }
    }
    const outputEntryPath = path.format(parsedPath);

    if (this.options.shouldZip(rom.getName())) {
      const outputFilePath = this.options.getOutputFileParsed(
        dat,
        inputFile.getFilePath(),
        game,
        release,
        `${game.getName()}.zip`,
      );
      return ArchiveEntry.entryOf(
        new Zip(outputFilePath),
        outputEntryPath,
        inputFile.getSize(),
        inputFile.getCrc32(),
      );
    }

    const outputFilePath = this.options.getOutputFileParsed(
      dat,
      inputFile.getFilePath(),
      game,
      release,
      outputEntryPath,
    );
    return File.fileOf(
      outputFilePath,
      inputFile.getSize(),
      inputFile.getCrc32(),
    );
  }

  private async logMissingRomFiles(
    dat: DAT,
    game: Game,
    release: Release | undefined,
    missingRoms: ROM[],
  ): Promise<void> {
    let message = `${dat.getName()}: Missing ${missingRoms.length.toLocaleString()} file${missingRoms.length !== 1 ? 's' : ''} for: ${game.getName()}`;
    if (release?.getRegion()) {
      message += ` (${release?.getRegion()})`;
    }
    missingRoms.forEach((rom) => {
      message += `\n  ${rom.getName()}`;
    });
    await this.progressBar.logWarn(message);
  }
}
