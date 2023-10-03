import path from 'node:path';

/**
 * A class of information about specific game consoles and their names, standard file extensions,
 * and how to replace output tokens such as `{pocket}`.
 */
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
   * Batocera ROMs go in the roms/{batocera} directory:
   *  @see https://wiki.batocera.org/systems
   *
   * JELOS ROMs go in the {jelos} directory:
   *  @see https://github.com/JustEnoughLinuxOS/distribution/blob/main/documentation/PER_DEVICE_DOCUMENTATION/AMD64/SUPPORTED_EMULATORS_AND_CORES.md
   *
   * Other:
   *  @see https://emulation.gametechwiki.com/index.php/List_of_filetypes
   *  @see https://emulation.fandom.com/wiki/List_of_filetypes
   *  @see https://github.com/OpenEmu/OpenEmu/wiki/User-guide:-Importing
   */
  private static readonly CONSOLES: GameConsole[] = [
    // Amstrad
    new GameConsole(/CPC/i, [], undefined, 'Amstrad', 'CPC', 'amstradcpc', 'amstradcpc'),
    // Arduboy
    new GameConsole(/Arduboy/i, ['.arduboy', '.hex'], 'arduboy', 'Arduboy', undefined, 'arduboy', 'arduboy'),
    // Atari
    new GameConsole(/800|8-bit Family/, ['.atr', '.atx'], undefined, 'ATARI800', 'EIGHTHUNDRED', 'atari800', 'atari800'),
    new GameConsole(/2600/, ['.a26', '.act', '.pb', '.tv', '.tvr', '.mn', '.cv', '.eb', '.ef', '.efr', '.ua', '.x07', '.sb'], '2600', 'Atari2600', 'ATARI', 'atari2600', 'atari2600'),
    new GameConsole(/5200/, ['.a52'], undefined, 'Atari5200', 'FIFTYTWOHUNDRED', 'atari5200', 'atari5200'),
    new GameConsole(/7800/, ['.a78'], '7800', 'Atari7800', 'SEVENTYEIGHTHUNDRED', 'atari7800', 'atari7800'),
    new GameConsole(/Jaguar/i, ['.j64'], undefined, undefined, 'JAGUAR', 'jaguar', 'atarijaguar'),
    new GameConsole(/Lynx/i, ['.lnx', '.lyx'], undefined, 'AtariLynx', 'LYNX', 'lynx', 'atarilynx'),
    new GameConsole(/Atari (- )?ST/i, ['.msa', '.st', '.stx'], undefined, 'AtariST', 'ATARIST', 'atarist', 'atarist'),
    // Bally
    new GameConsole(/Astrocade/i, [/* '.bin' */], undefined, 'Astrocade', undefined, 'astrocde', undefined),
    // Bandai
    new GameConsole(/WonderSwan/i, ['.ws'], 'wonderswan', 'WonderSwan', 'WS', 'wswan', 'wonderswan'),
    new GameConsole(/WonderSwan Color/i, ['.wsc'], 'wonderswan', 'WonderSwan', 'WS', 'wswanc', 'wonderswancolor'),
    // Bit Corporation
    new GameConsole(/Gamate/i, [/* '.bin' */], 'gamate', 'Gamate', undefined, 'gamate', undefined),
    // Capcom
    // TODO(cemmer): CPS1, CPS2, CPS3
    // Casio
    new GameConsole(/PV-?1000/i, [/* '.bin' */], undefined, 'Casio_PV-1000', undefined, 'pv1000', undefined),
    // Commodore
    new GameConsole(/Amiga/i, [], 'amiga', 'Amiga', 'AMIGA', undefined, 'amiga'),
    new GameConsole(/Amiga CD32/i, [/* '.bin', '.cue' */], undefined, undefined, undefined, 'amigacd32', 'amigacd32'),
    new GameConsole(/Amiga CDTV/i, [/* '.bin', '.cue' */], undefined, undefined, undefined, 'amigacdtv', undefined),
    new GameConsole(/Commodore 64/i, ['.crt', '.d64', '.t64'], undefined, 'C64', 'COMMODORE', 'c64', 'c64'),
    // Coleco
    new GameConsole(/ColecoVision/i, ['.col'], 'coleco', 'Coleco', 'COLECO', 'colecovision', 'coleco'),
    // Emerson
    new GameConsole(/Arcadia/i, [/* '.bin' */], 'arcadia', 'Arcadia', undefined, 'arcadia', undefined),
    // Entex
    new GameConsole(/Adventure Vision/i, [/* '.bin' */], 'avision', 'AVision', undefined, 'advision', undefined),
    // Epoch
    new GameConsole(/Super Cassette Vision/i, [/* '.bin' */], undefined, undefined, undefined, 'scv', undefined),
    // Fairchild
    new GameConsole(/Channel F/i, [/* '.bin' */], 'channel_f', 'ChannelF', 'FAIRCHILD', 'channelf', 'channelf'),
    // Funtech
    new GameConsole(/Super A'?Can/i, [/* '.bin' */], undefined, undefined, undefined, 'supracan', undefined),
    // GCE
    new GameConsole(/Vectrex/i, ['.vec'], undefined, 'Vectrex', 'VECTREX', 'vectrex', 'vectrex'),
    // Interton
    new GameConsole(/VC ?4000/i, [/* '.bin' */], undefined, 'VC4000', undefined, 'vc4000', undefined),
    // Magnavox
    new GameConsole(/Odyssey 2/i, [/* '.bin' */], 'odyssey2', 'Odyssey2', 'ODYSSEY', 'o2em', 'odyssey'),
    // Mattel
    new GameConsole(/Intellivision/i, ['.int'], 'intv', 'Intellivision', 'INTELLIVISION', 'intellivision', 'intellivision'),
    // Microsoft
    new GameConsole(/MSX/i, [], undefined, 'MSX', 'MSX', 'msx1', 'msx'),
    new GameConsole(/MSX2/i, [], undefined, 'MSX', 'MSX', 'msx2', 'msx2'),
    new GameConsole(/MSX2+/i, [], undefined, 'MSX', 'MSX', 'msx2+', undefined),
    new GameConsole(/MSX TurboR/i, [], undefined, 'MSX', 'MSX', 'msxturbor', undefined),
    new GameConsole(/Xbox/i, [/* '.iso' */], undefined, undefined, undefined, 'xbox', 'xbox'),
    new GameConsole(/Xbox 360/i, [/* '.iso' */], undefined, undefined, undefined, 'xbox360', undefined),
    // Nichibutsu
    new GameConsole(/My Vision/i, [], undefined, 'MyVision', undefined, undefined, undefined),
    // NEC
    new GameConsole(/PC Engine|TurboGrafx/i, ['.pce'], 'pce', 'TGFX16', 'PCE', 'pcengine', 'tg16'),
    new GameConsole(/(PC Engine|TurboGrafx) CD/i, [/* '.bin', '.cue' */], 'pcecd', 'TGFX16', 'PCECD', 'pcenginecd', 'tg16cd'),
    new GameConsole(/SuperGrafx/i, ['.sgx'], 'pce', 'TGFX16', 'SGFX', 'supergrafx', 'sgfx'),
    new GameConsole(/PC-88/i, ['.d88'], undefined, 'PC8801', 'PCEIGHTYEIGHT', 'pc88', 'pc88'),
    new GameConsole(/PC-98/i, ['.d98'], undefined, undefined, 'PCNINETYEIGHT', 'pc98', 'pc98'),
    // Nintendo
    new GameConsole(/FDS|Famicom Computer Disk System/i, ['.fds'], 'nes', 'NES', 'FDS', 'fds', 'fds'),
    new GameConsole(/Game (and|&) Watch/i, ['.mgw'], undefined, 'GameNWatch', 'GW', 'gameandwatch', 'gameandwatch'),
    new GameConsole(/GameCube/i, [/* '.iso' */], undefined, undefined, undefined, 'gamecube', 'gamecube'),
    new GameConsole(/GB|Game ?Boy/i, ['.gb', '.sgb'], 'gb', 'Gameboy', 'GB', 'gb', 'gb'), // pocket:sgb for spiritualized1997
    new GameConsole(/GBA|Game ?Boy Advance/i, ['.gba', '.srl'], 'gba', 'GBA', 'GBA', 'gba', 'gba'),
    new GameConsole(/GBC|Game ?Boy Color/i, ['.gbc'], 'gbc', 'Gameboy', 'GBC', 'gbc', 'gbc'),
    new GameConsole(/Nintendo 64|N64/i, ['.n64', '.v64', '.z64'], undefined, undefined, undefined, 'n64', 'n64'),
    new GameConsole(/Nintendo 64DD|N64DD/i, ['.ndd'], undefined, undefined, undefined, 'n64dd', undefined),
    new GameConsole(/(\W|^)3DS(\W|$)|Nintendo 3DS/i, ['.3ds'], undefined, undefined, undefined, '3ds', '3ds'),
    new GameConsole(/(\W|^)NDS(\W|$)|Nintendo DS/i, ['.nds'], undefined, undefined, undefined, 'nds', 'nds'),
    new GameConsole(/(\W|^)NES(\W|$)|Nintendo Entertainment System/i, ['.nes', '.nez'], 'nes', 'NES', 'FC', 'nes', 'nes'),
    new GameConsole(/Pokemon Mini/i, ['.min'], 'poke_mini', 'PokemonMini', 'POKE', 'pokemini', 'pokemini'),
    new GameConsole(/Satellaview/i, ['.bs'], 'snes', 'SNES', 'SATELLAVIEW', 'satellaview', 'satellaview'),
    new GameConsole(/Sufami/i, [], undefined, undefined, 'SUFAMI', 'sufami', 'sufami'),
    new GameConsole(/(\W|^)SNES(\W|$)|Super Nintendo Entertainment System/i, ['.sfc', '.smc'], 'snes', 'SNES', 'SFC', 'snes', 'snes'),
    new GameConsole(/Virtual Boy/i, ['.vb', '.vboy'], undefined, undefined, 'VB', 'virtualboy', 'virtualboy'),
    new GameConsole(/Wii/i, [/* '.iso' */], undefined, undefined, undefined, 'wii', 'wii'),
    new GameConsole(/Wii ?U/i, [/* '.iso' */], undefined, undefined, undefined, 'wiiu', 'wiiu'),
    // Panasonic
    new GameConsole(/3DO/i, [/* '.bin', '.cue' */], undefined, undefined, 'PANASONIC', '3do', '3do'),
    // Philips
    new GameConsole(/CD-?i/i, [/* '.bin', '.cue' */], undefined, undefined, undefined, 'cdi', undefined),
    new GameConsole(/Videopac/i, [/* '.bin' */], undefined, 'Odyssey2', 'VIDEOPAC', 'videopacplus', 'videopac'),
    // RCA
    new GameConsole(/Studio (2|II)/i, [/* '.bin' */], 'studio2', undefined, undefined, undefined, undefined),
    // Sega
    new GameConsole(/32X/i, ['.32x'], undefined, 'S32X', 'THIRTYTWOX', 'sega32x', 'sega32x'),
    new GameConsole(/Dreamcast/i, [/* '.bin', '.cue' */], undefined, undefined, undefined, 'dreamcast', 'dreamcast'),
    new GameConsole(/Game Gear/i, ['.gg'], 'gg', 'SMS', 'GG', 'gamegear', 'gamegear'),
    new GameConsole(/Master System/i, ['.sms'], 'sms', 'SMS', 'MS', 'mastersystem', 'mastersystem'),
    new GameConsole(/(Mega|Sega) CD/i, [/* '.bin', '.cue' */], undefined, 'MegaCD', 'SEGACD', 'segacd', 'segacd'),
    new GameConsole(/Mega Drive|Genesis/i, ['.gen', '.md', '.mdx', '.sgd', '.smd'], 'genesis', 'Genesis', 'MD', 'megadrive', 'genesis'),
    new GameConsole(/Saturn/i, [/* '.bin', '.cue' */], undefined, undefined, undefined, 'saturn', 'saturn'),
    new GameConsole(/SG-?1000/i, ['.sc', '.sg'], 'sg1000', 'SG1000', 'SEGASGONE', 'sg1000', 'sg-1000'),
    // Sharp
    new GameConsole(/X1/i, ['.2d', '.2hd', '.dx1', '.tfd'], undefined, undefined, 'XONE', 'x1', 'x1'),
    new GameConsole(/X68000/i, [], undefined, 'X68000', 'X68000', 'x68000', 'x68000'),
    // Sinclair
    new GameConsole(/ZX[ -]?81/i, [], undefined, 'ZX81', undefined, 'zx81', 'zx81'),
    new GameConsole(/ZX[ -]?Spectrum/i, ['.scl', '.szx', '.z80'], undefined, 'Spectrum', 'ZXS', 'zxspectrum', 'zxspectrum'),
    // SNK
    new GameConsole(/Neo ?Geo/i, [], 'ng', 'NeoGeo', 'NEOGEO', 'neogeo', 'neogeo'),
    new GameConsole(/Neo ?Geo CD/i, [/* '.bin', '.cue' */], undefined, undefined, 'NEOCD', 'neogeocd', 'neocd'),
    new GameConsole(/Neo ?Geo Pocket/i, ['.ngp'], undefined, undefined, 'NGP', 'ngp', 'ngp'),
    new GameConsole(/Neo ?Geo Pocket Color/i, ['.ngc'], undefined, undefined, 'NGP', 'ngpc', 'ngpc'),
    // Sony
    new GameConsole(/PlayStation|psx/i, [/* '.bin', '.cue' */], undefined, 'PSX', 'PS', 'psx', 'psx'),
    new GameConsole(/PlayStation 2|ps2/i, [/* '.bin', '.cue' */], undefined, undefined, undefined, 'ps2', 'ps2'),
    new GameConsole(/PlayStation 3|ps3/i, [/* '.bin', '.cue' */], undefined, undefined, undefined, 'ps3', 'ps3'),
    new GameConsole(/PlayStation [4-9]|ps[4-9]/i, [/* '.bin', '.cue' */], undefined, undefined, undefined, undefined, undefined),
    // Timetop
    new GameConsole(/GameKing/i, [/* '.bin' */], 'game_king', undefined, undefined, undefined, undefined),
    // VTech
    new GameConsole(/CreatiVision/i, [/* '.rom' */], 'creativision', 'CreatiVision', undefined, 'crvision'),
    new GameConsole(/V\.Smile/i, [/* '.bin' */], undefined, undefined, undefined, 'vsmile'),
    // Watara
    new GameConsole(/Supervision/i, ['.sv'], 'supervision', 'SuperVision', 'SUPERVISION', 'supervision', 'supervision'),
    // Wellback
    new GameConsole(/Mega Duck/i, ['.md1', '.md2'], 'mega_duck', undefined, 'MEGADUCK', 'megaduck', 'megaduck'),
  ];

  readonly datRegex: RegExp;

  readonly extensions: string[];

  readonly pocket?: string;

  readonly mister?: string;

  readonly onion?: string;

  readonly batocera?: string;

  readonly jelos?: string;

  constructor(
    datRegex: RegExp,
    extensions: string[],
    pocket?: string,
    mister?: string,
    onion?: string,
    batocera?: string,
    jelos?: string,
  ) {
    this.datRegex = datRegex;
    this.extensions = extensions;
    this.pocket = pocket;
    this.mister = mister;
    this.onion = onion;
    this.batocera = batocera;
    this.jelos = jelos;
  }

  static getForFilename(filePath: string): GameConsole | undefined {
    const fileExtension = path.extname(filePath).toLowerCase();
    return this.CONSOLES
      .find((console) => console.getExtensions().some((ext) => ext === fileExtension));
  }

  static getForDatName(consoleName: string): GameConsole | undefined {
    return this.CONSOLES
      .slice().reverse() // more specific names come second (e.g. "Game Boy" and "Game Boy Color")
      .find((console) => console.getDatRegex().test(consoleName));
  }

  private getDatRegex(): RegExp {
    return this.datRegex;
  }

  private getExtensions(): string[] {
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

  getBatocera(): string | undefined {
    return this.batocera;
  }
  getJelos(): string | undefined {
    return this.jelos;
  }
}
