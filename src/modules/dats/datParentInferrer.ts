import type ProgressBar from '../../console/progressBar.js';
import { ProgressBarSymbol } from '../../console/progressBar.js';
import IntlPoly from '../../polyfill/intlPoly.js';
import type DAT from '../../types/dats/dat.js';
import Game from '../../types/dats/game.js';
import Internationalization from '../../types/internationalization.js';
import type Options from '../../types/options.js';
import Module from '../module.js';

/**
 * Infer {@link Parent}s for all {@link DAT}s, even those that already have some parents.
 */
export default class DATParentInferrer extends Module {
  // ***** stripGameRegionAndLanguage *****
  private static readonly REGION_CODES_REGEX = new RegExp(
    `\\(((${Internationalization.REGION_CODES.join('|')})[,+-]? ?)+\\)`,
    'i',
  );
  private static readonly REGION_NAMES_REGEX = new RegExp(
    `\\(((${Internationalization.REGION_NAMES.join('|')})[,+-]? ?)+\\)`,
    'i',
  );
  private static readonly LATIN_AMERICA_REGEX = /\(Latin America\)/i;
  private static readonly LANGUAGES_REGEX = new RegExp(
    `\\(((${Internationalization.LANGUAGES.join('|')})[,+-]? ?)+\\)`,
    'i',
  );
  private static readonly MULTI_SPACE_REGEX = /  +/g;

  // ***** stripGameVariants — retail types *****
  private static readonly ALT_PAREN_REGEX = /\(Alt( [a-z0-9. ]*)?\)/i;
  private static readonly COLLECTORS_EDITION_REGEX = /\([^)]*Collector's Edition\)/i;
  private static readonly DIGITAL_RELEASE_REGEX = /\(Digital Release\)/i;
  private static readonly DISNEY_CLASSIC_REGEX = /\(Disney Classic Games\)/i;
  private static readonly EVERCADE_REGEX = /\(Evercade\)/i;
  private static readonly EXTRA_BOX_REGEX = /\(Extra Box\)/i;
  private static readonly EUROPEAN_VERSION_REGEX = / - European Version/i;
  private static readonly FUKKOKUBAN_REGEX = /\(Fukkokuban\)/i;
  private static readonly GENTEIBAN_REGEX = /\([^)]*Genteiban\)/i;
  private static readonly LIMITED_EDITION_REGEX = /\(Limited[^)]+Edition\)/i;
  private static readonly LIMITED_RUN_REGEX = /\(Limited Run Games\)/i;
  private static readonly LODGENET_REGEX = /\(LodgeNet\)/i;
  private static readonly MADE_IN_REGEX = /\(Made in [^)]+\)/i;
  private static readonly MAJOR_WAVE_REGEX = /\(Major Wave\)/i;
  private static readonly MIDWAY_CLASSICS_REGEX = /\((Midway Classics)\)/i;
  private static readonly PREMIUM_REGEX = /\([^)]*Premium [^)]+\)/i;
  private static readonly PREVIEW_DISC_REGEX = /\([^)]*Preview Disc\)/i;
  private static readonly QUBYTE_REGEX = /\(QUByte Classics\)/i;
  private static readonly RECALLED_REGEX = /\(Recalled\)/i;
  private static readonly RENKABAN_REGEX = /\(Renkaban\)/i;
  private static readonly REPRINT_REGEX = /\(Reprint\)/i;
  private static readonly RERELEASE_REGEX = /\(Rerelease\)/i;
  private static readonly RETRO_BIT_REGEX = /\(Retro-Bit\)/i;
  private static readonly REV_VERSION_REGEX = /\((Rev|Version)\s*[a-z0-9.-]*\)/i;
  private static readonly SEISANBAN_REGEX = /\([^)]*Seisanban\)/i;
  private static readonly SHOTENBAN_REGEX = /\(Shotenban\)/i;
  private static readonly SPECIAL_PACK_REGEX = /\(Special Pack\)/i;
  private static readonly STEAM_REGEX = /\(Steam\)/i;
  private static readonly SWITCH_ONLINE_REGEX = /\(Switch Online\)/i;
  private static readonly THE_BEST_REGEX = /\([^)]+ the Best\)/i;
  private static readonly TAIOUBAN_REGEX = /\([^)]*Taiouban[^)]*\)/i;
  private static readonly TOKUBETSUBAN_REGEX = /\([^)]*Tokubetsu-?ban[^)]*\)/i;
  private static readonly VIRTUAL_CONSOLE_REGEX = /\([^)]*Virtual Console\)/i;

  // ***** stripGameVariants — non-retail types *****
  private static readonly DATE_REGEX = /\([0-9]{4}-[0-9]{2}-[0-9]{2}\)/;
  private static readonly BUILD_REGEX = /\(Build [a-z0-9. ]+\)/i;
  private static readonly BUNG_PAREN_REGEX = /\(Bung\)/i;
  private static readonly KIOSK_REGEX = /\(Kiosk[^)]*\)/i;
  private static readonly NOT_FOR_RESALE_REGEX = /\(Not for Resale\)/i;
  private static readonly PUBLIC_DOMAIN_REGEX = /\(PD\)/i;
  private static readonly SPACEWORLD_REGEX = /\(Spaceworld[a-z0-9. ]*\)/i;
  private static readonly PAREN_VERSION_REGEX = /\(v[0-9.-]+[a-z]*\)/i;
  private static readonly PAREN_VERSION_LONG_REGEX = /\(Version [0-9.]+[a-z]*\)/i;

  // ***** stripGameVariants — Good Tools *****
  private static readonly VERIFIED_REGEX = /\[!\]/;
  private static readonly ALT_BRACKET_REGEX = /\[a[0-9]*\]/;
  private static readonly BUNG_BRACKET_REGEX = /\[bf\]/;
  private static readonly BAD_CHECKSUM_REGEX = /\[c\]/;
  private static readonly MIA_STRIP_REGEX = /\[MIA\]/;
  private static readonly PENDING_DUMP_REGEX = /\[!p\]/;
  private static readonly BAD_DUMP_REGEX = /\[x\]/;
  private static readonly WXN_REGEX = /\(Wxn\)/i;
  private static readonly GOOD_SMS_REGEX = /\((SC-3000|SG-1000|SF-7000|GG2SMS|MSX2SMS|SG2GG)\)/;
  private static readonly GOOD_GBA_BRACKET_REGEX = /\[(v|eb|eba|ebb|f125|f126)\]/;
  private static readonly GOOD_GBA_PAREN_REGEX = /\((IQue|MB|MB2GBA)\)/;
  private static readonly GOOD_GBX_REGEX = /\[(C|S|BF)\]/;
  private static readonly GOOD_GEN_PAREN_REGEX =
    /\((1|4|5|8|F|B|J-Cart|SN|REVXB|REVSC02|MP|MD Bundle|Alt Music)\)/;
  private static readonly GOOD_GEN_BRACKET_REGEX = /\[(c|x)\]/;
  private static readonly GOOD_NES_PAREN_REGEX =
    /\((RU|PC10|VS|Aladdin|Sachen|KC|FamiStudio|PRG0|PRG1|FDS Hack|GBA E-reader|E-GC|J-GC)\)/;
  private static readonly GOOD_NES_BRACKET_REGEX = /\[(FDS|FCN|U)\]/;
  private static readonly GOOD_SNES_REGEX = /\((BS|ST|NP|NSS)\)/;
  private static readonly GOOD_N64_REGEX = /\((Beta-WIP|Debug Version|GC|Save|Save-PAL|Z64-Save)\)/;

  // ***** stripGameVariants — TOSEC *****
  private static readonly TOSEC_REGION_REGEX =
    /\((AE|AL|AS|AT|AU|BA|BE|BG|BR|CA|CH|CL|CN|CS|CY|CZ|DE|DK|EE|EG|ES|EU|FI|FR|GB|GR|HK|HR|HU|ID|IE|IL|IN|IR|IS|IT|JO|JP|KR|LT|LU|LV|MN|MX|MY|NL|NO|NP|NZ|OM|PE|PH|PL|PT|QA|RO|RU|SE|SG|SI|SK|TH|TR|TW|US|VN|YU|ZA)\)/;
  private static readonly TOSEC_LANGUAGE_REGEX =
    /\((ar|bg|bs|cs|cy|da|de|el|en|eo|es|et|fa|fi|fr|ga|gu|he|hi|hr|hu|is|it|ja|ko|lt|lv|ms|nl|no|pl|pt|ro|ru|sk|sl|sq|sr|sv|th|tr|ur|vi|yi|zh)\)/;
  private static readonly TOSEC_DEMO_REGEX =
    /\((demo|demo-kiosk|demo-playable|demo-rolling|demo-slideshow)\)/;
  private static readonly TOSEC_DATE_REGEX = /\([0-9x]{4}(-[0-9x]{2}(-[0-9x]{2})?)?\)/;
  private static readonly TOSEC_VIDEO_REGEX =
    /\((CGA|EGA|HGC|MCGA|MDA|NTSC|NTSC-PAL|PAL|PAL-60|PAL-NTSC|SVGA|VGA|XGA)\)/i;
  private static readonly TOSEC_MULTI_LANG_REGEX = /\(M[0-9]+\)/;
  private static readonly TOSEC_COPYRIGHT_REGEX = /\((CW|CW-R|FW|GW|GW-R|LW|PD|SW|SW-R)\)/i;
  private static readonly TOSEC_DEVELOPMENT_REGEX = /\((alpha|beta|preview|pre-release|proto)\)/i;
  private static readonly TOSEC_DUMP_FLAGS_REGEX =
    /(\[(cr|f|h|m|p|t|tr|o|u|v|b|a|!)([0-9]+| [^\]]+)?\])+/i;
  private static readonly TOSEC_INLINE_VERSION_REGEX = /(\W)v[0-9]+\.[0-9]+(\W)/i;

  // ***** stripGameVariants — specific cases *****
  private static readonly YEAR_ABBREVIATION_REGEX = /'([0-9][0-9])/;

  // ***** stripGameVariants — console-specific *****
  private static readonly SGB_ENHANCED_REGEX = /\(SGB Enhanced\)/i;
  private static readonly GB_COMPATIBLE_REGEX = /\(GB Compatible\)/i;
  private static readonly GAMECUBE_REGEX = /\(GameCube\)/i;
  private static readonly NINTENDO_POWER_REGEX = /\(NP\)/i;
  private static readonly DREAMCAST_BOXCODE_REGEX = /\[([0-9A-Z ]+(, )?)+\]$/;
  private static readonly DREAMCAST_RING_CODE_REGEX = /\[[0-9]+S\]/;
  private static readonly DREAMCAST_TOSEC_REGEX =
    /\[(compilation|data identical to retail|fixed version|keyboard|limited edition|req\. microphone|scrambled|unscrambled|white label)\]/gi;
  private static readonly FOR_DREAMCAST_REGEX = /for Dreamcast/i;
  private static readonly MEGAPLAY_REGEX = /\(MP\)/i;
  private static readonly RING_CODE_STRIP_REGEX = /\(RE?-?[0-9]*\)/;
  private static readonly EDC_REGEX = /\(EDC\)/i;
  private static readonly PSONE_BOOKS_REGEX = /\(PSone Books\)/i;
  private static readonly PS1_SERIAL_REGEX = /[(\]](SCES|SCUS|SLES|SLUS)-[0-9]+[(\]]/i;
  private static readonly PS3_BIOS_REGEX = /\((Arcade|AVTool|Debug|Disc|Patch|Shop|Tool)\)/;
  private static readonly PSP_SERIAL_REGEX = /[(\]][UN][CLP][AEJKU][BFGHJMSXZ]-[0-9]+[(\]]/i;

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
      `${dat.getName()}: inferring parents for ${IntlPoly.toLocaleString(dat.getGames().length)} game${dat.getGames().length === 1 ? '' : 's'}`,
    );
    this.progressBar.setSymbol(ProgressBarSymbol.DAT_GROUPING_SIMILAR);
    this.progressBar.resetProgress(dat.getGames().length);

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
      .toSorted((a, b) => a[0].localeCompare(b[0]))
      .map(([, games]) => games);

    const newGames = groupedGames.flatMap((games) => DATParentInferrer.electParent(games));
    const inferredDat = dat.withGames(newGames);
    this.progressBar.logTrace(
      `${inferredDat.getName()}: grouped to ${IntlPoly.toLocaleString(inferredDat.getParents().length)} parent${inferredDat.getParents().length === 1 ? '' : 's'}`,
    );

    this.progressBar.logTrace('done inferring parents');
    return inferredDat;
  }

  private static stripGameRegionAndLanguage(name: string): string {
    let strippedName = name
      // ***** Regions *****
      .replace(DATParentInferrer.REGION_CODES_REGEX, '')
      .replace(DATParentInferrer.REGION_NAMES_REGEX, '')
      .replace(DATParentInferrer.LATIN_AMERICA_REGEX, '');
    Internationalization.REGION_REGEX.forEach((regex) => {
      strippedName = strippedName.replace(regex, '');
    });
    // ***** Languages *****
    return (
      strippedName
        .replace(DATParentInferrer.LANGUAGES_REGEX, '')
        // ***** Cleanup *****
        .replaceAll(DATParentInferrer.MULTI_SPACE_REGEX, ' ')
        .trim()
    );
  }

  private static stripGameVariants(name: string): string {
    return (
      name
        // ***** Retail types *****
        .replace(DATParentInferrer.ALT_PAREN_REGEX, '')
        .replace(DATParentInferrer.COLLECTORS_EDITION_REGEX, '')
        .replace(DATParentInferrer.DIGITAL_RELEASE_REGEX, '')
        .replace(DATParentInferrer.DISNEY_CLASSIC_REGEX, '')
        .replace(DATParentInferrer.EVERCADE_REGEX, '')
        .replace(DATParentInferrer.EXTRA_BOX_REGEX, '')
        .replace(DATParentInferrer.EUROPEAN_VERSION_REGEX, '')
        .replace(DATParentInferrer.FUKKOKUBAN_REGEX, '') // "reprint"
        .replace(DATParentInferrer.GENTEIBAN_REGEX, '') // "limited edition"
        .replace(DATParentInferrer.LIMITED_EDITION_REGEX, '')
        .replace(DATParentInferrer.LIMITED_RUN_REGEX, '')
        .replace(DATParentInferrer.LODGENET_REGEX, '')
        .replace(DATParentInferrer.MADE_IN_REGEX, '')
        .replace(DATParentInferrer.MAJOR_WAVE_REGEX, '')
        .replace(DATParentInferrer.MIDWAY_CLASSICS_REGEX, '')
        .replace(DATParentInferrer.PREMIUM_REGEX, '')
        .replace(DATParentInferrer.PREVIEW_DISC_REGEX, '')
        .replace(DATParentInferrer.QUBYTE_REGEX, '')
        .replace(DATParentInferrer.RECALLED_REGEX, '')
        .replace(DATParentInferrer.RENKABAN_REGEX, '') // "cheap edition"
        .replace(DATParentInferrer.REPRINT_REGEX, '')
        .replace(DATParentInferrer.RERELEASE_REGEX, '')
        .replace(DATParentInferrer.RETRO_BIT_REGEX, '')
        .replace(DATParentInferrer.REV_VERSION_REGEX, '')
        .replace(DATParentInferrer.SEISANBAN_REGEX, '') // "production version"
        .replace(DATParentInferrer.SHOTENBAN_REGEX, '') // "bookstore edition"
        .replace(DATParentInferrer.SPECIAL_PACK_REGEX, '')
        .replace(DATParentInferrer.STEAM_REGEX, '')
        .replace(DATParentInferrer.SWITCH_ONLINE_REGEX, '')
        .replace(DATParentInferrer.THE_BEST_REGEX, '')
        .replace(DATParentInferrer.TAIOUBAN_REGEX, '') // "compatible version"
        .replace(DATParentInferrer.TOKUBETSUBAN_REGEX, '') // "special edition"
        .replace(DATParentInferrer.VIRTUAL_CONSOLE_REGEX, '')
        // ***** Non-retail types *****
        .replace(DATParentInferrer.DATE_REGEX, '') // YYYY-MM-DD
        .replace(Game.AFTERMARKET_REGEX, '')
        .replace(Game.ALPHA_REGEX, '')
        .replace(Game.BETA_REGEX, '')
        .replace(DATParentInferrer.BUILD_REGEX, '')
        .replace(DATParentInferrer.BUNG_PAREN_REGEX, '')
        .replace(Game.DEBUG_REGEX, '')
        .replace(Game.DEMO_REGEX, '')
        .replace(Game.HACK_PAREN_REGEX, '')
        .replace(Game.HOMEBREW_REGEX, '')
        .replace(DATParentInferrer.KIOSK_REGEX, '')
        .replace(DATParentInferrer.NOT_FOR_RESALE_REGEX, '')
        .replace(DATParentInferrer.PUBLIC_DOMAIN_REGEX, '') // "public domain"
        .replace(Game.PIRATED_PAREN_REGEX, '')
        .replace(Game.PROGRAM_REGEX, '')
        .replace(Game.PROTOTYPE_REGEX, '')
        .replace(Game.SAMPLE_REGEX, '')
        .replace(DATParentInferrer.SPACEWORLD_REGEX, '')
        .replace(Game.UNLICENSED_REGEX, '')
        .replace(DATParentInferrer.PAREN_VERSION_REGEX, '')
        .replace(DATParentInferrer.PAREN_VERSION_LONG_REGEX, '')
        // ***** Good Tools *****
        .replace(DATParentInferrer.VERIFIED_REGEX, '')
        .replace(DATParentInferrer.ALT_BRACKET_REGEX, '')
        .replace(Game.BAD_REGEX, '')
        .replace(DATParentInferrer.BUNG_BRACKET_REGEX, '')
        .replace(DATParentInferrer.BAD_CHECKSUM_REGEX, '')
        .replace(Game.FIXED_REGEX, '')
        .replace(Game.HACK_BRACKET_REGEX, '')
        .replace(DATParentInferrer.MIA_STRIP_REGEX, '')
        .replace(Game.OVERDUMP_REGEX, '')
        .replace(DATParentInferrer.PENDING_DUMP_REGEX, '')
        .replace(Game.PIRATED_BRACKET_REGEX, '')
        .replace(Game.TRAINER_REGEX, '')
        .replace(Game.TRANSLATED_REGEX, '')
        .replace(DATParentInferrer.BAD_DUMP_REGEX, '')
        .replace(DATParentInferrer.WXN_REGEX, '')
        .replace(DATParentInferrer.GOOD_SMS_REGEX, '') // GoodSMS
        .replace(DATParentInferrer.GOOD_GBA_BRACKET_REGEX, '') // GoodGBA
        .replace(DATParentInferrer.GOOD_GBA_PAREN_REGEX, '') // GoodGBA
        .replace(DATParentInferrer.GOOD_GBX_REGEX, '') // GoodGBx
        .replace(DATParentInferrer.GOOD_GEN_PAREN_REGEX, '') // GoodGen
        .replace(DATParentInferrer.GOOD_GEN_BRACKET_REGEX, '') // GoodGen
        .replace(DATParentInferrer.GOOD_NES_PAREN_REGEX, '') // GoodNES
        .replace(DATParentInferrer.GOOD_NES_BRACKET_REGEX, '') // GoodNES
        .replace(DATParentInferrer.GOOD_SNES_REGEX, '') // GoodSNES
        .replace(DATParentInferrer.GOOD_N64_REGEX, '') // GoodN64
        // ***** TOSEC *****
        .replace(DATParentInferrer.TOSEC_REGION_REGEX, '') // region
        .replace(DATParentInferrer.TOSEC_LANGUAGE_REGEX, '') // language
        .replace(DATParentInferrer.TOSEC_DEMO_REGEX, '') // demo
        .replace(DATParentInferrer.TOSEC_DATE_REGEX, '') // YYYY-MM-DD
        .replace(DATParentInferrer.TOSEC_VIDEO_REGEX, '') // video
        .replace(DATParentInferrer.TOSEC_MULTI_LANG_REGEX, '') // language
        .replace(DATParentInferrer.TOSEC_COPYRIGHT_REGEX, '') // copyright
        .replace(DATParentInferrer.TOSEC_DEVELOPMENT_REGEX, '') // development
        .replace(DATParentInferrer.TOSEC_DUMP_FLAGS_REGEX, '')
        .replace(DATParentInferrer.TOSEC_INLINE_VERSION_REGEX, '$1 $2')
        // ***** Specific cases *****
        .replace(DATParentInferrer.YEAR_ABBREVIATION_REGEX, '$1') // year abbreviations
        // ***** Console-specific *****
        // Nintendo - Game Boy
        .replace(DATParentInferrer.SGB_ENHANCED_REGEX, '')
        // Nintendo - Game Boy Color
        .replace(DATParentInferrer.GB_COMPATIBLE_REGEX, '')
        // Nintendo - GameCube
        .replace(DATParentInferrer.GAMECUBE_REGEX, '')
        // Nintendo - Super Nintendo Entertainment System
        .replace(DATParentInferrer.NINTENDO_POWER_REGEX, '') // "Nintendo Power"
        // Sega - Dreamcast
        .replace(DATParentInferrer.DREAMCAST_BOXCODE_REGEX, '') // TOSEC boxcode
        .replace(DATParentInferrer.DREAMCAST_RING_CODE_REGEX, '') // TOSEC ring code
        .replaceAll(DATParentInferrer.DREAMCAST_TOSEC_REGEX, '') // TOSEC
        .replace(DATParentInferrer.FOR_DREAMCAST_REGEX, '')
        // Sega - Mega Drive / Genesis
        .replace(DATParentInferrer.MEGAPLAY_REGEX, '') // "MegaPlay version"
        // Sega - Sega/Mega CD
        .replace(DATParentInferrer.RING_CODE_STRIP_REGEX, '')
        // Sony - PlayStation 1
        .replace(DATParentInferrer.EDC_REGEX, '') // copy protection
        .replace(DATParentInferrer.PSONE_BOOKS_REGEX, '')
        .replace(DATParentInferrer.PS1_SERIAL_REGEX, '')
        // Sony - PlayStation 3
        .replace(DATParentInferrer.PS3_BIOS_REGEX, '') // BIOS
        // Sony - PlayStation Portable
        .replace(DATParentInferrer.PSP_SERIAL_REGEX, '')
        // ***** Cleanup *****
        .replaceAll(DATParentInferrer.MULTI_SPACE_REGEX, ' ')
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
          return game.withProps({ cloneOf: undefined, cloneOfId: undefined });
        }
        if (retailParent.getId() !== undefined) {
          // id/cloneofid-based DAT
          return game.withProps({ cloneOfId: retailParent.getId(), cloneOf: undefined });
        }
        // name/cloneof-based DAT
        return game.withProps({ cloneOfId: undefined, cloneOf: retailParent.getName() });
      }

      // Assume this game's non-retail parent.
      // If we got here, then we know these games share the same fully-stripped name. Assume the
      //  first game seen in the DAT should be the parent.
      // The only danger with this assumption is it will affect `--prefer-parent`, but that's not
      //  likely a commonly used option.
      if (idx === 0) {
        // This game is the parent
        return game.withProps({ cloneOf: undefined, cloneOfId: undefined });
      }
      if (games[0].getId() !== undefined) {
        // id/cloneofid-based DAT
        return game.withProps({ cloneOfId: games[0].getId(), cloneOf: undefined });
      }
      // name/cloneof-based DAT
      return game.withProps({ cloneOfId: undefined, cloneOf: games[0].getName() });
    });
  }
}
