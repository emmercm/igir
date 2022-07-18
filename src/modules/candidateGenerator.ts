import DAT from '../types/logiqx/dat.js';
import Parent from '../types/logiqx/parent.js';
import Release from '../types/logiqx/release.js';
import ProgressBar from '../types/progressBar.js';
import ReleaseCandidate from '../types/releaseCandidate.js';
import ROMFile from '../types/romFile.js';

export default class CandidateGenerator {
  private readonly progressBar: ProgressBar;

  constructor(progressBar: ProgressBar) {
    this.progressBar = progressBar;
  }

  async generate(
    dat: DAT,
    inputRomFiles: ROMFile[],
  ): Promise<Map<Parent, ReleaseCandidate[]>> {
    // Index the ROMFiles by CRC
    const crc32ToInputRomFiles = inputRomFiles.reduce((acc, romFile) => {
      acc.set(romFile.getCrc32(), romFile);
      return acc;
    }, new Map<string, ROMFile>());

    const parentsToCandidates = new Map<Parent, ReleaseCandidate[]>();

    this.progressBar.reset(dat.getParents().length).setSymbol('🗳️');

    // For each parent, try to generate a parent candidate
    dat.getParents().forEach((parent) => {
      this.progressBar.increment();

      const releaseCandidates: ReleaseCandidate[] = [];

      // For every game
      parent.getGames().flatMap((game) => {
        // For every release (ensuring at least one), find all release candidates
        const releases = game.getReleases().length ? game.getReleases() : [null];
        return releases.forEach((release: Release | null) => {
          // For each Game's ROM, find the matching ROMFile
          const romFiles = game.getRoms()
            .map((rom) => crc32ToInputRomFiles.get(rom.getCrc32()))
            .filter((romFile) => romFile) as ROMFile[];

          // Ignore the Game if not every ROMFile is present
          const missingRomFiles = game.getRoms().length - romFiles.length;
          if (missingRomFiles > 0) {
            if (romFiles.length > 0) {
              let message = `Missing ${missingRomFiles} file${missingRomFiles !== 1 ? 's' : ''} for: ${game.getName()}`;
              if (release?.getRegion()) {
                message += ` (${release?.getRegion()})`;
              }
              ProgressBar.logWarn(message);
            }
            return;
          }

          releaseCandidates.push(new ReleaseCandidate(game, release, game.getRoms(), romFiles));
        });
      });

      parentsToCandidates.set(parent, releaseCandidates);
    });

    return parentsToCandidates;
  }
}
