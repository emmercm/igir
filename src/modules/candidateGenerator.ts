import ProgressBar, { Symbols } from '../console/progressBar.js';
import ArchiveEntry from '../types/files/archiveEntry.js';
import File from '../types/files/file.js';
import DAT from '../types/logiqx/dat.js';
import Game from '../types/logiqx/game.js';
import Parent from '../types/logiqx/parent.js';
import Release from '../types/logiqx/release.js';
import ReleaseCandidate from '../types/releaseCandidate.js';

/**
 * For every {@link Parent} in the {@link DAT}, look for its {@link ROM}s in the scanned ROM list,
 * and return a set of candidate files.
 *
 * This class may be run concurrently with other classes.
 */
export default class CandidateGenerator {
  private readonly progressBar: ProgressBar;

  constructor(progressBar: ProgressBar) {
    this.progressBar = progressBar;
  }

  async generate(
    dat: DAT,
    inputRomFiles: File[],
  ): Promise<Map<Parent, ReleaseCandidate[]>> {
    await this.progressBar.logInfo(`${dat.getName()}: Generating candidates`);

    const output = new Map<Parent, ReleaseCandidate[]>();
    if (!inputRomFiles.length) {
      return output;
    }

    // TODO(cemmer): ability to index files by some other property such as name
    const crc32ToInputFiles = await CandidateGenerator.indexFilesByCrc(inputRomFiles);
    await this.progressBar.logInfo(`${dat.getName()}: ${crc32ToInputFiles.size} unique ROM CRC32s found`);

    await this.progressBar.setSymbol(Symbols.GENERATING);
    await this.progressBar.reset(dat.getParents().length);

    // TODO(cemmer): ability to work without DATs, generating a parent/game/release per file
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
            game,
            release,
            crc32ToInputFiles,
          );
          if (releaseCandidate) {
            releaseCandidates.push(releaseCandidate);
          }
        }
      }

      output.set(parent, releaseCandidates);
    }

    const totalCandidates = [...output.values()].reduce((sum, rc) => sum + rc.length, 0);
    await this.progressBar.logInfo(`${dat.getName()}: ${totalCandidates} candidate${totalCandidates !== 1 ? 's' : ''} found`);

    return output;
  }

  private static async indexFilesByCrc(files: File[]): Promise<Map<string, File>> {
    return files.reduce(async (accPromise, file) => {
      const acc = await accPromise;
      if (acc.has(await file.getCrc32())) {
        // Have already seen file, prefer non-archived files
        const existing = acc.get(await file.getCrc32()) as File;
        if (!(file instanceof ArchiveEntry) && existing instanceof ArchiveEntry) {
          acc.set(await file.getCrc32(), file);
        }
      } else {
        // Haven't seen file yet, store it
        acc.set(await file.getCrc32(), file);
      }
      return acc;
    }, Promise.resolve(new Map<string, File>()));
  }

  private async buildReleaseCandidateForRelease(
    game: Game,
    release: Release | undefined,
    crc32ToInputFiles: Map<string, File>,
  ): Promise<ReleaseCandidate | undefined> {
    // For each Game's ROM, find the matching File
    const romFiles = game.getRoms()
      .map((rom) => crc32ToInputFiles.get(rom.getCrc32()))
      .filter((file) => file) as File[];

    // Ignore the Game if not every File is present
    const missingRomFiles = game.getRoms().length - romFiles.length;
    if (missingRomFiles > 0) {
      await this.logMissingRomFiles(game, release, romFiles);
      return undefined;
    }

    return new ReleaseCandidate(game, release, game.getRoms(), romFiles);
  }

  private async logMissingRomFiles(
    game: Game,
    release: Release | undefined,
    existingRomFiles: File[],
  ): Promise<void> {
    if (!existingRomFiles.length) {
      return;
    }

    const existingRomFileCrcs = await Promise.all(existingRomFiles.map((file) => file.getCrc32()));
    const missingRomFiles = game.getRoms()
      .filter((rom) => existingRomFileCrcs.indexOf(rom.getCrc32()) === -1);

    let message = `Missing ${missingRomFiles.toLocaleString()} file${missingRomFiles.length !== 1 ? 's' : ''} for: ${game.getName()}`;
    if (release?.getRegion()) {
      message += ` (${release?.getRegion()})`;
    }
    missingRomFiles.forEach((rom) => {
      message += `\n  ${rom.getName()}`;
    });
    await this.progressBar.logWarn(message);
  }
}
