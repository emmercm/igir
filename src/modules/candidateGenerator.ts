import async, { AsyncResultCallback } from 'async';

import ProgressBar, { Symbols } from '../console/progressBar.js';
import File from '../types/files/file.js';
import DAT from '../types/logiqx/dat.js';
import Game from '../types/logiqx/game.js';
import Parent from '../types/logiqx/parent.js';
import Release from '../types/logiqx/release.js';
import ROM from '../types/logiqx/rom.js';
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
    inputRomFiles: Map<string, File>,
  ): Promise<Map<Parent, ReleaseCandidate[]>> {
    await this.progressBar.logInfo(`${dat.getName()}: Generating candidates`);

    const output = new Map<Parent, ReleaseCandidate[]>();
    if (!inputRomFiles.size) {
      await this.progressBar.logDebug(`${dat.getName()}: No input ROMs to make candidates from`);
      return output;
    }

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
            inputRomFiles,
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

  private async buildReleaseCandidateForRelease(
    game: Game,
    release: Release | undefined,
    hashCodeToInputFiles: Map<string, File>,
  ): Promise<ReleaseCandidate | undefined> {
    // For each Game's ROM, find the matching File
    const romFiles = (await async.map(
      game.getRoms(),
      (rom, callback: AsyncResultCallback<[ROM, File | undefined], Error>) => {
        const romFile = hashCodeToInputFiles.get(rom.hashCode());
        callback(null, [rom, romFile]);
      },
    ));

    const foundRomFiles = romFiles
      .map(([, file]) => file)
      .filter((file) => file) as File[];
    const missingRoms = romFiles
      .filter(([, file]) => !file)
      .map(([rom]) => rom);

    // Ignore the Game if not every File is present
    if (missingRoms.length > 0) {
      if (foundRomFiles.length > 0) {
        await this.logMissingRomFiles(game, release, missingRoms);
      }
      return undefined;
    }

    return new ReleaseCandidate(game, release, game.getRoms(), foundRomFiles);
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
