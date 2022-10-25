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

/**
 * For every {@link Parent} in the {@link DAT}, look for its {@link ROM}s in the scanned ROM list,
 * and return a set of candidate files.
 *
 * This class may be run concurrently with other classes.
 */
export default class CandidateGenerator {
  private readonly options: Options;

  private readonly progressBar: ProgressBar;

  constructor(options: Options, progressBar: ProgressBar) {
    this.options = options;
    this.progressBar = progressBar;
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
    await this.progressBar.logInfo(`${dat.getName()}: ${hashCodeToInputFiles.size} unique ROMs found`);

    // For each parent, try to generate a parent candidate
    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < dat.getParents().length; i += 1) {
      const parent = dat.getParents()[i];
      await this.progressBar.increment();

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

      await this.progressBar.logInfo(`${dat.getName()}: Found ${releaseCandidates.length} candidates for ${parent}`);
      output.set(parent, releaseCandidates);
    }

    const totalCandidates = [...output.values()].reduce((sum, rc) => sum + rc.length, 0);
    await this.progressBar.logInfo(`${dat.getName()}: ${totalCandidates} candidate${totalCandidates !== 1 ? 's' : ''} found`);

    return output;
  }

  private static indexFilesByHashCode(files: File[]): Map<string, File> {
    return files.reduce((map, file) => {
      file.hashCodes().forEach((hashCode) => map.set(hashCode, file));
      return map;
    }, new Map<string, File>());
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
        const romFile = hashCodeToInputFiles.get(rom.hashCode());
        if (romFile) {
          const romWithFiles = new ROMWithFiles(
            rom,
            romFile,
            await this.getOutputFile(dat, game, rom, romFile),
          );
          return [rom, romWithFiles];
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
        await this.logMissingRomFiles(game, release, missingRoms);
      }
      return undefined;
    }

    return new ReleaseCandidate(game, release, foundRomsWithFiles);
  }

  private async getOutputFile(dat: DAT, game: Game, rom: ROM, inputFile: File): Promise<File> {
    const { base, ...parsedPath } = path.parse(rom.getName());
    if (parsedPath.ext && inputFile.getFileHeader()) {
      // If the ROM has a header then we're going to ignore the file extension from the DAT
      if (this.options.canRemoveHeader(parsedPath.ext)) {
        parsedPath.ext = inputFile.getFileHeader()?.unheaderedFileExtension as string;
      } else {
        parsedPath.ext = inputFile.getFileHeader()?.headeredFileExtension as string;
      }
    }
    const outputEntryPath = path.format(parsedPath);

    if (this.options.shouldZip(rom.getName())) {
      const outputFilePath = this.options.getOutput(
        dat,
        inputFile.getFilePath(),
        undefined,
        `${game.getName()}.zip`,
      );
      return ArchiveEntry.entryOf(
        new Zip(outputFilePath),
        outputEntryPath,
        inputFile.getSize(),
        inputFile.getCrc32(),
      );
    }

    const outputFilePath = this.options.getOutput(
      dat,
      inputFile.getFilePath(),
      game,
      outputEntryPath,
    );
    return File.fileOf(
      outputFilePath,
      inputFile.getSize(),
      inputFile.getCrc32(),
    );
  }

  private async logMissingRomFiles(
    game: Game,
    release: Release | undefined,
    missingRoms: ROM[],
  ): Promise<void> {
    let message = `Missing ${missingRoms.length.toLocaleString()} file${missingRoms.length !== 1 ? 's' : ''} for: ${game.getName()}`;
    if (release?.getRegion()) {
      message += ` (${release?.getRegion()})`;
    }
    missingRoms.forEach((rom) => {
      message += `\n  ${rom.getName()}`;
    });
    await this.progressBar.logWarn(message);
  }
}
