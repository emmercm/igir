import path from 'path';

import ProgressBar, { ProgressBarSymbol } from '../console/progressBar.js';
import ArchiveEntry from '../types/files/archives/archiveEntry.js';
import DAT from '../types/logiqx/dat.js';
import Game from '../types/logiqx/game.js';
import Parent from '../types/logiqx/parent.js';
import ROM from '../types/logiqx/rom.js';
import Options from '../types/options.js';
import ReleaseCandidate from '../types/releaseCandidate.js';
import ROMWithFiles from '../types/romWithFiles.js';
import Module from './module.js';

export default class CombinedCandidateGenerator extends Module {
  private readonly options: Options;

  constructor(options: Options, progressBar: ProgressBar) {
    super(progressBar, CombinedCandidateGenerator.name);
    this.options = options;
  }

  async generate(
    dat: DAT,
    parentsToCandidates: Map<Parent, ReleaseCandidate[]>,
  ): Promise<Map<Parent, ReleaseCandidate[]>> {
    if (!this.options.getZipDatName()) {
      return parentsToCandidates;
    }

    await this.progressBar.logInfo(`${dat.getNameShort()}: generating consolidated candidate`);

    if (!parentsToCandidates.size) {
      await this.progressBar.logDebug(`${dat.getNameShort()}: no parents to make patched candidates for`);
      return parentsToCandidates;
    }

    await this.progressBar.setSymbol(ProgressBarSymbol.GENERATING);
    await this.progressBar.reset(dat.getParents().length);

    const game = CombinedCandidateGenerator.buildGame(dat, parentsToCandidates);
    const parent = new Parent(game.getName(), [game]);
    const releaseCandidate = await CombinedCandidateGenerator.buildReleaseCandidate(
      dat,
      game,
      parentsToCandidates,
    );
    return new Map([[parent, [releaseCandidate]]]);
  }

  private static buildGame(
    dat: DAT,
    parentsToCandidates: Map<Parent, ReleaseCandidate[]>,
  ): Game {
    const name = dat.getNameShort();

    const roms = [...parentsToCandidates.values()]
      .flatMap((releaseCandidates) => releaseCandidates)
      .flatMap((releaseCandidate) => {
        const romsWithFiles = releaseCandidate.getRomsWithFiles();
        if (romsWithFiles.length <= 1) {
          return romsWithFiles.map((romWithFiles) => romWithFiles.getRom());
        }

        // If the candidate consists of multiple ROMs, then put the ROMs in a folder
        return romsWithFiles
          .map((romWithFiles) => romWithFiles.getRom())
          .map((rom) => new ROM(
            path.join(releaseCandidate.getName(), rom.getName()),
            rom.getSize(),
            rom.getCrc32(),
          ));
      });
    const uniqueRoms = [...roms.reduce((map, rom) => {
      const key = rom.getName();
      if (!map.has(key)) {
        map.set(key, rom);
      }
      return map;
    }, new Map<string, ROM>()).values()];

    return new Game({
      name,
      rom: uniqueRoms,
    });
  }

  private static async buildReleaseCandidate(
    dat: DAT,
    game: Game,
    parentsToCandidates: Map<Parent, ReleaseCandidate[]>,
  ): Promise<ReleaseCandidate> {
    const romsWithFiles = await Promise.all([...parentsToCandidates.values()]
      .flatMap((releaseCandidates) => releaseCandidates)
      .flatMap((releaseCandidate) => releaseCandidate.getRomsWithFiles()
        .map(async (romWithFiles) => {
          // If the output isn't an archive, then it must have been excluded (e.g. --zip-exclude),
          //  don't manipulate it.
          const outputFile = romWithFiles.getOutputFile();
          if (!(outputFile instanceof ArchiveEntry)) {
            return romWithFiles;
          }

          // Combine all output ArchiveEntry to a single archive of the DAT name
          let outputEntry = await outputFile.withArchiveFileName(dat.getNameShort());

          // If the game has multiple ROMs, then group them in a folder in the archive
          if (releaseCandidate.getGame().getRoms().length > 1) {
            outputEntry = await outputEntry.withEntryPath(path.join(
              releaseCandidate.getGame().getName(),
              outputEntry.getEntryPath(),
            ));
          }

          return new ROMWithFiles(
            romWithFiles.getRom(),
            romWithFiles.getInputFile(),
            outputEntry,
          );
        })));

    return new ReleaseCandidate(game, undefined, romsWithFiles);
  }
}
