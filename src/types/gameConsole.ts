import path from 'path';

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
   * Other:
   *  @see https://emulation.gametechwiki.com/index.php/List_of_filetypes
   *  @see https://emulation.fandom.com/wiki/List_of_filetypes
   */
  private static readonly CONSOLES: GameConsole[] = [
    // Amstrad
    new GameConsole(/CPC/i, [], undefined, 'Amstrad', 'CPC', 'amstradcpc'),
    // Arduboy
    new GameConsole(/Arduboy/i, ['.arduboy', '.hex'], 'arduboy', 'Arduboy', undefined, 'arduboy'),
    // Atari
    new GameConsole(/800|8-bit Family/, ['.atr', '.atx'], undefined, 'ATARI800', 'EIGHTHUNDRED', 'atari800'),
    new GameConsole(/2600/, ['.a26', '.act', '.pb', '.tv', '.tvr', '.mn', '.cv', '.eb', '.ef', '.efr', '.ua', '.x07', '.sb'], '2600', 'Atari2600', 'ATARI', 'atari2600'),
    new GameConsole(/5200/, ['.a52'], undefined, 'Atari5200', 'FIFTYTWOHUNDRED', 'atari5200'),
    new GameConsole(/7800/, ['.a78'], '7800', 'Atari7800', 'SEVENTYEIGHTHUNDRED', 'atari7800'),
    new GameConsole(/Jaguar/i, ['.j64'], undefined, undefined, 'JAGUAR', 'jaguar'),
    new GameConsole(/Lynx/i, ['.lnx', '.lyx'], undefined, 'AtariLynx', 'LYNX', 'lynx'),
    new GameConsole(/Atari (- )?ST/i, ['.msa', '.st', '.stx'], undefined, 'AtariST', 'ATARIST', 'atarist'),
    // Bally
    new GameConsole(/Astrocade/i, [/* '.bin' */], undefined, 'Astrocade', undefined, 'astrocde'),
    // Bandai
    new GameConsole(/WonderSwan/i, ['.ws'], 'wonderswan', 'WonderSwan', 'WS', 'wswan'),
    new GameConsole(/WonderSwan Color/i, ['.wsc'], 'wonderswan', 'WonderSwan', 'WS', 'wswanc'),
    // Bit Corporation
    new GameConsole(/Gamate/i, [/* '.bin' */], 'gamate', 'Gamate', undefined, 'gamate'),
    // Capcom
    // TODO(cemmer): CPS1, CPS2, CPS3
    // Casio
    new GameConsole(/PV-?1000/i, [/* '.bin' */], undefined, 'Casio_PV-1000', undefined, 'pv1000'),
    // Commodore
    new GameConsole(/Amiga/i, [], 'amiga', 'Amiga', 'AMIGA', undefined),
    new GameConsole(/Amiga CD32/i, [/* '.bin', '.cue' */], undefined, undefined, undefined, 'amigacd32'),
    new GameConsole(/Amiga CDTV/i, [/* '.bin', '.cue' */], undefined, undefined, undefined, 'amigacdtv'),
    new GameConsole(/Commodore 64/i, ['.crt', '.d64', '.t64'], undefined, 'C64', 'COMMODORE', 'c64'),
    // Coleco
    new GameConsole(/ColecoVision/i, ['.col'], 'coleco', 'Coleco', 'COLECO', 'colecovision'),
    // Emerson
    new GameConsole(/Arcadia/i, [/* '.bin' */], 'arcadia', 'Arcadia', undefined, 'arcadia'),
    // Entex
    new GameConsole(/Adventure Vision/i, [/* '.bin' */], 'avision', 'AVision', undefined, 'advision'),
    // Epoch
    new GameConsole(/Super Cassette Vision/i, [/* '.bin' */], undefined, undefined, undefined, 'scv'),
    // Fairchild
    new GameConsole(/Channel F/i, [/* '.bin' */], 'channel_f', 'ChannelF', 'FAIRCHILD', 'channelf'),
    // Funtech
    new GameConsole(/Super A'?Can/i, [/* '.bin' */], undefined, undefined, undefined, 'supracan'),
    // GCE
    new GameConsole(/Vectrex/i, ['.vec'], undefined, 'Vectrex', 'VECTREX', 'vectrex'),
    // Interton
    new GameConsole(/VC ?4000/i, [/* '.bin' */], undefined, 'VC4000', undefined, 'vc4000'),
    // Magnavox
    new GameConsole(/Odyssey 2/i, [/* '.bin' */], 'odyssey2', 'Odyssey2', 'ODYSSEY', 'o2em'),
    // Mattel
    new GameConsole(/Intellivision/i, ['.int'], 'intv', 'Intellivision', 'INTELLIVISION', 'intellivision'),
    // Microsoft
    new GameConsole(/MSX/i, [], undefined, 'MSX', 'MSX', 'msx1'),
    new GameConsole(/MSX2/i, [], undefined, 'MSX', 'MSX', 'msx2'),
    new GameConsole(/MSX2+/i, [], undefined, 'MSX', 'MSX', 'msx2+'),
    new GameConsole(/MSX TurboR/i, [], undefined, 'MSX', 'MSX', 'msxturbor'),
    new GameConsole(/Xbox/i, [/* '.iso' */], undefined, undefined, undefined, 'xbox'),
    new GameConsole(/Xbox 360/i, [/* '.iso' */], undefined, undefined, undefined, 'xbox360'),
    // Nichibutsu
    new GameConsole(/My Vision/i, [], undefined, 'MyVision', undefined, undefined),
    // NEC
    new GameConsole(/PC Engine|TurboGrafx/i, ['.pce'], 'pce', 'TGFX16', 'PCE', 'pcengine'),
    new GameConsole(/(PC Engine|TurboGrafx) CD/i, [/* '.bin', '.cue' */], 'pcecd', 'TGFX16', 'PCECD', 'pcenginecd'),
    new GameConsole(/SuperGrafx/i, ['.sgx'], 'pce', 'TGFX16', 'SGFX', 'supergrafx'),
    new GameConsole(/PC-88/i, ['.d88'], undefined, 'PC8801', 'PCEIGHTYEIGHT', 'pc88'),
    new GameConsole(/PC-98/i, ['.d98'], undefined, undefined, 'PCNINETYEIGHT', 'pc98'),
    // Nintendo
    new GameConsole(/FDS|Famicom Computer Disk System/i, ['.fds'], 'nes', 'NES', 'FDS', 'fds'),
    new GameConsole(/Game (and|&) Watch/i, ['.mgw'], undefined, 'GameNWatch', 'GW', 'gameandwatch'),
    new GameConsole(/GameCube/i, [/* '.iso' */], undefined, undefined, undefined, 'gamecube'),
    new GameConsole(/GB|Game ?Boy/i, ['.gb', '.sgb'], 'gb', 'Gameboy', 'GB', 'gb'), // pocket:sgb for spiritualized1997
    new GameConsole(/GBA|Game ?Boy Advance/i, ['.gba', '.srl'], 'gba', 'GBA', 'GBA', 'gba'),
    new GameConsole(/GBC|Game ?Boy Color/i, ['.gbc'], 'gbc', 'Gameboy', 'GBC', 'gbc'),
    new GameConsole(/Nintendo 64|N64/i, ['.n64', '.v64', '.z64'], undefined, undefined, undefined, 'n64'),
    new GameConsole(/Nintendo 64DD|N64DD/i, ['.ndd'], undefined, undefined, undefined, 'n64dd'),
    new GameConsole(/(\W|^)NES(\W|$)|Nintendo Entertainment System/i, ['.nes', '.nez'], 'nes', 'NES', 'FC', 'nes'),
    new GameConsole(/Pokemon Mini/i, ['.min'], 'poke_mini', 'PokemonMini', 'POKE', 'pokemini'),
    new GameConsole(/Satellaview/i, ['.bs'], 'snes', 'SNES', 'SATELLAVIEW', 'satellaview'),
    new GameConsole(/Sufami/i, [], undefined, undefined, 'SUFAMI', 'sufami'),
    new GameConsole(/(\W|^)SNES(\W|$)|Super Nintendo Entertainment System/i, ['.sfc', '.smc'], 'snes', 'SNES', 'SFC', 'snes'),
    new GameConsole(/Virtual Boy/i, ['.vb', '.vboy'], undefined, undefined, 'VB', 'virtualboy'),
    new GameConsole(/Wii/i, [/* '.iso' */], undefined, undefined, undefined, 'wii'),
    new GameConsole(/Wii ?U/i, [/* '.iso' */], undefined, undefined, undefined, 'wiiu'),
    // Panasonic
    new GameConsole(/3DO/i, [/* '.bin', '.cue' */], undefined, undefined, 'PANASONIC', '3do'),
    // Philips
    new GameConsole(/CD-?i/i, [/* '.bin', '.cue' */], undefined, undefined, undefined, 'cdi'),
    new GameConsole(/Videopac/i, [/* '.bin' */], undefined, 'Odyssey2', 'VIDEOPAC', 'videopacplus'),
    // RCA
    new GameConsole(/Studio (2|II)/i, [/* '.bin' */], 'studio2', undefined, undefined, undefined),
    // Sega
    new GameConsole(/32X/i, ['.32x'], undefined, 'S32X', 'THIRTYTWOX', 'sega32x'),
    new GameConsole(/Dreamcast/i, [/* '.bin', '.cue' */], undefined, undefined, undefined, 'dreamcast'),
    new GameConsole(/Game Gear/i, ['.gg'], 'gg', 'SMS', 'GG', 'gamegear'),
    new GameConsole(/Master System/i, ['.sms'], 'sms', 'SMS', 'MS', 'mastersystem'),
    new GameConsole(/(Mega|Sega) CD/i, [/* '.bin', '.cue' */], undefined, 'MegaCD', 'SEGACD', 'segacd'),
    new GameConsole(/Mega Drive|Genesis/i, ['.gen', '.md', '.mdx', '.sgd', '.smd'], 'genesis', 'Genesis', 'MD', 'megadrive'),
    new GameConsole(/Saturn/i, [/* '.bin', '.cue' */], undefined, undefined, undefined, 'saturn'),
    new GameConsole(/SG-?1000/i, ['.sc', '.sg'], 'sg1000', 'SG1000', 'SEGASGONE', 'sg1000'),
    // Sharp
    new GameConsole(/X1/i, ['.2d', '.2hd', '.dx1', '.tfd'], undefined, undefined, 'XONE', 'x1'),
    new GameConsole(/X68000/i, [], undefined, 'X68000', 'X68000', 'x68000'),
    // Sinclair
    new GameConsole(/ZX[ -]?81/i, [], undefined, 'ZX81', undefined, 'zx81'),
    new GameConsole(/ZX[ -]?Spectrum/i, ['.scl', '.szx', '.z80'], undefined, 'Spectrum', 'ZXS', 'zxspectrum'),
    // SNK
    new GameConsole(/Neo ?Geo/i, [], 'ng', 'NeoGeo', 'NEOGEO', 'neogeo'),
    new GameConsole(/Neo ?Geo CD/i, [/* '.bin', '.cue' */], undefined, undefined, 'NEOCD', 'neogeocd'),
    new GameConsole(/Neo ?Geo Pocket/i, ['.ngp'], undefined, undefined, 'NGP', 'ngp'),
    new GameConsole(/Neo ?Geo Pocket Color/i, ['.ngc'], undefined, undefined, 'NGP', 'ngpc'),
    // Sony
    new GameConsole(/PlayStation|psx/i, [/* '.bin', '.cue' */], undefined, 'PSX', 'PS', 'psx'),
    new GameConsole(/PlayStation 2|ps2/i, [/* '.bin', '.cue' */], undefined, undefined, undefined, 'ps2'),
    new GameConsole(/PlayStation 3|ps3/i, [/* '.bin', '.cue' */], undefined, undefined, undefined, 'ps3'),
    new GameConsole(/PlayStation [4-9]|ps[4-9]/i, [/* '.bin', '.cue' */], undefined, undefined, undefined, undefined),
    // Timetop
    new GameConsole(/GameKing/i, [/* '.bin' */], 'game_king', undefined, undefined, undefined),
    // VTech
    new GameConsole(/CreatiVision/i, [/* '.rom' */], 'creativision', 'CreatiVision', undefined, 'crvision'),
    new GameConsole(/V\.Smile/i, [/* '.bin' */], undefined, undefined, undefined, 'vsmile'),
    // Watara
    new GameConsole(/Supervision/i, ['.sv'], 'supervision', 'SuperVision', 'SUPERVISION', 'supervision'),
    // Wellback
    new GameConsole(/Mega Duck/i, ['.md1', '.md2'], 'mega_duck', undefined, 'MEGADUCK', 'megaduck'),
  ];

  readonly datRegex: RegExp;

  readonly extensions: string[];

  readonly pocket?: string;

  readonly mister?: string;

  readonly onion?: string;

  readonly batocera?: string;

  constructor(
    datRegex: RegExp,
    extensions: string[],
    pocket?: string,
    mister?: string,
    onion?: string,
    batocera?: string,
  ) {
    this.datRegex = datRegex;
    this.extensions = extensions;
    this.pocket = pocket;
    this.mister = mister;
    this.onion = onion;
    this.batocera = batocera;
  }

  static getForFilename(filePath: string): GameConsole | undefined {
    const fileExtension = path.extname(filePath).toLowerCase();
    return this.CONSOLES
      .filter((console) => console.getExtensions().some((ext) => ext === fileExtension))[0];
  }

  static getForDatName(consoleName: string): GameConsole | undefined {
    return this.CONSOLES
      .slice().reverse() // more specific names come second (e.g. "Game Boy" and "Game Boy Color")
      .filter((console) => console.getDatRegex().test(consoleName))[0];
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
}
