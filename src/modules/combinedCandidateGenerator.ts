import ProgressBar, { ProgressBarSymbol } from '../console/progressBar.js';
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
    if (!this.options.getZipDat()) {
      return parentsToCandidates;
    }

    await this.progressBar.logInfo(`${dat.getName()}: Generating consolidated candidate`);

    if (!parentsToCandidates.size) {
      await this.progressBar.logDebug(`${dat.getName()}: No parents to make patched candidates for`);
      return parentsToCandidates;
    }

    await this.progressBar.setSymbol(ProgressBarSymbol.GENERATING);
    await this.progressBar.reset(dat.getParents().length);

    const game = CombinedCandidateGenerator.buildGame(dat, parentsToCandidates);
    const parent = new Parent(game.getName(), [game]);
    const releaseCandidate = CombinedCandidateGenerator.buildReleaseCandidate(
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
      .flatMap((releaseCandidate) => releaseCandidate.getRomsWithFiles())
      .map((romWithFiles) => romWithFiles.getRom());
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

  private static buildReleaseCandidate(
    game: Game,
    parentsToCandidates: Map<Parent, ReleaseCandidate[]>,
  ): ReleaseCandidate {
    const romsWithFiles = [...parentsToCandidates.values()]
      .flatMap((releaseCandidates) => releaseCandidates)
      .flatMap((releaseCandidate) => {
        if (releaseCandidate.getGame().getRoms().length <= 1) {
          return releaseCandidate.getRomsWithFiles();
        }

        // If the game has multiple ROMs, then re-generate them with foldered names
        return releaseCandidate.getRomsWithFiles().map((romWithFiles) => new ROMWithFiles(
          romWithFiles.getRom(),
          romWithFiles.getInputFile(),
          romWithFiles.getOutputFile(), // TODO(cemmer)
        ));
      });

    return new ReleaseCandidate(game, undefined, romsWithFiles);
  }
}
