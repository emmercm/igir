import ProgressBar, { Symbols } from '../console/progressBar.js';
import DAT from '../types/logiqx/dat.js';
import Parent from '../types/logiqx/parent.js';
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
    await this.progressBar.logInfo(`${dat.getName()}: Generating candidates`);

    const output = new Map<Parent, ReleaseCandidate[]>();
    if (!inputRomFiles.length) {
      return output;
    }

    const crc32ToInputRomFiles = CandidateGenerator.indexRomFilesByCrc(inputRomFiles);
    await this.progressBar.logInfo(`${dat.getName()}: ${crc32ToInputRomFiles.size} unique ROM CRC32s found`);

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
          // For each Game's ROM, find the matching ROMFile
          const romFiles = game.getRoms()
            .map((rom) => crc32ToInputRomFiles.get(rom.getCrc32()))
            .filter((romFile) => romFile) as ROMFile[];

          // Ignore the Game if not every ROMFile is present
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

  private static indexRomFilesByCrc(inputRomFiles: ROMFile[]): Map<string, ROMFile> {
    return inputRomFiles.reduce((acc, romFile) => {
      if (acc.has(romFile.getCrc32())) {
        // Have already seen file, prefer non-archived files
        const existing = acc.get(romFile.getCrc32()) as ROMFile;
        if (!romFile.getArchiveEntryPath() && existing.getArchiveEntryPath()) {
          acc.set(romFile.getCrc32(), romFile);
        }
      } else {
        // Haven't seen file yet, store it
        acc.set(romFile.getCrc32(), romFile);
      }
      return acc;
    }, new Map<string, ROMFile>());
  }
}
