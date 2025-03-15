import path from 'node:path';

import ProgressBar, { ProgressBarSymbol } from '../../console/progressBar.js';
import DAT from '../../types/dats/dat.js';
import Game from '../../types/dats/game.js';
import Parent from '../../types/dats/parent.js';
import ROM from '../../types/dats/rom.js';
import ArchiveEntry from '../../types/files/archives/archiveEntry.js';
import Options from '../../types/options.js';
import ReleaseCandidate from '../../types/releaseCandidate.js';
import Module from '../module.js';

/**
 * Combine every {@link Parent} and its {@link ReleaseCandidate}s for a {@link DAT} into a single
 * {@link Parent}.
 */
export default class CandidateCombiner extends Module {
  private readonly options: Options;

  constructor(options: Options, progressBar: ProgressBar) {
    super(progressBar, CandidateCombiner.name);
    this.options = options;
  }

  /**
   * Combine the candidates.
   */
  combine(
    dat: DAT,
    parentsToCandidates: Map<Parent, ReleaseCandidate[]>,
  ): Map<Parent, ReleaseCandidate[]> {
    if (!this.options.getZipDatName()) {
      return parentsToCandidates;
    }

    if (parentsToCandidates.size === 0) {
      this.progressBar.logTrace(`${dat.getName()}: no parents to make patched candidates for`);
      return parentsToCandidates;
    }

    this.progressBar.logTrace(`${dat.getName()}: generating consolidated candidate`);
    this.progressBar.setSymbol(ProgressBarSymbol.CANDIDATE_COMBINING);
    this.progressBar.reset(parentsToCandidates.size);

    const game = CandidateCombiner.buildGame(dat, parentsToCandidates);
    const parent = new Parent(game);
    const releaseCandidate = CandidateCombiner.buildReleaseCandidate(
      dat,
      game,
      parentsToCandidates,
    );
    return new Map([[parent, [releaseCandidate]]]);
  }

  private static buildGame(dat: DAT, parentsToCandidates: Map<Parent, ReleaseCandidate[]>): Game {
    const name = dat.getName();

    const roms = [...parentsToCandidates.values()]
      .flat()
      .flatMap((releaseCandidate) => releaseCandidate.getRomsWithFiles())
      .map((romWithFiles) => romWithFiles.getRom());
    const uniqueRoms = [
      ...roms
        .reduce((map, rom) => {
          const key = rom.getName();
          if (!map.has(key)) {
            map.set(key, rom);
          }
          return map;
        }, new Map<string, ROM>())
        .values(),
    ];

    return new Game({
      name,
      rom: uniqueRoms,
    });
  }

  private static buildReleaseCandidate(
    dat: DAT,
    game: Game,
    parentsToCandidates: Map<Parent, ReleaseCandidate[]>,
  ): ReleaseCandidate {
    const romsWithFiles = [...parentsToCandidates.values()].flat().flatMap((releaseCandidate) =>
      releaseCandidate.getRomsWithFiles().map((romWithFiles) => {
        // If the output isn't an archive then it must have been excluded (e.g. --zip-exclude),
        //  don't manipulate it.
        const outputFile = romWithFiles.getOutputFile();
        if (!(outputFile instanceof ArchiveEntry)) {
          return romWithFiles;
        }

        // Combine all output ArchiveEntry to a single archive of the DAT name
        let outputEntry = outputFile.withFilePath(dat.getName());

        // If the game has multiple ROMs, then group them in a folder in the archive
        if (releaseCandidate.getGame().getRoms().length > 1) {
          outputEntry = outputEntry.withEntryPath(
            path.join(releaseCandidate.getGame().getName(), outputEntry.getEntryPath()),
          );
        }

        return romWithFiles.withOutputFile(outputEntry);
      }),
    );

    return new ReleaseCandidate(game, undefined, romsWithFiles);
  }
}
