import ProgressBar, { ProgressBarSymbol } from '../../console/progressBar.js';
import DAT from '../../types/dats/dat.js';
import Game from '../../types/dats/game.js';
import LogiqxDAT from '../../types/dats/logiqx/logiqxDat.js';
import Internationalization from '../../types/internationalization.js';
import Options from '../../types/options.js';
import Module from '../module.js';

/**
 * Infer {@link Parent}s for all {@link DAT}s, even those that already have some parents.
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
  infer(dat: DAT): DAT {
    if (dat.hasParentCloneInfo() && !this.options.getDatIgnoreParentClone()) {
      this.progressBar.logTrace(`${dat.getName()}: DAT has parent/clone info, skipping`);
      return dat;
    }

    if (dat.getGames().length === 0) {
      this.progressBar.logTrace(`${dat.getName()}: no games to process`);
      return dat;
    }

    this.progressBar.logTrace(
      `${dat.getName()}: inferring parents for ${dat.getGames().length.toLocaleString()} game${dat.getGames().length === 1 ? '' : 's'}`,
    );
    this.progressBar.setSymbol(ProgressBarSymbol.DAT_GROUPING_SIMILAR);
    this.progressBar.reset(dat.getGames().length);

    // Group games by their stripped names
    const strippedNamesToGames = dat.getGames().reduce((map, game) => {
      let strippedGameName = game.getName();
      strippedGameName = DATParentInferrer.stripGameRegionAndLanguage(strippedGameName);
      strippedGameName = DATParentInferrer.stripGameVariants(strippedGameName);
      if (map.has(strippedGameName)) {
        map.get(strippedGameName)?.push(game);
      } else {
        map.set(strippedGameName, [game]);
      }
      return map;
    }, new Map<string, Game[]>());
    const groupedGames = [...strippedNamesToGames.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, games]) => games);

    const newGames = groupedGames.flatMap((games) => DATParentInferrer.electParent(games));
    const inferredDat = new LogiqxDAT(dat.getHeader(), newGames);
    this.progressBar.logTrace(
      `${inferredDat.getName()}: grouped to ${inferredDat.getParents().length.toLocaleString()} parent${inferredDat.getParents().length === 1 ? '' : 's'}`,
    );

    this.progressBar.logTrace('done inferring parents');
    return inferredDat;
  }

  private static stripGameRegionAndLanguage(name: string): string {
    let strippedName = name
      // ***** Regions *****
      .replace(
        new RegExp(`\\(((${Internationalization.REGION_CODES.join('|')})[,+-]? ?)+\\)`, 'i'),
        '',
      )
      .replace(
        new RegExp(`\\(((${Internationalization.REGION_NAMES.join('|')})[,+-]? ?)+\\)`, 'i'),
        '',
      )
      .replace(/\(Latin America\)/i, '');
    Internationalization.REGION_REGEX.forEach((regex) => {
      strippedName = strippedName.replace(regex, '');
    });
    // ***** Languages *****
    return (
      strippedName
        .replace(
          new RegExp(`\\(((${Internationalization.LANGUAGES.join('|')})[,+-]? ?)+\\)`, 'i'),
          '',
        )
        // ***** Cleanup *****
        .replaceAll(/  +/g, ' ')
        .trim()
    );
  }

  private static stripGameVariants(name: string): string {
    return (
      name
        // ***** Retail types *****
        .replace(/\(Alt( [a-z0-9. ]*)?\)/i, '')
        .replace(/\([^)]*Collector's Edition\)/i, '')
        .replace(/\(Digital Release\)/i, '')
        .replace(/\(Disney Classic Games\)/i, '')
        .replace(/\(Evercade\)/i, '')
        .replace(/\(Extra Box\)/i, '')
        .replace(/ - European Version/i, '')
        .replace(/\(Fukkokuban\)/i, '') // "reprint"
        .replace(/\([^)]*Genteiban\)/i, '') // "limited edition"
        .replace(/\(Limited[^)]+Edition\)/i, '')
        .replace(/\(Limited Run Games\)/i, '')
        .replace(/\(LodgeNet\)/i, '')
        .replace(/\(Made in [^)]+\)/i, '')
        .replace(/\(Major Wave\)/i, '')
        .replace(/\((Midway Classics)\)/i, '')
        .replace(/\([^)]*Premium [^)]+\)/i, '')
        .replace(/\([^)]*Preview Disc\)/i, '')
        .replace(/\(QUByte Classics\)/i, '')
        .replace(/\(Recalled\)/i, '')
        .replace(/\(Renkaban\)/i, '') // "cheap edition"
        .replace(/\(Reprint\)/i, '')
        .replace(/\(Rerelease\)/i, '')
        .replace(/\(Retro-Bit\)/i, '')
        .replace(/\((Rev|Version)\s*[a-z0-9.-]*\)/i, '')
        .replace(/\([^)]*Seisanban\)/i, '') // "production version"
        .replace(/\(Shotenban\)/i, '') // "bookstore edition"
        .replace(/\(Special Pack\)/i, '')
        .replace(/\(Steam\)/i, '')
        .replace(/\(Switch Online\)/i, '')
        .replace(/\([^)]+ the Best\)/i, '')
        .replace(/\([^)]*Taiouban[^)]*\)/i, '') // "compatible version"
        .replace(/\([^)]*Tokubetsu-?ban[^)]*\)/i, '') // "special edition"
        .replace(/\([^)]*Virtual Console\)/i, '')
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
        .replace(/\(Kiosk[^)]*\)/i, '')
        .replace(/\(Not for Resale\)/i, '')
        .replace(/\(PD\)/i, '') // "public domain"
        .replace(/\(Pirate[a-z0-9. ]*\)/i, '')
        .replace(/\([a-z0-9. ]*Program\)|(Check|Sample) Program/i, '')
        .replace(/\([^)]*Proto[a-z0-9. ]*\)/i, '')
        .replace(/\([^)]*Sample[a-z0-9. ]*\)/i, '')
        .replace(/\(Spaceworld[a-z0-9. ]*\)/i, '')
        .replace(/\(Unl[a-z0-9. ]*\)/i, '')
        .replace(/\(v[0-9.-]+[a-z]*\)/i, '')
        .replace(/\(Version [0-9.]+[a-z]*\)/i, '')
        // ***** Good Tools *****
        .replace(/\[!\]/, '')
        .replace(/\[a[0-9]*\]/, '')
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
        .replace(/\(Wxn\)/i, '')
        .replace(/\((SC-3000|SG-1000|SF-7000|GG2SMS|MSX2SMS|SG2GG)\)/, '') // GoodSMS
        .replace(/\[(v|eb|eba|ebb|f125|f126)\]/, '') // GoodGBA
        .replace(/\((IQue|MB|MB2GBA)\)/, '') // GoodGBA
        .replace(/\[(C|S|BF)\]/, '') // GoodGBx
        .replace(/\((1|4|5|8|F|B|J-Cart|SN|REVXB|REVSC02|MP|MD Bundle|Alt Music)\)/, '') // GoodGen
        .replace(/\[(c|x)\]/, '') // GoodGen
        .replace(
          /\((RU|PC10|VS|Aladdin|Sachen|KC|FamiStudio|PRG0|PRG1|FDS Hack|GBA E-reader|E-GC|J-GC)\)/,
          '',
        ) // GoodNES
        .replace(/\[(FDS|FCN|U)\]/, '') // GoodNES
        .replace(/\((BS|ST|NP|NSS)\)/, '') // GoodSNES
        .replace(/\((Beta-WIP|Debug Version|GC|Save|Save-PAL|Z64-Save)\)/, '') // GoodN64
        // ***** TOSEC *****
        .replace(
          /\((AE|AL|AS|AT|AU|BA|BE|BG|BR|CA|CH|CL|CN|CS|CY|CZ|DE|DK|EE|EG|ES|EU|FI|FR|GB|GR|HK|HR|HU|ID|IE|IL|IN|IR|IS|IT|JO|JP|KR|LT|LU|LV|MN|MX|MY|NL|NO|NP|NZ|OM|PE|PH|PL|PT|QA|RO|RU|SE|SG|SI|SK|TH|TR|TW|US|VN|YU|ZA)\)/,
          '',
        ) // region
        .replace(
          /\((ar|bg|bs|cs|cy|da|de|el|en|eo|es|et|fa|fi|fr|ga|gu|he|hi|hr|hu|is|it|ja|ko|lt|lv|ms|nl|no|pl|pt|ro|ru|sk|sl|sq|sr|sv|th|tr|ur|vi|yi|zh)\)/,
          '',
        ) // language
        .replace(/\((demo|demo-kiosk|demo-playable|demo-rolling|demo-slideshow)\)/, '') // demo
        .replace(/\([0-9x]{4}(-[0-9x]{2}(-[0-9x]{2})?)?\)/, '') // YYYY-MM-DD
        .replace(/\((CGA|EGA|HGC|MCGA|MDA|NTSC|NTSC-PAL|PAL|PAL-60|PAL-NTSC|SVGA|VGA|XGA)\)/i, '') // video
        .replace(/\(M[0-9]+\)/, '') // language
        .replace(/\((CW|CW-R|FW|GW|GW-R|LW|PD|SW|SW-R)\)/i, '') // copyright
        .replace(/\((alpha|beta|preview|pre-release|proto)\)/i, '') // development
        .replace(/(\[(cr|f|h|m|p|t|tr|o|u|v|b|a|!)([0-9]+| [^\]]+)?\])+/i, '')
        .replace(/(\W)v[0-9]+\.[0-9]+(\W)/i, '$1 $2')
        // ***** Specific cases *****
        .replace(/'([0-9][0-9])/, '$1') // year abbreviations
        // ***** Console-specific *****
        // Nintendo - Game Boy
        .replace(/\(SGB Enhanced\)/i, '')
        // Nintendo - Game Boy Color
        .replace(/\(GB Compatible\)/i, '')
        // Nintendo - GameCube
        .replace(/\(GameCube\)/i, '')
        // Nintendo - Super Nintendo Entertainment System
        .replace(/\(NP\)/i, '') // "Nintendo Power"
        // Sega - Dreamcast
        .replace(/\[([0-9A-Z ]+(, )?)+\]$/, '') // TOSEC boxcode
        .replace(/\[[0-9]+S\]/, '') // TOSEC ring code
        .replaceAll(
          /\[(compilation|data identical to retail|fixed version|keyboard|limited edition|req\. microphone|scrambled|unscrambled|white label)\]/gi,
          '',
        ) // TOSEC
        .replace(/for Dreamcast/i, '')
        // Sega - Mega Drive / Genesis
        .replace(/\(MP\)/i, '') // "MegaPlay version"
        // Sega - Sega/Mega CD
        .replace(/\(RE?-?[0-9]*\)/, '')
        // Sony - PlayStation 1
        .replace(/\(EDC\)/i, '') // copy protection
        .replace(/\(PSone Books\)/i, '')
        .replace(/[(\]](SCES|SCUS|SLES|SLUS)-[0-9]+[(\]]/i, '')
        // Sony - PlayStation 3
        .replace(/\((Arcade|AVTool|Debug|Disc|Patch|Shop|Tool)\)/, '') // BIOS
        // Sony - PlayStation Portable
        .replace(/[(\]][UN][CLP][AEJKU][BFGHJMSXZ]-[0-9]+[(\]]/i, '')
        // ***** Cleanup *****
        .replaceAll(/  +/g, ' ')
        .trim()
    );
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
