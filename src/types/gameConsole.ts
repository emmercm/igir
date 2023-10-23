import path from 'node:path';

interface OutputTokens {
  // Analogue Pocket ROMs go in the /Assets/{pocket}/common/ directory
  pocket?: string,

  // MiSTer ROMs go in the /games/{mister}/ directory:
  // @see https://mister-devel.github.io/MkDocs_MiSTer/developer/corenames/
  // @see https://mister-devel.github.io/MkDocs_MiSTer/cores/console/
  // @see https://mister-devel.github.io/MkDocs_MiSTer/cores/computer/
  mister?: string,

  // OnionOS/GarlicOS ROMs go in the /Roms/{onion} directory:
  // @see https://onionui.github.io/docs/emulators
  onion?: string,

  // Batocera ROMs go in the roms/{batocera} directory:
  // @see https://wiki.batocera.org/systems
  batocera?: string,

  // JELOS ROMs go in the ??? directory:
  // @see https://github.com/JustEnoughLinuxOS/distribution/blob/main/documentation/PER_DEVICE_DOCUMENTATION/AMD64/SUPPORTED_EMULATORS_AND_CORES.md
  jelos?: string,

  // FunKey S ROMs go into the subfolder of / for the console:
  // @see https://github.com/FunKey-Project/FunKey-OS/tree/master/FunKey/board/funkey/rootfs-overlay/usr/games/collections
  funkeyos?: string,
}

/**
 * A class of information about specific game consoles and their names, standard file extensions,
 * and how to replace output tokens such as `{pocket}`.
 */
export default class GameConsole {
  /**
   * Other:
   *  @see https://emulation.gametechwiki.com/index.php/List_of_filetypes
   *  @see https://emulation.fandom.com/wiki/List_of_filetypes
   *  @see https://github.com/OpenEmu/OpenEmu/wiki/User-guide:-Importing
   */
  private static readonly CONSOLES: GameConsole[] = [
    // Acorn
    new GameConsole(/Atom/i, [], {
      mister: 'AcornAtom',
      batocera: 'atom',
    }),
    // Amstrad
    new GameConsole(/CPC/i, [], {
      mister: 'Amstrad',
      onion: 'CPC',
      batocera: 'amstradcpc',
      jelos: 'amstradcpc',
    }),
    new GameConsole(/PCW/i, [], {
      mister: 'AmstradPCW',
    }),
    // Apple
    new GameConsole(/Apple.*I/i, [], {
      mister: 'Apple-I',
    }),
    new GameConsole(/Apple.*IIe?/i, [], {
      mister: 'Apple-II',
      batocera: 'apple2',
    }),
    // Arduboy
    new GameConsole(/Arduboy/i, ['.arduboy', '.hex'], {
      pocket: 'arduboy',
      mister: 'Arduboy',
      batocera: 'arduboy',
      jelos: 'arduboy',
    }),
    // Atari
    new GameConsole(/800|8-bit Family/, ['.atr', '.atx'], {
      mister: 'ATARI800',
      onion: 'EIGHTHUNDRED',
      batocera: 'atari800',
      jelos: 'atari800',
    }),
    new GameConsole(/2600/, ['.a26', '.act', '.pb', '.tv', '.tvr', '.mn', '.cv', '.eb', '.ef', '.efr', '.ua', '.x07', '.sb'], {
      pocket: '2600',
      mister: 'Atari2600',
      onion: 'ATARI',
      batocera: 'atari2600',
      jelos: 'atari2600',
    }),
    new GameConsole(/5200/, ['.a52'], {
      mister: 'Atari5200',
      onion: 'FIFTYTWOHUNDRED',
      batocera: 'atari5200',
      jelos: 'atari5200',
    }),
    new GameConsole(/7800/, ['.a78'], {
      pocket: '7800',
      mister: 'Atari7800',
      onion: 'SEVENTYEIGHTHUNDRED',
      batocera: 'atari7800',
      jelos: 'atari7800',
    }),
    new GameConsole(/Jaguar/i, ['.j64'], {
      onion: 'JAGUAR',
      batocera: 'jaguar',
      jelos: 'atarijaguar',
    }),
    new GameConsole(/Lynx/i, ['.lnx', '.lyx'], {
      mister: 'AtariLynx',
      onion: 'LYNX',
      batocera: 'lynx',
      jelos: 'atarilynx',
      funkeyos: 'Atari lynx',
    }),
    new GameConsole(/Atari.*ST/i, ['.msa', '.st', '.stx'], {
      mister: 'AtariST',
      onion: 'ATARIST',
      batocera: 'atarist',
      jelos: 'atarist',
    }),
    // Bally
    new GameConsole(/Astrocade/i, [/* '.bin' */], {
      mister: 'Astrocade',
      batocera: 'astrocde',
    }),
    // Bandai
    new GameConsole(/Super ?Vision 8000/i, [], {
      mister: 'Supervision8000',
    }),
    new GameConsole(/RX[ -]?78/i, [], {
      mister: 'RX78',
    }),
    new GameConsole(/WonderSwan/i, ['.ws'], {
      pocket: 'wonderswan',
      mister: 'WonderSwan',
      onion: 'WS',
      batocera: 'wswan',
      jelos: 'wonderswan',
      funkeyos: 'WonderSwan',
    }),
    new GameConsole(/WonderSwan Color/i, ['.wsc'], {
      pocket: 'wonderswan',
      mister: 'WonderSwan',
      onion: 'WS',
      batocera: 'wswanc',
      jelos: 'wonderswancolor',
      funkeyos: 'WonderSwan',
    }),
    // Bit Corporation
    new GameConsole(/Gamate/i, [/* '.bin' */], {
      pocket: 'gamate',
      mister: 'Gamate',
      batocera: 'gamate',
    }),
    // Capcom
    // TODO(cemmer): CPS1, CPS2, CPS3
    // Casio
    new GameConsole(/PV[ -]?1000/i, [/* '.bin' */], {
      mister: 'Casio_PV-1000',
      batocera: 'pv1000',
    }),
    new GameConsole(/PV[ -]?2000/i, [/* '.bin' */], {
      mister: 'Casio_PV-2000',
    }),
    // Commodore
    new GameConsole(/Amiga/i, [], {
      pocket: 'amiga',
      mister: 'Amiga',
      onion: 'AMIGA',
      jelos: 'amiga',
    }),
    new GameConsole(/Amiga CD32/i, [/* '.bin', '.cue' */], {
      mister: 'Amiga',
      batocera: 'amigacd32',
      jelos: 'amigacd32',
    }),
    new GameConsole(/Amiga CDTV/i, [/* '.bin', '.cue' */], {
      batocera: 'amigacdtv',
    }),
    new GameConsole(/Commodore C?16/i, [/* unknown */], {
      mister: 'C16',
      jelos: 'c16',
    }),
    new GameConsole(/Commodore C?64/i, ['.crt', '.d64', '.t64'], {
      mister: 'C64',
      onion: 'COMMODORE',
      batocera: 'c64',
      jelos: 'c64',
    }),
    new GameConsole(/Commodore C?128/i, [/* unknown */], {
      mister: 'C128',
      batocera: 'c128',
      jelos: 'c128',
    }),
    // Coleco
    new GameConsole(/ColecoVision/i, ['.col'], {
      pocket: 'coleco',
      mister: 'Coleco',
      onion: 'COLECO',
      batocera: 'colecovision',
      jelos: 'coleco',
    }),
    // Emerson
    new GameConsole(/Arcadia/i, [/* '.bin' */], {
      pocket: 'arcadia',
      mister: 'Arcadia',
      batocera: 'arcadia',
    }),
    // Entex
    new GameConsole(/Adventure Vision/i, [/* '.bin' */], {
      pocket: 'avision',
      mister: 'AVision',
      batocera: 'advision',
    }),
    // Epoch
    new GameConsole(/Super Cassette Vision/i, [/* '.bin' */], {
      batocera: 'scv',
    }),
    // Fairchild
    new GameConsole(/Channel F/i, [/* '.bin' */], {
      pocket: 'channel_f',
      mister: 'ChannelF',
      onion: 'FAIRCHILD',
      batocera: 'channelf',
      jelos: 'channelf',
    }),
    // Funtech
    new GameConsole(/Super A'?Can/i, [/* '.bin' */], {
      batocera: 'supracan',
    }),
    // GCE
    new GameConsole(/Vectrex/i, ['.vec'], {
      mister: 'Vectrex',
      onion: 'VECTREX',
      batocera: 'vectrex',
      jelos: 'vectrex',
    }),
    // Interton
    new GameConsole(/VC ?4000/i, [/* '.bin' */], {
      mister: 'VC4000',
      batocera: 'vc4000',
    }),
    // Magnavox
    new GameConsole(/Odyssey 2/i, [/* '.bin' */], {
      pocket: 'odyssey2',
      mister: 'Odyssey2',
      onion: 'ODYSSEY',
      batocera: 'o2em',
      jelos: 'odyssey',
    }),
    // Mattel
    new GameConsole(/Intellivision/i, ['.int'], {
      pocket: 'intv',
      mister: 'Intellivision',
      onion: 'INTELLIVISION',
      batocera: 'intellivision',
      jelos: 'intellivision',
    }),
    // Microsoft
    new GameConsole(/MSX/i, [], {
      mister: 'MSX',
      onion: 'MSX',
      batocera: 'msx1',
      jelos: 'msx',
    }),
    new GameConsole(/MSX2/i, [], {
      mister: 'MSX',
      onion: 'MSX',
      batocera: 'msx2',
      jelos: 'msx2',
    }),
    new GameConsole(/MSX2+/i, [], {
      mister: 'MSX',
      onion: 'MSX',
      batocera: 'msx2+',
    }),
    new GameConsole(/MSX TurboR/i, [], {
      mister: 'MSX',
      onion: 'MSX',
      batocera: 'msxturbor',
    }),
    new GameConsole(/Xbox/i, [/* '.iso' */], {
      batocera: 'xbox',
      jelos: 'xbox',
    }),
    new GameConsole(/Xbox 360/i, [/* '.iso' */], {
      batocera: 'xbox360',
    }),
    // Nichibutsu
    new GameConsole(/My Vision/i, [], {
      mister: 'MyVision',
    }),
    // NEC
    new GameConsole(/PC Engine|TurboGrafx/i, ['.pce'], {
      pocket: 'pce',
      mister: 'TGFX16',
      onion: 'PCE',
      batocera: 'pcengine',
      jelos: 'tg16',
      funkeyos: 'PCE-TurboGrafx',
    }),
    new GameConsole(/(PC Engine|TurboGrafx) CD/i, [/* '.bin', '.cue' */], {
      pocket: 'pcecd',
      mister: 'TGFX16',
      onion: 'PCECD',
      batocera: 'pcenginecd',
      jelos: 'tg16cd',
    }),
    new GameConsole(/SuperGrafx/i, ['.sgx'], {
      pocket: 'pce',
      mister: 'TGFX16',
      onion: 'SGFX',
      batocera: 'supergrafx',
      jelos: 'sgfx',
    }),
    new GameConsole(/PC-88/i, ['.d88'], {
      mister: 'PC8801',
      onion: 'PCEIGHTYEIGHT',
      batocera: 'pc88',
      jelos: 'pc88',
    }),
    new GameConsole(/PC-98/i, ['.d98'], {
      onion: 'PCNINETYEIGHT',
      batocera: 'pc98',
      jelos: 'pc98',
    }),
    // Nintendo
    new GameConsole(/FDS|Famicom Computer Disk System/i, ['.fds'], {
      pocket: 'nes',
      mister: 'NES',
      onion: 'FDS',
      batocera: 'fds',
      jelos: 'fds',
      funkeyos: 'NES',
    }),
    new GameConsole(/Game (and|&) Watch/i, ['.mgw'], {
      mister: 'GameNWatch',
      onion: 'GW',
      batocera: 'gameandwatch',
      jelos: 'gameandwatch',
    }),
    new GameConsole(/GameCube/i, [/* '.iso' */], {
      batocera: 'gamecube',
      jelos: 'gamecube',
    }),
    new GameConsole(/GB|Game ?Boy/i, ['.gb', '.sgb'], {
      pocket: 'gb',
      mister: 'Gameboy',
      onion: 'GB',
      batocera: 'gb',
      jelos: 'gb',
      funkeyos: 'Game Boy',
    }), // pocket:sgb for spiritualized1997
    new GameConsole(/GBA|Game ?Boy Advance/i, ['.gba', '.srl'], {
      pocket: 'gba',
      mister: 'GBA',
      onion: 'GBA',
      batocera: 'gba',
      jelos: 'gba',
      funkeyos: 'Game Boy Advance',
    }),
    new GameConsole(/GBC|Game ?Boy Color/i, ['.gbc'], {
      pocket: 'gbc',
      mister: 'Gameboy',
      onion: 'GBC',
      batocera: 'gbc',
      jelos: 'gbc',
      funkeyos: 'Game Boy Color',
    }),
    new GameConsole(/Nintendo 64|N64/i, ['.n64', '.v64', '.z64'], {
      mister: 'N64',
      batocera: 'n64',
      jelos: 'n64',
    }),
    new GameConsole(/Nintendo 64DD|N64DD/i, ['.ndd'], {
      batocera: 'n64dd',
    }),
    new GameConsole(/(\W|^)3DS(\W|$)|Nintendo 3DS/i, ['.3ds'], {
      batocera: '3ds',
      jelos: '3ds',
    }),
    new GameConsole(/(\W|^)NDS(\W|$)|Nintendo DS/i, ['.nds'], {
      batocera: 'nds',
      jelos: 'nds',
    }),
    new GameConsole(/(\W|^)NES(\W|$)|Nintendo Entertainment System/i, ['.nes', '.nez'], {
      pocket: 'nes',
      mister: 'NES',
      onion: 'FC',
      batocera: 'nes',
      jelos: 'nes',
      funkeyos: 'NES',
    }),
    new GameConsole(/Pokemon Mini/i, ['.min'], {
      pocket: 'poke_mini',
      mister: 'PokemonMini',
      onion: 'POKE',
      batocera: 'pokemini',
      jelos: 'pokemini',
      funkeyos: 'Pokemini',
    }),
    new GameConsole(/Satellaview/i, ['.bs'], {
      pocket: 'snes',
      mister: 'SNES',
      onion: 'SATELLAVIEW',
      batocera: 'satellaview',
      jelos: 'satellaview',
    }),
    new GameConsole(/Sufami/i, [], {
      onion: 'SUFAMI',
      batocera: 'sufami',
      jelos: 'sufami',
    }),
    new GameConsole(/(\W|^)SNES(\W|$)|Super Nintendo Entertainment System/i, ['.sfc', '.smc'], {
      pocket: 'snes',
      mister: 'SNES',
      onion: 'SFC',
      batocera: 'snes',
      jelos: 'snes',
      funkeyos: 'SNES',
    }),
    new GameConsole(/Virtual Boy/i, ['.vb', '.vboy'], {
      onion: 'VB',
      batocera: 'virtualboy',
      jelos: 'virtualboy',
    }),
    new GameConsole(/Wii/i, [/* '.iso' */], {
      batocera: 'wii',
      jelos: 'wii',
    }),
    new GameConsole(/Wii ?U/i, [/* '.iso' */], {
      batocera: 'wiiu',
      jelos: 'wiiu',
    }),
    // Panasonic
    new GameConsole(/3DO/i, [/* '.bin', '.cue' */], {
      onion: 'PANASONIC',
      batocera: '3do',
      jelos: '3do',
    }),
    // Philips
    new GameConsole(/CD[ -]?i/i, [/* '.bin', '.cue' */], {
      batocera: 'cdi',
    }),
    new GameConsole(/Videopac/i, [/* '.bin' */], {
      mister: 'Odyssey2',
      onion: 'VIDEOPAC',
      batocera: 'videopacplus',
      jelos: 'videopac',
    }),
    // RCA
    new GameConsole(/Studio (2|II)/i, [/* '.bin' */], {
      pocket: 'studio2',
    }),
    // Sega
    new GameConsole(/32X/i, ['.32x'], {
      mister: 'S32X',
      onion: 'THIRTYTWOX',
      batocera: 'sega32x',
      jelos: 'sega32x',
    }),
    new GameConsole(/Dreamcast/i, [/* '.bin', '.cue' */], {
      batocera: 'dreamcast',
      jelos: 'dreamcast',
    }),
    new GameConsole(/Game Gear/i, ['.gg'], {
      pocket: 'gg',
      mister: 'SMS',
      onion: 'GG',
      batocera: 'gamegear',
      jelos: 'gamegear',
      funkeyos: 'Game Gear',
    }),
    new GameConsole(/Master System/i, ['.sms'], {
      pocket: 'sms',
      mister: 'SMS',
      onion: 'MS',
      batocera: 'mastersystem',
      jelos: 'mastersystem',
      funkeyos: 'Sega Master System',
    }),
    new GameConsole(/(Mega|Sega) CD/i, [/* '.bin', '.cue' */], {
      mister: 'MegaCD',
      onion: 'SEGACD',
      batocera: 'segacd',
      jelos: 'segacd',
    }),
    new GameConsole(/Mega Drive|Genesis/i, ['.gen', '.md', '.mdx', '.sgd', '.smd'], {
      pocket: 'genesis',
      mister: 'Genesis',
      onion: 'MD',
      batocera: 'megadrive',
      jelos: 'genesis',
      funkeyos: 'Sega Genesis',
    }),
    new GameConsole(/Saturn/i, [/* '.bin', '.cue' */], {
      batocera: 'saturn',
      jelos: 'saturn',
    }),
    new GameConsole(/SG[ -]?1000/i, ['.sc', '.sg'], {
      pocket: 'sg1000',
      mister: 'SG1000',
      onion: 'SEGASGONE',
      batocera: 'sg1000',
      jelos: 'sg-1000',
    }),
    // Sharp
    new GameConsole(/MZ/i, [], {
      mister: 'SharpMZ',
    }),
    new GameConsole(/X1/i, ['.2d', '.2hd', '.dx1', '.tfd'], {
      onion: 'XONE',
      batocera: 'x1',
      jelos: 'x1',
    }),
    new GameConsole(/X68000/i, [], {
      mister: 'X68000',
      onion: 'X68000',
      batocera: 'x68000',
      jelos: 'x68000',
    }),
    // Sinclair
    new GameConsole(/ZX[ -]?80/i, [], {
      mister: 'ZX81',
    }),
    new GameConsole(/ZX[ -]?81/i, [], {
      mister: 'ZX81',
      batocera: 'zx81',
      jelos: 'zx81',
    }),
    new GameConsole(/ZX[ -]?Spectrum/i, ['.scl', '.szx', '.z80'], {
      mister: 'Spectrum',
      onion: 'ZXS',
      batocera: 'zxspectrum',
      jelos: 'zxspectrum',
    }),
    // SNK
    new GameConsole(/Neo ?Geo/i, [], {
      pocket: 'ng',
      mister: 'NeoGeo',
      onion: 'NEOGEO',
      batocera: 'neogeo',
      jelos: 'neogeo',
      funkeyos: 'Neo Geo Pocket',
    }),
    new GameConsole(/Neo ?Geo CD/i, [/* '.bin', '.cue' */], {
      onion: 'NEOCD',
      batocera: 'neogeocd',
      jelos: 'neocd',
    }),
    new GameConsole(/Neo ?Geo Pocket/i, ['.ngp'], {
      onion: 'NGP',
      batocera: 'ngp',
      jelos: 'ngp',
    }),
    new GameConsole(/Neo ?Geo Pocket Color/i, ['.ngc'], {
      onion: 'NGP',
      batocera: 'ngpc',
      jelos: 'ngpc',
    }),
    // Sony
    new GameConsole(/PlayStation|psx/i, [/* '.bin', '.cue' */], {
      mister: 'PSX',
      onion: 'PS',
      batocera: 'psx',
      jelos: 'psx',
      funkeyos: 'PS1',
    }),
    new GameConsole(/PlayStation 2|ps2/i, [/* '.bin', '.cue' */], {
      batocera: 'ps2',
      jelos: 'ps2',
    }),
    new GameConsole(/PlayStation 3|ps3/i, [/* '.bin', '.cue' */], {
      batocera: 'ps3',
      jelos: 'ps3',
    }),
    new GameConsole(/PlayStation [4-9]|ps[4-9]/i, [/* '.bin', '.cue' */], {}),
    // Timetop
    new GameConsole(/GameKing/i, [/* '.bin' */], {
      pocket: 'game_king',
    }),
    // VTech
    new GameConsole(/CreatiVision/i, [/* '.rom' */], {
      pocket: 'creativision',
      mister: 'CreatiVision',
      batocera: 'crvision',
    }),
    new GameConsole(/V\.Smile/i, [/* '.bin' */], {
      batocera: 'vsmile',
    }),
    // Watara
    new GameConsole(/Supervision/i, ['.sv'], {
      pocket: 'supervision',
      mister: 'SuperVision',
      onion: 'SUPERVISION',
      batocera: 'supervision',
      jelos: 'supervision',
    }),
    // Wellback
    new GameConsole(/Mega Duck/i, ['.md1', '.md2'], {
      pocket: 'mega_duck',
      onion: 'MEGADUCK',
      batocera: 'megaduck',
      jelos: 'megaduck',
    }),
  ];

  readonly datRegex: RegExp;

  readonly extensions: string[];

  readonly outputTokens: OutputTokens;

  constructor(
    datRegex: RegExp,
    extensions: string[],
    outputTokens: OutputTokens,
  ) {
    this.datRegex = datRegex;
    this.extensions = extensions;
    this.outputTokens = outputTokens;
  }

  static getForFilename(filePath: string): GameConsole | undefined {
    const fileExtension = path.extname(filePath).toLowerCase();
    return this.CONSOLES
      .find((console) => console.getExtensions().includes(fileExtension));
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
    return this.outputTokens.pocket;
  }

  getMister(): string | undefined {
    return this.outputTokens.mister;
  }

  getOnion(): string | undefined {
    return this.outputTokens.onion;
  }

  getBatocera(): string | undefined {
    return this.outputTokens.batocera;
  }

  getJelos(): string | undefined {
    return this.outputTokens.jelos;
  }

  getFunkeyOS(): string | undefined {
    return this.outputTokens.funkeyos;
  }
}
