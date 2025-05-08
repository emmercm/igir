import path from 'node:path';

import ProgressBar, { ProgressBarSymbol } from '../../console/progressBar.js';
import DAT from '../../types/dats/dat.js';
import ROM from '../../types/dats/rom.js';
import SingleValueGame from '../../types/dats/singleValueGame.js';
import ArchiveEntry from '../../types/files/archives/archiveEntry.js';
import Options from '../../types/options.js';
import WriteCandidate from '../../types/writeCandidate.js';
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

  private static buildGame(dat: DAT, candidates: WriteCandidate[]): SingleValueGame {
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

    return new SingleValueGame({
      name,
      roms: uniqueRoms,
    });
  }

  private static buildCombinedCandidate(
    dat: DAT,
    game: SingleValueGame,
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
        let outputEntry = outputFile.withFilePath(dat.getName());

        // If the game has multiple ROMs, then group them in a folder in the archive
        if (candidate.getGame().getRoms().length > 1) {
          outputEntry = outputEntry.withEntryPath(
            path.join(candidate.getGame().getName(), outputEntry.getEntryPath()),
          );
        }

        return romWithFiles.withOutputFile(outputEntry);
      }),
    );

    return new WriteCandidate(game, romsWithFiles);
  }
}
