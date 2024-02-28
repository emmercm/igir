import ProgressBar, { ProgressBarSymbol } from '../console/progressBar.js';
import DAT from '../types/dats/dat.js';
import Game from '../types/dats/game.js';
import LogiqxDAT from '../types/dats/logiqx/logiqxDat.js';
import Internationalization from '../types/internationalization.js';
import Options from '../types/options.js';
import Module from './module.js';

/**
 * Infer {@link Parent}s for all {@link DAT}s, even those that already have some parents.
 *
 * This class may be run concurrently with other classes.
 */
export default class DATParentInferrer extends Module {
  private readonly options: Options;

  constructor(options: Options, progressBar: ProgressBar) {
    super(progressBar, DATParentInferrer.name);
    this.options = options;
  }

  /**
   * Infer {@link Parent}s from {@link Game}s.
   */
  async infer(dat: DAT): Promise<DAT> {
    if (dat.hasParentCloneInfo() && !this.options.getDatIgnoreParentClone()) {
      this.progressBar.logTrace(`${dat.getNameShort()}: DAT has parent/clone info, skipping`);
      return dat;
    }

    if (dat.getGames().length === 0) {
      this.progressBar.logTrace(`${dat.getNameShort()}: no games to process`);
      return dat;
    }

    this.progressBar.logTrace(`${dat.getNameShort()}: inferring parents for ${dat.getGames().length.toLocaleString()} game${dat.getGames().length !== 1 ? 's' : ''}`);
    await this.progressBar.setSymbol(ProgressBarSymbol.GROUPING_SIMILAR);
    await this.progressBar.reset(dat.getGames().length);

    // Group games by their stripped names
    const strippedNamesToGames = dat.getGames().reduce((map, game) => {
      let strippedGameName = game.getName();
      strippedGameName = DATParentInferrer.stripGameRegionAndLanguage(strippedGameName);
      strippedGameName = DATParentInferrer.stripGameVariants(strippedGameName);
      map.set(strippedGameName, [...(map.get(strippedGameName) ?? []), game]);
      return map;
    }, new Map<string, Game[]>());
    const groupedGames = [...strippedNamesToGames.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, games]) => games);

    const newGames = groupedGames.flatMap((games) => DATParentInferrer.electParent(games));
    const inferredDat = new LogiqxDAT(dat.getHeader(), newGames);
    this.progressBar.logTrace(`${inferredDat.getNameShort()}: grouped to ${inferredDat.getParents().length.toLocaleString()} parent${inferredDat.getParents().length !== 1 ? 's' : ''}`);

    this.progressBar.logTrace('done inferring parents');
    return inferredDat;
  }

  private static stripGameRegionAndLanguage(name: string): string {
    return name
      // ***** Regions *****
      .replace(new RegExp(`\\(((${Internationalization.REGION_CODES.join('|')})[,+-]? ?)+\\)`, 'i'), '')
      .replace(new RegExp(`\\(((${Internationalization.REGION_NAMES.join('|')})[,+-]? ?)+\\)`, 'i'), '')
      // ***** Languages *****
      .replace(new RegExp(`\\(((${Internationalization.LANGUAGES.join('|')})[,+-]? ?)+\\)`, 'i'), '')
      // ***** Cleanup *****
      .replace(/  +/g, ' ')
      .trim();
  }

  private static stripGameVariants(name: string): string {
    return name
      // ***** Retail types *****
      .replace(/\(Alt( [a-z0-9. ]*)?\)/i, '')
      .replace(/\([^)]*Collector's Edition\)/i, '')
      .replace(/\(Extra Box\)/i, '')
      .replace(/\(Fukkokuban\)/i, '') // "reprint"
      .replace(/\([^)]*Genteiban\)/i, '') // "limited edition"
      .replace(/\(Limited[^)]+Edition\)/i, '')
      .replace(/\(Limited Run Games\)/i, '')
      .replace(/\(Made in [^)]+\)/i, '')
      .replace(/\(Major Wave\)/i, '')
      .replace(/\((Midway Classics)\)/i, '')
      .replace(/\([^)]*Premium [^)]+\)/i, '')
      .replace(/\([^)]*Preview Disc\)/i, '')
      .replace(/\(Recalled\)/i, '')
      .replace(/\(Renkaban\)/i, '') // "cheap edition"
      .replace(/\(Reprint\)/i, '')
      .replace(/\(Rerelease\)/i, '')
      .replace(/\(Rev[a-z0-9. ]*\)/i, '')
      .replace(/\([^)]*Seisanban\)/i, '') // "production version"
      .replace(/\(Shotenban\)/i, '') // "bookstore edition"
      .replace(/\(Special Pack\)/i, '')
      .replace(/\([^)]+ the Best\)/i, '')
      .replace(/\([^)]*Taiouban[^)]*\)/i, '') // "compatible version"
      .replace(/\([^)]*Tokubetsu-?ban[^)]*\)/i, '') // "special edition"
      // ***** Non-retail types *****
      .replace(/\([0-9]{4}-[0-9]{2}-[0-9]{2}\)/, '') // YYYY-MM-DD
      .replace(/\(Aftermarket[a-z0-9. ]*\)/i, '')
      .replace(/\(Alpha[a-z0-9. ]*\)/i, '')
      .replace(/\(Beta[a-z0-9. ]*\)/i, '')
      .replace(/\(Build [a-z0-9. ]+\)/i, '')
      .replace(/\(Bung\)/i, '')
      .replace(/\(Debug[a-z0-9. ]*\)/i, '')
      .replace(Game.DEMO_REGEX, '')
      .replace(/\(Hack\)/i, '')
      .replace(/\(Homebrew[a-z0-9. ]*\)/i, '')
      .replace(/\(Not for Resale\)/i, '')
      .replace(/\(PD\)/i, '') // "public domain"
      .replace(/\(Pirate[a-z0-9. ]*\)/i, '')
      .replace(/\([^)]*Proto[a-z0-9. ]*\)/i, '')
      .replace(/\([^)]*Sample[a-z0-9. ]*\)/i, '')
      .replace(/\(Spaceworld[a-z0-9. ]*\)/i, '')
      .replace(/\(Test[a-z0-9. ]*\)/i, '')
      .replace(/\(Unl[a-z0-9. ]*\)/i, '')
      .replace(/\(v[0-9.]+[a-z]*\)/i, '')
      .replace(/\(Version [0-9.]+[a-z]*\)/i, '')
      // ***** Good Tools *****
      .replace(/\[!\]/, '')
      .replace(/\[b[0-9]*\]/, '')
      .replace(/\[bf\]/, '')
      .replace(/\[c\]/, '')
      .replace(/\[f[0-9]*\]/, '')
      .replace(/\[h[a-zA-Z90-9+]*\]/, '')
      .replace(/\[MIA\]/, '')
      .replace(/\[o[0-9]*\]/, '')
      .replace(/\[!p\]/, '')
      .replace(/\[p[0-9]*\]/, '')
      .replace(/\[t[0-9]*\]/, '')
      .replace(/\[T[+-][^\]]+\]/, '')
      .replace(/\[x\]/, '')
      // ***** TOSEC *****
      .replace(/\((demo|demo-kiosk|demo-playable|demo-rolling|demo-slideshow)\)/, '') // demo
      .replace(/\([0-9x]{4}(-[0-9x]{2}(-[0-9x]{2})?)?\)/, '') // YYYY-MM-DD
      .replace(/\((CGA|EGA|HGC|MCGA|MDA|NTSC|NTSC-PAL|PAL|PAL-60|PAL-NTSC|SVGA|VGA|XGA)\)/i, '') // video
      .replace(/\(M[0-9]+\)/, '') // language
      .replace(/\((CW|CW-R|FW|GW|GW-R|LW|PD|SW|SW-R)\)/i, '') // copyright
      .replace(/\((alpha|beta|preview|pre-release|proto)\)/i, '') // development
      .replace(/(\[(cr|f|h|m|p|t|tr|o|u|v|b|a|!)( [a-z0-9.+ -]+)?\])+/i, '')
      // ***** Console-specific *****
      // Nintendo - Game Boy
      .replace(/\(SGB Enhanced\)/i, '')
      // Nintendo - Game Boy Color
      .replace(/\(GB Compatible\)/i, '')
      // Nintendo - GameCube
      .replace(/\(GameCube\)/i, '')
      // Nintendo - Super Nintendo Entertainment System
      .replace(/\(NP\)/i, '') // "Nintendo Power"
      // Sega - Mega Drive / Genesis
      .replace(/\(MP\)/i, '') // "MegaPlay version"
      // Sega - Sega/Mega CD
      .replace(/\(RE-?[0-9]*\)/, '')
      // Sony - PlayStation 1
      .replace(/\(EDC\)/i, '') // copy protection
      .replace(/\(PSone Books\)/i, '')
      .replace(/\((SCES|SCUS|SLES|SLUS)-[0-9]+\)/i, '')
      // ***** Cleanup *****
      .replace(/  +/g, ' ')
      .trim();
    // ***** EXPLICITLY LEFT ALONE *****
    // (Bonus Disc .*)
    // (Disc [0-9A-Z])
    // (Mega-CD 32X) / (Sega CD 32X)
  }

  private static electParent(games: Game[]): Game[] {
    // Index games by their name without the region and language
    const strippedNamesToGames = games.reduce((map, game) => {
      let strippedGameName = game.getName();
      strippedGameName = DATParentInferrer.stripGameRegionAndLanguage(strippedGameName);
      if (!map.has(strippedGameName)) {
        // If there is a conflict after stripping the region & language, then we know the two games
        // only differ by region & language. Assume the first one seen in the DAT should be the
        // parent.
        map.set(strippedGameName, game);
      }
      return map;
    }, new Map<string, Game>());

    return games.map((game, idx) => {
      // Search for this game's retail parent.
      // Retail games do not have variants such as "(Demo)", so if we fully strip the game name and
      //  find a match, then we have reasonable confidence that match is this game's parent.
      let strippedGameName = game.getName();
      strippedGameName = DATParentInferrer.stripGameRegionAndLanguage(strippedGameName);
      strippedGameName = DATParentInferrer.stripGameVariants(strippedGameName);
      const retailParent = strippedNamesToGames.get(strippedGameName);
      if (retailParent) {
        if (retailParent.hashCode() === game.hashCode()) {
          // This game is the parent
          return game.withProps({ cloneOf: undefined });
        }
        return game.withProps({ cloneOf: retailParent.getName() });
      }

      // Assume this game's non-retail parent.
      // If we got here, then we know these games share the same fully-stripped name. Assume the
      //  first game seen in the DAT should be the parent.
      // The only danger with this assumption is it will affect `--prefer-parent`, but that's not
      //  likely a commonly used option.
      if (idx === 0) {
        // This game is the parent
        return game.withProps({ cloneOf: undefined });
      }
      return game.withProps({ cloneOf: games[0].getName() });
    });
  }
}
