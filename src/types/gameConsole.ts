import path from 'path';

export default class GameConsole {
  /**
   * Analogue Pocket ROMs go in the /Assets/{pocket}/common/ directory
   *
   * MiSTer ROMs go in the /games/{mister}/ directory:
   *  @see https://mister-devel.github.io/MkDocs_MiSTer/developer/corenames/
   *  @see https://mister-devel.github.io/MkDocs_MiSTer/cores/console/
   *  @see https://mister-devel.github.io/MkDocs_MiSTer/cores/computer/
   *
   * OnionOS/GarlicOS ROMs go in the /Roms/{onion} directory:
   *  @see https://github.com/OnionUI/Onion/wiki/Emulators
   *
   * @see https://emulation.gametechwiki.com/index.php/List_of_filetypes
   * @see https://emulation.fandom.com/wiki/List_of_filetypes
   */
  private static readonly CONSOLES: GameConsole[] = [
    // Amstrad
    new GameConsole(/CPC/i, [], undefined, 'Amstrad', 'CPC'),
    // Arduboy
    new GameConsole(/Arduboy/i, ['.arduboy', '.hex'], 'arduboy', 'Arduboy', undefined),
    // Atari
    new GameConsole(/800|8-bit Family/, ['.atr', '.atx'], undefined, 'ATARI800', 'EIGHTHUNDRED'),
    new GameConsole(/2600/, ['.a26', '.act', '.pb', '.tv', '.tvr', '.mn', '.cv', '.eb', '.ef', '.efr', '.ua', '.x07', '.sb'], '2600', 'Atari2600', 'ATARI'),
    new GameConsole(/5200/, ['.a52'], undefined, 'Atari5200', 'FIFTYTWOHUNDRED'),
    new GameConsole(/7800/, ['.a78'], '7800', 'Atari7800', 'SEVENTYEIGHTHUNDRED'),
    new GameConsole(/Jaguar/i, ['.j64'], undefined, undefined, 'JAGUAR'),
    new GameConsole(/Lynx/i, ['.lnx', '.lyx'], undefined, 'AtariLynx', 'LYNX'),
    new GameConsole(/Atari (- )?ST/i, ['.msa', '.stx'], undefined, 'AtariST', 'ATARIST'),
    // Bally
    new GameConsole(/Astrocade/i, [/* '.bin' */], undefined, 'Astrocade', undefined),
    // Bandai
    new GameConsole(/WonderSwan/i, ['.ws'], 'wonderswan', 'WonderSwan', 'WS'),
    new GameConsole(/WonderSwan Color/i, ['.wsc'], 'wonderswan', 'WonderSwan', 'WS'),
    // Bit Corporation
    new GameConsole(/Gamate/i, [/* '.bin' */], 'gamate', 'Gamate', undefined),
    // Capcom
    // TODO(cemmer): CPS1, CPS2, CPS3
    // Casio
    new GameConsole(/PV-?1000/i, [/* '.bin' */], undefined, 'Casio_PV-1000', undefined),
    // Commodore
    new GameConsole(/Amiga/i, [], 'amiga', 'Amiga', 'AMIGA'),
    new GameConsole(/Commodore 64/i, ['.crt', '.d64', '.t64'], undefined, 'C64', 'COMMODORE'),
    // Coleco
    new GameConsole(/ColecoVision/i, ['.col'], 'coleco', 'Coleco', 'COLECO'),
    // Emerson
    new GameConsole(/Arcadia/i, [/* '.bin' */], 'arcadia', 'Arcadia', undefined),
    // Entex
    new GameConsole(/Adventure Vision/i, [/* '.bin' */], 'avision', 'AVision', undefined),
    // Fairchild
    new GameConsole(/Channel F/i, [/* '.bin' */], 'channel_f', 'ChannelF', 'FAIRCHILD'),
    // GCE
    new GameConsole(/Vectrex/i, ['.vec'], undefined, 'Vectrex', 'VECTREX'),
    // Interton
    new GameConsole(/VC ?4000/i, [/* '.bin' */], undefined, 'VC4000', undefined),
    // Magnavox
    new GameConsole(/Odyssey 2/i, [/* '.bin' */], 'odyssey2', 'Odyssey2', 'ODYSSEY'),
    // Mattel
    new GameConsole(/Intellivision/i, ['.int'], 'intv', 'Intellivision', 'INTELLIVISION'),
    // Microsoft
    new GameConsole(/MSX/i, [], undefined, 'MSX', 'MSX'),
    // Nichibutsu
    new GameConsole(/My Vision/i, [], undefined, 'MyVision', undefined),
    // NEC
    new GameConsole(/PC Engine|TurboGrafx/i, ['.pce'], 'pce', 'TGFX16', 'PCE'),
    new GameConsole(/(PC Engine|TurboGrafx) CD/i, [/* '.bin', '.cue' */], 'pcecd', 'TGFX16', 'PCECD'),
    new GameConsole(/SuperGrafx/i, ['.sgx'], 'pce', 'TGFX16', 'SGFX'),
    new GameConsole(/PC-88/i, ['.d88'], undefined, 'PC8801', 'PCEIGHTYEIGHT'),
    new GameConsole(/PC-98/i, ['.d98'], undefined, undefined, 'PCNINETYEIGHT'),
    // Nintendo
    new GameConsole(/FDS|Famicom Computer Disk System/i, ['.fds'], 'nes', 'NES', 'FDS'),
    new GameConsole(/Game (and|&) Watch/i, ['.mgw'], undefined, 'GameNWatch', 'GW'),
    new GameConsole(/GB|Game ?Boy/i, ['.gb', '.sgb'], 'gb', 'Gameboy', 'GB'), // pocket:sgb for spiritualized1997
    new GameConsole(/GBA|Game ?Boy Advance/i, ['.gba', '.srl'], 'gba', 'GBA', 'GBA'),
    new GameConsole(/GBC|Game ?Boy Color/i, ['.gbc'], 'gbc', 'Gameboy', 'GBC'),
    new GameConsole(/(\W|^)NES(\W|$)|Nintendo Entertainment System/i, ['.nes', '.nez'], 'nes', 'NES', 'FC'),
    new GameConsole(/Pokemon Mini/i, ['.min'], 'poke_mini', 'PokemonMini', 'POKE'),
    new GameConsole(/Satellaview/i, ['.bs'], 'snes', 'SNES', 'SATELLAVIEW'),
    new GameConsole(/Sufami/i, [], undefined, undefined, 'SUFAMI'),
    new GameConsole(/(\W|^)SNES(\W|$)|Super Nintendo Entertainment System/i, ['.sfc'], 'snes', 'SNES', 'SFC'),
    new GameConsole(/Virtual Boy/i, ['.vb', '.vboy'], undefined, undefined, 'VB'),
    // Panasonic
    new GameConsole(/3DO/i, [/* '.bin', '.cue' */], undefined, undefined, 'PANASONIC'),
    // Philips
    new GameConsole(/Videopac/i, [/* '.bin' */], undefined, 'Odyssey2', 'VIDEOPAC'),
    // RCA
    new GameConsole(/Studio (2|II)/i, [/* '.bin' */], 'studio2', undefined, undefined),
    // Sega
    new GameConsole(/32X/i, ['.32x'], undefined, 'S32X', 'THIRTYTWOX'),
    new GameConsole(/Game Gear/i, ['.gg'], 'gg', 'SMS', 'GG'),
    new GameConsole(/Master System/i, ['.sms'], 'sms', 'SMS', 'MS'),
    new GameConsole(/(Mega|Sega) CD/i, [/* '.bin', '.cue' */], undefined, 'MegaCD', 'SEGACD'),
    new GameConsole(/Mega Drive|Genesis/i, ['.gen', '.md', '.mdx', '.sgd', '.smd'], 'genesis', 'Genesis', 'MD'),
    new GameConsole(/SG-?1000/i, ['.sc', '.sg'], 'sg1000', 'SG1000', 'SEGASGONE'),
    // Sharp
    new GameConsole(/X1/i, ['.2d', '.2hd', '.dx1', '.tfd'], undefined, undefined, 'XONE'),
    new GameConsole(/X68000/i, [], undefined, 'X68000', 'X68000'),
    // Sinclair
    new GameConsole(/ZX Spectrum/i, ['.scl', '.szx', '.z80'], undefined, 'Spectrum', 'ZXS'),
    // TODO(cemmer): ZX-81
    // SNK
    new GameConsole(/Neo ?Geo/i, [], 'ng', 'NeoGeo', 'NEOGEO'),
    new GameConsole(/Neo ?Geo CD/i, [/* '.bin', '.cue' */], undefined, undefined, 'NEOCD'),
    new GameConsole(/Neo ?Geo Pocket/i, ['.ngp'], undefined, undefined, 'NGP'),
    new GameConsole(/Neo ?Geo Pocket Color/i, ['.ngc'], undefined, undefined, 'NGP'),
    // Sony
    new GameConsole(/PlayStation/i, [/* '.bin', '.cue' */], undefined, 'PSX', 'PS'),
    new GameConsole(/PlayStation [2-9]/i, [/* '.bin', '.cue' */], undefined, undefined, undefined),
    // Timetop
    new GameConsole(/GameKing/i, [/* '.bin' */], 'game_king', undefined, undefined),
    // VTech
    new GameConsole(/CreatiVision/i, [/* '.rom' */], 'creativision', 'CreatiVision', undefined),
    // Watara
    new GameConsole(/Supervision/i, ['.sv'], 'supervision', 'SuperVision', 'SUPERVISION'),
    // Wellback
    new GameConsole(/Mega Duck/i, [/* '.bin',  */'.md1', '.md2'], 'mega_duck', undefined, 'MEGADUCK'),
  ];

  readonly regex: RegExp;

  readonly extensions: string[];

  readonly pocket?: string;

  readonly mister?: string;

  readonly onion?: string;

  constructor(
    regex: RegExp,
    extensions: string[],
    pocket?: string,
    mister?: string,
    onion?: string,
  ) {
    this.regex = regex;
    this.extensions = extensions;
    this.pocket = pocket;
    this.mister = mister;
    this.onion = onion;
  }

  static getForFilename(filePath: string): GameConsole | undefined {
    const fileExtension = path.extname(filePath).toLowerCase();
    return this.CONSOLES
      .filter((console) => console.getExtensions().some((ext) => ext === fileExtension))[0];
  }

  static getForConsoleName(consoleName: string): GameConsole | undefined {
    return this.CONSOLES
      .slice().reverse() // more specific names come second (e.g. "Game Boy" and "Game Boy Color")
      .filter((console) => console.getRegex().test(consoleName))[0];
  }

  getRegex(): RegExp {
    return this.regex;
  }

  getExtensions(): string[] {
    return this.extensions;
  }

  getPocket(): string | undefined {
    return this.pocket;
  }

  getMister(): string | undefined {
    return this.mister;
  }

  getOnion(): string | undefined {
    return this.onion;
  }
}
