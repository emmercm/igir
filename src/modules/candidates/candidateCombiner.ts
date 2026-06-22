import path from 'node:path';

import type ProgressBar from '../../console/progressBar.js';
import { ProgressBarSymbol } from '../../console/progressBar.js';
import type DAT from '../../models/dats/dat.js';
import Game from '../../models/dats/game.js';
import type ROM from '../../models/dats/rom.js';
import ArchiveEntry from '../../models/files/archives/archiveEntry.js';
import type Options from '../../models/options.js';
import WriteCandidate from '../../models/writeCandidate.js';
import Module from '../module.js';

/**
 * Combine every {@link WriteCandidate} for a {@link DAT} into a single {@link WriteCandidate}.
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
  combine(dat: DAT, candidates: WriteCandidate[]): WriteCandidate[] {
    if (!this.options.getZipDatName()) {
      return candidates;
    }

    if (candidates.length === 0) {
      this.progressBar.logTrace(`${dat.getName()}: no candidates to make patched candidates for`);
      return candidates;
    }

    this.progressBar.logTrace(`${dat.getName()}: generating consolidated candidate`);
    this.progressBar.setSymbol(ProgressBarSymbol.CANDIDATE_COMBINING);
    this.progressBar.resetProgress(candidates.length);

    const game = CandidateCombiner.buildGame(dat, candidates);
    const candidate = CandidateCombiner.buildCombinedCandidate(dat, game, candidates);
    return [candidate];
  }

  private static buildGame(dat: DAT, candidates: WriteCandidate[]): Game {
    const name = dat.getName();

    const roms = candidates
      .flatMap((candidate) => candidate.getRomsWithFiles())
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
      roms: uniqueRoms,
    });
  }

  private static buildCombinedCandidate(
    dat: DAT,
    game: Game,
    candidates: WriteCandidate[],
  ): WriteCandidate {
    const romsWithFiles = candidates.flatMap((candidate) =>
      candidate.getRomsWithFiles().map((romWithFiles) => {
        // If the output isn't an archive then it must have been excluded (e.g. --zip-exclude),
        //  don't manipulate it.
        const outputFile = romWithFiles.getOutputFile();
        if (!(outputFile instanceof ArchiveEntry)) {
          return romWithFiles;
        }

        // Combine all output ArchiveEntry to a single archive of the DAT name
        let outputEntry = outputFile.withFilePath(
          path.join(path.dirname(outputFile.getFilePath()), dat.getName()) +
            outputFile.getArchive().getExtension(),
        );

        // If the game has multiple ROMs, then group them in a folder in the archive
        if (candidate.getGame().getRoms().length > 1) {
          outputEntry = outputEntry.withEntryPath(
            path.posix.join(candidate.getGame().getName(), outputEntry.getEntryPath()),
          );
        }

        return romWithFiles.withOutputFile(outputEntry);
      }),
    );

    return new WriteCandidate(game, romsWithFiles);
  }
}
