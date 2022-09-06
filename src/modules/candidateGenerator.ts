import ProgressBar, { Symbols } from '../console/progressBar.js';
import ArchiveEntry from '../types/files/archiveEntry.js';
import File from '../types/files/file.js';
import DAT from '../types/logiqx/dat.js';
import Parent from '../types/logiqx/parent.js';
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

    const crc32ToInputFiles = await CandidateGenerator.indexFilesByCrc(inputRomFiles);
    await this.progressBar.logInfo(`${dat.getName()}: ${crc32ToInputFiles.size} unique ROM CRC32s found`);

    await this.progressBar.setSymbol(Symbols.GENERATING);
    await this.progressBar.reset(dat.getParents().length);

    // For each parent, try to generate a parent candidate
    dat.getParents().forEach((parent) => {
      this.progressBar.increment();

      const releaseCandidates: ReleaseCandidate[] = [];

      // For every game
      parent.getGames().forEach((game) => {
        // For every release (ensuring at least one), find all release candidates
        const releases = game.getReleases().length ? game.getReleases() : [undefined];
        releases.forEach((release) => {
          // For each Game's ROM, find the matching File
          const romFiles = game.getRoms()
            .map((rom) => crc32ToInputFiles.get(rom.getCrc32()))
            .filter((file) => file) as File[];

          // Ignore the Game if not every File is present
          const missingRomFiles = game.getRoms().length - romFiles.length;
          if (missingRomFiles > 0) {
            if (romFiles.length > 0) {
              let message = `Missing ${missingRomFiles.toLocaleString()} file${missingRomFiles !== 1 ? 's' : ''} for: ${game.getName()}`;
              if (release?.getRegion()) {
                message += ` (${release?.getRegion()})`;
              }
              this.progressBar.logWarn(message);
            }
            return;
          }

          releaseCandidates.push(new ReleaseCandidate(game, release, game.getRoms(), romFiles));
        });
      });

      output.set(parent, releaseCandidates);
    });

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
}
