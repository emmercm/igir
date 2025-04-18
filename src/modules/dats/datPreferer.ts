import ProgressBar, { ProgressBarSymbol } from '../../console/progressBar.js';
import FsPoly from '../../polyfill/fsPoly.js';
import DAT from '../../types/dats/dat.js';
import Game from '../../types/dats/game.js';
import LogiqxDAT from '../../types/dats/logiqx/logiqxDat.js';
import Options, { PreferRevision } from '../../types/options.js';
import Module from '../module.js';

/**
 * Apply any specified preference options to the {@link Game}s within each {@link DAT}.
 */
export default class DATPreferer extends Module {
  private readonly options: Options;

  constructor(options: Options, progressBar: ProgressBar) {
    super(progressBar, DATPreferer.name);
    this.options = options;
  }

  /**
   * Prefer some {@link Game}s.
   */
  prefer(dat: DAT): DAT {
    if (!this.options.getSingle()) {
      this.progressBar.logTrace(
        `${dat.getName()}: not running in single/1G1R mode, not preferring games`,
      );
      return dat;
    }

    // Return early if there aren't any games
    if (dat.getGames().length === 0) {
      this.progressBar.logTrace(`${dat.getName()}: no games to prefer`);
      return dat;
    }

    // Return early if there aren't any games
    if (dat.getGames().length === 0) {
      this.progressBar.logTrace(`${dat.getName()}: no parent has games, not preferring games`);
      return dat;
    }

    this.progressBar.logTrace(`${dat.getName()}: preferring DAT games`);
    this.progressBar.setSymbol(ProgressBarSymbol.DAT_PREFERRING);
    this.progressBar.reset(dat.getParents().length);

    const preferredGames = dat
      .getParents()
      .map((parent) => {
        this.progressBar.incrementProgress();

        if (parent.getGames().length === 0) {
          return undefined;
        }
        this.progressBar.logTrace(
          `${dat.getName()}: ${parent.getName()} (parent): ${parent.getGames().length.toLocaleString()} game${parent.getGames().length === 1 ? '' : 's'} before preferring`,
        );

        const preferredGame = parent
          .getGames()
          .sort((a, b) => this.sort(a, b))
          .at(0);
        return preferredGame?.withProps({ cloneOf: undefined });
      })
      .filter((game) => game !== undefined);
    const preferredDat = new LogiqxDAT(dat.getHeader(), preferredGames);

    const size = preferredDat
      .getGames()
      .flatMap((game) => game.getRoms())
      .reduce((sum, rom) => sum + rom.getSize(), 0);
    this.progressBar.logTrace(
      `${preferredDat.getName()}: preferred to ${preferredGames.length.toLocaleString()}/${dat.getGames().length.toLocaleString()} game${preferredGames.length === 1 ? '' : 's'} (${FsPoly.sizeReadable(size)})`,
    );

    this.progressBar.logTrace(`${preferredDat.getName()}: done preferring DAT games`);
    return preferredDat;
  }

  /**
   *******************
   *
   *     Sorting     *
   *
   *******************
   */

  private sort(a: Game, b: Game): number {
    return (
      this.preferGameRegexSort(a, b) ||
      this.preferRomRegexSort(a, b) ||
      this.preferVerifiedSort(a, b) ||
      this.preferGoodSort(a, b) ||
      this.preferLanguagesSort(a, b) ||
      this.preferRegionsSort(a, b) ||
      this.preferRevisionSort(a, b) ||
      this.preferRetailSort(a, b) ||
      this.preferParentSort(a, b)
    );
  }

  private preferGameRegexSort(a: Game, b: Game): number {
    const gameRegex = this.options.getPreferGameRegex();
    if (gameRegex === undefined || gameRegex.length === 0) {
      return 0;
    }

    const aMatched = gameRegex.some((regex) => regex.test(a.getName())) ? 0 : 1;
    const bMatched = gameRegex.some((regex) => regex.test(b.getName())) ? 0 : 1;
    return aMatched - bMatched;
  }

  private preferRomRegexSort(a: Game, b: Game): number {
    const romRegex = this.options.getPreferRomRegex();
    if (romRegex === undefined || romRegex.length === 0) {
      return 0;
    }

    const aMatched = romRegex.some((regex) => a.getRoms().some((rom) => regex.test(rom.getName())))
      ? 0
      : 1;
    const bMatched = romRegex.some((regex) => b.getRoms().some((rom) => regex.test(rom.getName())))
      ? 0
      : 1;
    return aMatched - bMatched;
  }

  private preferVerifiedSort(a: Game, b: Game): number {
    if (!this.options.getPreferVerified()) {
      return 0;
    }
    return (a.isVerified() ? 0 : 1) - (b.isVerified() ? 0 : 1);
  }

  private preferGoodSort(a: Game, b: Game): number {
    if (!this.options.getPreferGood()) {
      return 0;
    }
    return (b.isBad() ? 0 : 1) - (a.isBad() ? 0 : 1);
  }

  private preferLanguagesSort(a: Game, b: Game): number {
    const preferLanguages = this.options.getPreferLanguages();
    if (preferLanguages.length === 0) {
      return 0;
    }

    const aLangs = new Set(a.getLanguages());
    const bLangs = new Set(b.getLanguages());
    for (const preferredLang of preferLanguages) {
      if (aLangs.has(preferredLang) && !bLangs.has(preferredLang)) {
        return -1;
      }
      if (!aLangs.has(preferredLang) && bLangs.has(preferredLang)) {
        return 1;
      }
    }
    return 0;
  }

  private preferRegionsSort(a: Game, b: Game): number {
    const preferRegions = this.options.getPreferRegions();
    if (preferRegions.length === 0) {
      return 0;
    }

    const aRegions = new Set(a.getRegions());
    const bRegions = new Set(b.getRegions());
    for (const preferredRegion of preferRegions) {
      if (aRegions.has(preferredRegion) && !bRegions.has(preferredRegion)) {
        return -1;
      }
      if (!aRegions.has(preferredRegion) && bRegions.has(preferredRegion)) {
        return 1;
      }
    }
    return 0;
  }

  private preferRevisionSort(a: Game, b: Game): number {
    if (this.options.getPreferRevision() === PreferRevision.NEWER) {
      return b.getRevision() - a.getRevision();
    }
    if (this.options.getPreferRevision() === PreferRevision.OLDER) {
      return a.getRevision() - b.getRevision();
    }
    return 0;
  }

  private preferRetailSort(a: Game, b: Game): number {
    if (!this.options.getPreferRetail()) {
      return 0;
    }
    return (a.isRetail() ? 0 : 1) - (b.isRetail() ? 0 : 1);
  }

  private preferParentSort(a: Game, b: Game): number {
    if (!this.options.getPreferParent()) {
      return 0;
    }
    return (a.isParent() ? 0 : 1) - (b.isParent() ? 0 : 1);
  }
}
