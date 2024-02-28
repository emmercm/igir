import ProgressBar, { ProgressBarSymbol } from '../console/progressBar.js';
import fsPoly from '../polyfill/fsPoly.js';
import DAT from '../types/dats/dat.js';
import Game from '../types/dats/game.js';
import LogiqxDAT from '../types/dats/logiqx/logiqxDat.js';
import Options from '../types/options.js';
import Module from './module.js';

/**
 * Apply any specified filter options to the {@link Game}s in a {@link DAT}.
 *
 * This class may be run concurrently with other classes.
 */
export default class DATFilter extends Module {
  private readonly options: Options;

  constructor(options: Options, progressBar: ProgressBar) {
    super(progressBar, DATFilter.name);
    this.options = options;
  }

  /**
   * Create a new DAT after filtering.
   */
  async filter(dat: DAT): Promise<DAT> {
    // Return early if there aren't any games
    if (dat.getGames().length === 0) {
      this.progressBar.logTrace(`${dat.getNameShort()}: no games to filter`);
      return dat;
    }

    this.progressBar.logTrace(`${dat.getNameShort()}: filtering DAT`);
    await this.progressBar.setSymbol(ProgressBarSymbol.FILTERING);
    await this.progressBar.reset(dat.getGames().length);

    const filteredGames = dat.getGames()
      .filter((game) => this.filterGame(game));
    const filteredDat = new LogiqxDAT(dat.getHeader(), filteredGames);

    const size = filteredDat.getGames()
      .flatMap((game) => game.getRoms())
      .reduce((sum, rom) => sum + rom.getSize(), 0);
    this.progressBar.logTrace(`${filteredDat.getNameShort()}: filtered to ${filteredGames.length.toLocaleString()}/${dat.getGames().length.toLocaleString()} game${filteredGames.length !== 1 ? 's' : ''} (${fsPoly.sizeReadable(size)})`);

    this.progressBar.logTrace(`${filteredDat.getNameShort()}: done filtering DAT`);
    return filteredDat;
  }

  /**
   ******************
   *
   *     Filter     *
   *
   ******************
   */

  private filterGame(game: Game): boolean {
    // If any condition evaluates to 'true', then the candidate will be excluded
    return [
      this.options.getFilterRegex()
        && !this.options.getFilterRegex()?.some((regex) => regex.test(game.getName())),
      this.options.getFilterRegexExclude()
        && this.options.getFilterRegexExclude()?.some((regex) => regex.test(game.getName())),
      this.noLanguageAllowed(game),
      this.regionNotAllowed(game),
      this.options.getNoBios() && game.isBios(),
      this.options.getOnlyBios() && !game.isBios(),
      this.options.getNoDevice() && game.isDevice(),
      this.options.getOnlyDevice() && !game.isDevice(),
      this.options.getOnlyRetail() && !game.isRetail(),
      this.options.getNoUnlicensed() && game.isUnlicensed(),
      this.options.getOnlyUnlicensed() && !game.isUnlicensed(),
      this.options.getNoDebug() && game.isDebug(),
      this.options.getOnlyDebug() && !game.isDebug(),
      this.options.getNoDemo() && game.isDemo(),
      this.options.getOnlyDemo() && !game.isDemo(),
      this.options.getNoBeta() && game.isBeta(),
      this.options.getOnlyBeta() && !game.isBeta(),
      this.options.getNoSample() && game.isSample(),
      this.options.getOnlySample() && !game.isSample(),
      this.options.getNoPrototype() && game.isPrototype(),
      this.options.getOnlyPrototype() && !game.isPrototype(),
      this.options.getNoProgram() && game.isProgram(),
      this.options.getOnlyProgram() && !game.isProgram(),
      this.options.getNoAftermarket() && game.isAftermarket(),
      this.options.getOnlyAftermarket() && !game.isAftermarket(),
      this.options.getNoHomebrew() && game.isHomebrew(),
      this.options.getOnlyHomebrew() && !game.isHomebrew(),
      this.options.getNoUnverified() && !game.isVerified(),
      this.options.getOnlyUnverified() && game.isVerified(),
      this.options.getNoBad() && game.isBad(),
      this.options.getOnlyBad() && !game.isBad(),
    ].filter((val) => val).length === 0;
  }

  private noLanguageAllowed(game: Game): boolean {
    const langs = this.options.getFilterLanguage();
    if (langs.size === 0) {
      return false;
    }
    return !game.getLanguages().some((lang) => langs.has(lang));
  }

  private regionNotAllowed(game: Game): boolean {
    const regions = this.options.getFilterRegion();
    if (regions.size === 0) {
      return false;
    }
    return !game.getRegions().some((region) => regions.has(region));
  }
}
