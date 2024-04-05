import path from 'node:path';

interface OutputTokens {
  // Adam image has it's roms in the /ROMS/{adam} subdirectory
  // @see https://github.com/eduardofilo/RG350_adam_image/wiki/En:-3.-Content-installation#roms
  adam?: string,

  // Batocera ROMs go in the roms/{batocera} directory:
  // @see https://wiki.batocera.org/systems
  batocera?: string,

  // ES-DE ROMs go in the roms/{es-de} directory:
  // @see https://gitlab.com/es-de/emulationstation-de/-/blob/master/resources/systems/linux/es_systems.xml
  esde?: string,

  // FunKey S ROMs go into the subfolder of / for the console:
  // @see https://github.com/FunKey-Project/FunKey-OS/tree/master/FunKey/board/funkey/rootfs-overlay/usr/games/collections
  funkeyos?: string,

  // JELOS ROMs go in the ??? directory:
  // @see https://github.com/JustEnoughLinuxOS/distribution/blob/main/documentation/PER_DEVICE_DOCUMENTATION/AMD64/SUPPORTED_EMULATORS_AND_CORES.md
  jelos?: string,

  // MinUI roms go into the /Roms folder on the SD card
  // @see https://github.com/shauninman/MinUI/tree/main/skeleton/BASE/Roms
  // @see https://github.com/shauninman/MinUI/tree/main/skeleton/EXTRAS/Roms
  // There are some special considerations about naming these folders
  // to influence UI presentation
  // @see https://github.com/shauninman/MinUI/blob/main/skeleton/BASE/README.txt
  minui?: string,

  // MiSTer ROMs go in the /games/{mister}/ directory:
  // @see https://mister-devel.github.io/MkDocs_MiSTer/developer/corenames/
  // @see https://mister-devel.github.io/MkDocs_MiSTer/cores/console/
  // @see https://mister-devel.github.io/MkDocs_MiSTer/cores/computer/
  mister?: string,

  // MiyooCFW Roms go into the /roms subfolder of the SD card
  // @see https://github.com/TriForceX/MiyooCFW/wiki/Emulator-Info
  miyoocfw?: string,

  // OnionOS/GarlicOS ROMs go in the /Roms/{onion} directory:
  // @see https://onionui.github.io/docs/emulators
  onion?: string,

  // Analogue Pocket ROMs go in the /Assets/{pocket}/common/ directory
  pocket?: string,

  // RetroDECK ROMs go in the /roms/{retrodeck} directory:
  // @see https://github.com/XargonWan/RetroDECK/blob/main/es-configs/es_systems.xml
  retrodeck?: string,

  // TWiLightMenu++ Roms go into the /roms subfolder on the 3DS/DSi SD card
  // @see https://github.com/DS-Homebrew/TWiLightMenu/tree/master/7zfile/roms
  twmenu?: string,
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
   *  @see https://github.com/XargonWan/RetroDECK/blob/main/es-configs/es_systems.xml
   */
  private static readonly CONSOLES: GameConsole[] = [
    // Acorn
    new GameConsole(/Atom/i, [], {
      batocera: 'atom',
      mister: 'AcornAtom',
    }),
    // Amstrad
    new GameConsole(/CPC/i, [], {
      adam: 'AMSTRAD',
      batocera: 'amstradcpc',
      esde: 'amstradcpc',
      jelos: 'amstradcpc',
      mister: 'Amstrad',
      onion: 'CPC',
      retrodeck: 'amstradcpc',
      twmenu: 'cpc',
    }),
    new GameConsole(/PCW/i, [/* unknown */], {
      mister: 'AmstradPCW',
    }),
    // Apple
    new GameConsole(/Apple.*I/i, [/* unknown */], {
      mister: 'Apple-I',
    }),
    new GameConsole(/Apple.*IIe?/i, ['.do', '.nib', '.po'], {
      batocera: 'apple2',
      esde: 'apple2',
      mister: 'Apple-II',
      retrodeck: 'apple2',
    }),
    new GameConsole(/Apple.*IIGS/i, ['.2mg'], {
      esde: 'apple2gs',
      retrodeck: 'apple2gs',
    }),
    // Arduboy
    new GameConsole(/Arduboy/i, ['.arduboy', '.hex'], {
      batocera: 'arduboy',
      esde: 'arduboy',
      jelos: 'arduboy',
      mister: 'Arduboy',
      pocket: 'arduboy',
      retrodeck: 'arduboy',
    }),
    // Atari
    new GameConsole(/800|8-bit Family/, ['.atr', '.atx'], {
      batocera: 'atari800',
      esde: 'atari800',
      jelos: 'atari800',
      mister: 'ATARI800',
      onion: 'EIGHTHUNDRED',
      retrodeck: 'atari800',
    }),
    new GameConsole(/2600/, ['.a26', '.act', '.pb', '.tv', '.tvr', '.mn', '.cv', '.eb', '.ef', '.efr', '.ua', '.x07', '.sb'], {
      adam: 'A2600',
      batocera: 'atari2600',
      esde: 'atari2600',
      jelos: 'atari2600',
      mister: 'Atari2600',
      miyoocfw: '2600',
      onion: 'ATARI',
      pocket: '2600',
      retrodeck: 'atari2600',
      twmenu: 'a26',
    }),
    new GameConsole(/5200/, ['.a52'], {
      adam: 'A5200',
      batocera: 'atari5200',
      esde: 'atari5200',
      jelos: 'atari5200',
      mister: 'Atari5200',
      onion: 'FIFTYTWOHUNDRED',
      retrodeck: 'atari5200',
      twmenu: 'a52',
    }),
    new GameConsole(/7800/, ['.a78'], {
      adam: 'A7800',
      batocera: 'atari7800',
      esde: 'atari7800',
      jelos: 'atari7800',
      mister: 'Atari7800',
      onion: 'SEVENTYEIGHTHUNDRED',
      pocket: '7800',
      retrodeck: 'atari7800',
      twmenu: 'a78',
    }),
    new GameConsole(/Jaguar/i, ['.j64'], {
      batocera: 'jaguar',
      esde: 'atarijaguar',
      jelos: 'atarijaguar',
      onion: 'JAGUAR',
      retrodeck: 'atarijaguar',
    }),
    new GameConsole(/Lynx/i, ['.lnx', '.lyx'], {
      adam: 'LYNX',
      batocera: 'lynx',
      esde: 'atarilynx',
      funkeyos: 'Atari lynx',
      jelos: 'atarilynx',
      mister: 'AtariLynx',
      miyoocfw: 'LYNX',
      onion: 'LYNX',
      retrodeck: 'atarilynx',
    }),
    new GameConsole(/Atari.*ST/i, ['.msa', '.st', '.stx'], {
      batocera: 'atarist',
      esde: 'atarist',
      jelos: 'atarist',
      mister: 'AtariST',
      onion: 'ATARIST',
      retrodeck: 'atarist',
    }),
    // Bally
    new GameConsole(/Astrocade/i, [/* '.bin' */], {
      batocera: 'astrocde',
      esde: 'astrocde',
      mister: 'Astrocade',
      retrodeck: 'astrocde',
    }),
    // Bandai
    new GameConsole(/Super ?Vision 8000/i, [/* unknown */], {
      mister: 'Supervision8000',
    }),
    new GameConsole(/RX[ -]?78/i, [], {
      mister: 'RX78',
    }),
    new GameConsole(/WonderSwan/i, ['.ws'], {
      adam: 'WSC',
      batocera: 'wswan',
      esde: 'wonderswan',
      funkeyos: 'WonderSwan',
      jelos: 'wonderswan',
      mister: 'WonderSwan',
      miyoocfw: 'WSWAN',
      onion: 'WS',
      pocket: 'wonderswan',
      retrodeck: 'wonderswan',
      twmenu: 'ws',
    }),
    new GameConsole(/WonderSwan Color/i, ['.wsc'], {
      adam: 'WSC',
      batocera: 'wswanc',
      esde: 'wswanc',
      funkeyos: 'WonderSwan',
      jelos: 'wonderswancolor',
      mister: 'WonderSwan',
      miyoocfw: 'WSWAN', // TODO: check if this works
      onion: 'WS',
      pocket: 'wonderswan',
      retrodeck: 'wonderswancolor',
      twmenu: 'ws',
    }),
    // Bit Corporation
    new GameConsole(/Gamate/i, [/* '.bin' */], {
      batocera: 'gamate',
      esde: 'gamate',
      mister: 'Gamate',
      pocket: 'gamate',
    }),
    // Capcom
    // TODO(cemmer): CPS1, CPS2, CPS3
    // Casio
    new GameConsole(/PV[ -]?1000/i, [/* '.bin' */], {
      batocera: 'pv1000',
      esde: 'pv1000',
      mister: 'Casio_PV-1000',
      retrodeck: 'pv1000',
    }),
    new GameConsole(/PV[ -]?2000/i, [/* '.bin' */], {
      mister: 'Casio_PV-2000',
    }),
    // Commodore
    new GameConsole(/Amiga/i, [], {
      adam: 'AMIGA',
      esde: 'amiga',
      jelos: 'amiga',
      mister: 'Amiga',
      onion: 'AMIGA',
      pocket: 'amiga',
      retrodeck: 'amiga',
    }),
    new GameConsole(/Amiga CD32/i, [/* '.bin', '.cue' */], {
      adam: 'AMIGA',
      batocera: 'amigacd32',
      esde: 'amigacd32',
      jelos: 'amigacd32',
      mister: 'Amiga',
      onion: 'AMIGACD',
      retrodeck: 'amigacd32',
    }),
    new GameConsole(/Amiga CDTV/i, [/* '.bin', '.cue' */], {
      adam: 'AMIGA',
      batocera: 'amigacdtv',
      esde: 'cdtv',
      retrodeck: 'cdtv',
    }),
    new GameConsole(/Commodore C?16/i, [/* unknown */], {
      jelos: 'c16',
      mister: 'C16',
    }),
    new GameConsole(/Commodore C?64/i, ['.crt', '.d64', '.t64'], {
      adam: 'C64',
      batocera: 'c64',
      esde: 'c64',
      jelos: 'c64',
      mister: 'C64',
      onion: 'COMMODORE',
      retrodeck: 'c64',
    }),
    new GameConsole(/Commodore C?128/i, [/* unknown */], {
      batocera: 'c128',
      jelos: 'c128',
      mister: 'C128',
    }),
    new GameConsole(/Plus.*4/i, [], {
      esde: 'plus4',
      retrodeck: 'plus4',
    }),
    new GameConsole(/VIC.*20/i, [], {
      esde: 'vic20',
      onion: 'VIC20',
      retrodeck: 'vic20',
    }),
    // Coleco
    new GameConsole(/ColecoVision/i, ['.col'], {
      adam: 'COLECO',
      batocera: 'colecovision',
      esde: 'colecovision',
      jelos: 'coleco',
      mister: 'Coleco',
      onion: 'COLECO',
      pocket: 'coleco',
      retrodeck: 'colecovision',
      twmenu: 'col',
    }),
    // Emerson
    new GameConsole(/Arcadia/i, [/* '.bin' */], {
      batocera: 'arcadia',
      esde: 'arcadia',
      mister: 'Arcadia',
      pocket: 'arcadia',
      retrodeck: 'arcadia',
    }),
    // Entex
    new GameConsole(/Adventure Vision/i, [/* '.bin' */], {
      batocera: 'advision',
      esde: 'avision',
      mister: 'AVision',
      pocket: 'avision',
    }),
    // Epoch
    new GameConsole(/Super Cassette Vision/i, [], {
      batocera: 'scv',
      esde: 'scv',
      retrodeck: 'scv',
    }),
    // Fairchild
    new GameConsole(/Channel F/i, ['.chf'], {
      batocera: 'channelf',
      esde: 'channelf',
      jelos: 'channelf',
      mister: 'ChannelF',
      onion: 'FAIRCHILD',
      pocket: 'channel_f',
      retrodeck: 'channelf',
    }),
    // Funtech
    new GameConsole(/Super A'?Can/i, [/* '.bin' */], {
      esde: 'supracan',
      batocera: 'supracan',
    }),
    // GCE
    new GameConsole(/Vectrex/i, ['.gam', '.vc', '.vec'], {
      batocera: 'vectrex',
      esde: 'vectrex',
      jelos: 'vectrex',
      mister: 'Vectrex',
      miyoocfw: 'VECTREX',
      onion: 'VECTREX',
      retrodeck: 'vectrex',
    }),
    // Hartung
    new GameConsole(/Game Master/i, [/* '.bin' */], {
      esde: 'gmaster',
      retrodeck: 'gmaster',
    }),
    // Interton
    new GameConsole(/VC ?4000/i, [/* '.bin' */], {
      batocera: 'vc4000',
      mister: 'VC4000',
    }),
    // Magnavox
    new GameConsole(/Odyssey 2/i, [/* '.bin' */], {
      batocera: 'o2em',
      esde: 'odyssey2',
      jelos: 'odyssey',
      mister: 'Odyssey2',
      onion: 'ODYSSEY',
      pocket: 'odyssey2',
      retrodeck: 'odyssey2',
    }),
    // Mattel
    new GameConsole(/Intellivision/i, ['.int'], {
      adam: 'INTELLI',
      batocera: 'intellivision',
      esde: 'intellivision',
      jelos: 'intellivision',
      mister: 'Intellivision',
      onion: 'INTELLIVISION',
      pocket: 'intv',
      retrodeck: 'intellivision',
    }),
    // Microsoft
    new GameConsole(/MSX/i, ['.mx1'], {
      adam: 'MSX',
      batocera: 'msx1',
      esde: 'msx',
      jelos: 'msx',
      mister: 'MSX',
      onion: 'MSX',
      retrodeck: 'msx',
    }),
    new GameConsole(/MSX2/i, ['.mx2'], {
      adam: 'MSX',
      batocera: 'msx2',
      esde: 'msx2',
      jelos: 'msx2',
      mister: 'MSX',
      onion: 'MSX',
      retrodeck: 'msx2',
    }),
    new GameConsole(/MSX2+/i, [], {
      adam: 'MSX',
      batocera: 'msx2+',
      esde: 'msx2',
      mister: 'MSX',
      onion: 'MSX',
      retrodeck: 'msx2',
    }),
    new GameConsole(/MSX TurboR/i, [], {
      adam: 'MSX',
      batocera: 'msxturbor',
      esde: 'msx',
      mister: 'MSX',
      onion: 'MSX',
      retrodeck: 'msx2',
    }),
    new GameConsole(/Xbox/i, [/* '.iso' */], {
      batocera: 'xbox',
      esde: 'xbox',
      jelos: 'xbox',
      retrodeck: 'xbox',
    }),
    new GameConsole(/Xbox 360/i, [/* '.iso' */], {
      batocera: 'xbox360',
      esde: 'xbox360',
    }),
    // Mobile
    new GameConsole(/J2ME/i, ['.jar'], {
      esde: 'j2me',
      retrodeck: 'j2me',
    }),
    new GameConsole(/Palm OS/i, ['.pqa', '.prc'], {
      esde: 'palm',
      retrodeck: 'palm',
    }),
    new GameConsole(/Symbian/i, ['.sis', '.sisx', '.symbian'], {
      esde: 'symbian',
      retrodeck: 'symbian',
    }),
    // Nichibutsu
    new GameConsole(/My Vision/i, [/* unknown */], {
      mister: 'MyVision',
    }),
    // NEC
    new GameConsole(/PC Engine|TurboGrafx/i, ['.pce'], {
      adam: 'PCE',
      batocera: 'pcengine',
      esde: 'pcengine',
      funkeyos: 'PCE-TurboGrafx',
      jelos: 'tg16',
      minui: 'TurboGrafx-16 (PCE)',
      mister: 'TGFX16',
      miyoocfw: 'PCE',
      onion: 'PCE',
      pocket: 'pce',
      retrodeck: 'pcengine',
      twmenu: 'tg16',
    }),
    new GameConsole(/(PC Engine|TurboGrafx) CD/i, [/* '.bin', '.cue' */], {
      adam: 'PCECD',
      batocera: 'pcenginecd',
      esde: 'pcenginecd',
      jelos: 'tg16cd',
      minui: 'TurboGrafx-16 CD (PCE)',
      mister: 'TGFX16',
      miyoocfw: 'PCE',
      onion: 'PCECD',
      pocket: 'pcecd',
      retrodeck: 'pcenginecd',
    }),
    new GameConsole(/SuperGrafx/i, ['.sgx'], {
      batocera: 'supergrafx',
      esde: 'supergrafx',
      jelos: 'sgfx',
      mister: 'TGFX16',
      onion: 'SGFX',
      pocket: 'pce',
      retrodeck: 'supergrafx',
    }),
    new GameConsole(/PC-88/i, ['.d88'], {
      batocera: 'pc88',
      esde: 'pc88',
      jelos: 'pc88',
      mister: 'PC8801',
      onion: 'PCEIGHTYEIGHT',
      retrodeck: 'pc88',
    }),
    new GameConsole(/PC-98/i, ['.d98'], {
      batocera: 'pc98',
      esde: 'pc98',
      jelos: 'pc98',
      onion: 'PCNINETYEIGHT',
      retrodeck: 'pc98',
    }),
    new GameConsole(/PC-FX/i, [], {
      esde: 'pcfx',
      onion: 'PCFX',
      retrodeck: 'pcfx',
    }),
    // nesbox
    new GameConsole(/TIC-80/i, ['.tic'], {
      adam: 'TIC80',
      esde: 'tic80',
      retrodeck: 'tic80',
    }),
    // Nintendo
    new GameConsole(/FDS|(Famicom|Family) Computer Disk System/i, ['.fds'], {
      adam: 'FDS',
      batocera: 'fds',
      esde: 'fds',
      funkeyos: 'NES',
      jelos: 'fds',
      minui: 'Famicom Disk System (FC)',
      mister: 'NES',
      miyoocfw: 'NES',
      onion: 'FDS',
      pocket: 'nes',
      retrodeck: 'fds',
    }),
    new GameConsole(/Game (and|&) Watch/i, ['.mgw'], {
      adam: 'GW',
      batocera: 'gameandwatch',
      esde: 'gameandwatch',
      jelos: 'gameandwatch',
      mister: 'GameNWatch',
      onion: 'GW',
      retrodeck: 'gameandwatch',
    }),
    new GameConsole(/GameCube/i, [/* '.iso' */], {
      batocera: 'gc',
      esde: 'gc',
      jelos: 'gamecube',
      retrodeck: 'gc',
    }),
    new GameConsole(/GB|Game ?Boy/i, ['.gb', '.sgb'], {
      adam: 'GB',
      batocera: 'gb',
      esde: 'gb',
      funkeyos: 'Game Boy',
      jelos: 'gb',
      minui: 'Game Boy (GB)',
      mister: 'Gameboy',
      miyoocfw: 'GB',
      onion: 'GB',
      pocket: 'gb',
      retrodeck: 'gb',
      twmenu: 'gb',
    }), // pocket:sgb for spiritualized1997
    new GameConsole(/GBA|Game ?Boy Advance/i, ['.gba', '.srl'], {
      adam: 'GBA',
      batocera: 'gba',
      esde: 'gba',
      funkeyos: 'Game Boy Advance',
      jelos: 'gba',
      minui: 'Game Boy Advance (GBA)',
      mister: 'GBA',
      miyoocfw: 'GBA',
      onion: 'GBA',
      pocket: 'gba',
      retrodeck: 'gba',
      twmenu: 'gba',
    }),
    new GameConsole(/GBC|Game ?Boy Color/i, ['.gbc'], {
      adam: 'GBC',
      batocera: 'gbc',
      esde: 'gbc',
      funkeyos: 'Game Boy Color',
      jelos: 'gbc',
      minui: 'Game Boy Color (GBC)',
      mister: 'Gameboy',
      miyoocfw: 'GB',
      onion: 'GBC',
      pocket: 'gbc',
      retrodeck: 'gbc',
      twmenu: 'gb',
    }),
    new GameConsole(/Nintendo 64|N64/i, ['.d64', '.n64', '.v64', '.z64'], {
      batocera: 'n64',
      esde: 'n64',
      jelos: 'n64',
      mister: 'N64',
      retrodeck: 'n64',
    }),
    new GameConsole(/Nintendo 64DD|N64DD/i, ['.ndd'], {
      batocera: 'n64dd',
      esde: 'n64dd',
      retrodeck: 'n64dd',
    }),
    new GameConsole(/(\W|^)3DS(\W|$)|Nintendo 3DS/i, ['.3ds', '.3dsx'], {
      batocera: '3ds',
      esde: 'n3ds',
      jelos: '3ds',
      retrodeck: 'n3ds',
    }),
    new GameConsole(/(\W|^)NDS(\W|$)|Nintendo DS/i, ['.nds'], {
      batocera: 'nds',
      esde: 'nds',
      jelos: 'nds',
      onion: 'NDS',
      retrodeck: 'nds',
      twmenu: 'nds',
    }),
    new GameConsole(/(\W|^)NDSi(\W|$)|Nintendo DSi([Ww]are)?/i, [], {
      esde: 'nds',
      retrodeck: 'nds',
      twmenu: 'dsiware',
    }), // try to map DSiWare
    new GameConsole(/(\W|^)NES(\W|$)|Famicom|Nintendo Entertainment System/i, ['.nes', '.nez'], {
      adam: 'FC',
      batocera: 'nes',
      esde: 'nes',
      funkeyos: 'NES',
      jelos: 'nes',
      minui: 'Nintendo Entertainment System (FC)',
      mister: 'NES',
      miyoocfw: 'NES',
      onion: 'FC',
      pocket: 'nes',
      retrodeck: 'nes',
      twmenu: 'nes',
    }),
    new GameConsole(/Pokemon Mini/i, ['.min'], {
      adam: 'POKEMINI',
      batocera: 'pokemini',
      esde: 'pokemini',
      funkeyos: 'Pokemini',
      jelos: 'pokemini',
      minui: 'Pokemon mini (PKM)', // uses unrendedable unicode char in original install
      mister: 'PokemonMini',
      miyoocfw: 'POKEMINI',
      onion: 'POKE',
      pocket: 'poke_mini',
      retrodeck: 'pokemini',
    }),
    new GameConsole(/Satellaview/i, ['.bs'], {
      batocera: 'satellaview',
      esde: 'satellaview',
      jelos: 'satellaview',
      mister: 'SNES',
      onion: 'SATELLAVIEW',
      pocket: 'snes',
      retrodeck: 'satellaview',
    }),
    new GameConsole(/Sufami/i, [], {
      batocera: 'sufami',
      esde: 'sufami',
      jelos: 'sufami',
      onion: 'SUFAMI',
      retrodeck: 'sufami',
    }),
    new GameConsole(/(\W|^)SNES(\W|$)|Super (Nintendo Entertainment System|Famicom)/i, ['.sfc', '.smc'], {
      adam: 'SFC',
      batocera: 'snes',
      esde: 'snes',
      funkeyos: 'SNES',
      jelos: 'snes',
      minui: 'Super Nintendo Entertainment System (SFC)',
      mister: 'SNES',
      miyoocfw: 'SNES',
      onion: 'SFC',
      pocket: 'snes',
      retrodeck: 'snes',
      twmenu: 'snes',
    }),
    new GameConsole(/Switch/i, ['.nca', '.nro', '.nso', '.nsp', '.xci'], {
      esde: 'switch',
      retrodeck: 'switch',
    }),
    new GameConsole(/Virtual Boy/i, ['.vb', '.vboy'], {
      adam: 'VB',
      batocera: 'virtualboy',
      esde: 'virtualboy',
      funkeyos: 'Virtualboy',
      jelos: 'virtualboy',
      minui: 'Virtual Boy (VB)',
      onion: 'VB',
      retrodeck: 'virtualboy',
    }),
    new GameConsole(/Wii/i, [/* '.iso' */], {
      batocera: 'wii',
      esde: 'wii',
      jelos: 'wii',
      retrodeck: 'wii',
    }),
    new GameConsole(/Wii ?U/i, ['.rpx', '.wua', '.wud', '.wux'], {
      batocera: 'wiiu',
      esde: 'wiiu',
      jelos: 'wiiu',
      retrodeck: 'wiiu',
    }),
    // Panasonic
    new GameConsole(/3DO/i, [/* '.bin', '.cue' */], {
      batocera: '3do',
      esde: '3do',
      jelos: '3do',
      onion: 'PANASONIC',
      retrodeck: '3do',
    }),
    // Philips
    new GameConsole(/CD[ -]?i/i, [/* '.bin', '.cue' */], {
      batocera: 'cdi',
      esde: 'cdimono1',
      retrodeck: 'cdimono1',
    }),
    new GameConsole(/Videopac/i, [/* '.bin' */], {
      batocera: 'videopacplus',
      esde: 'videopac',
      jelos: 'videopac',
      mister: 'Odyssey2',
      onion: 'VIDEOPAC',
      retrodeck: 'videopac',
    }),
    // RCA
    new GameConsole(/Studio (2|II)/i, [/* '.bin' */], {
      pocket: 'studio2',
    }),
    // Sega
    new GameConsole(/32X/i, ['.32x'], {
      adam: '32X',
      batocera: 'sega32x',
      esde: 'sega32x',
      jelos: 'sega32x',
      minui: 'Sega 32X (MD)', // added for sorting convenience
      mister: 'S32X',
      onion: 'THIRTYTWOX',
      retrodeck: 'sega32x',
    }),
    new GameConsole(/Dreamcast/i, [/* '.bin', '.cue' */], {
      batocera: 'dreamcast',
      esde: 'dreamcast',
      jelos: 'dreamcast',
      retrodeck: 'dreamcast',
    }),
    new GameConsole(/Game Gear/i, ['.gg'], {
      adam: 'GG',
      batocera: 'gamegear',
      esde: 'gamegear',
      funkeyos: 'Game Gear',
      jelos: 'gamegear',
      minui: 'Sega Game Gear (GG)',
      mister: 'SMS',
      miyoocfw: 'SMS',
      onion: 'GG',
      pocket: 'gg',
      retrodeck: 'gamegear',
      twmenu: 'gg',
    }),
    new GameConsole(/Master System/i, ['.sms'], {
      adam: 'SMS',
      batocera: 'mastersystem',
      esde: 'mastersystem',
      funkeyos: 'Sega Master System',
      jelos: 'mastersystem',
      minui: 'Sega Master System (SMS)',
      mister: 'SMS',
      miyoocfw: 'SMS',
      onion: 'MS',
      pocket: 'sms',
      retrodeck: 'mastersystem',
      twmenu: 'sms',
    }),
    new GameConsole(/(Mega|Sega) CD/i, [/* '.bin', '.cue' */], {
      adam: 'SEGACD',
      batocera: 'segacd',
      esde: 'segacd',
      jelos: 'segacd',
      minui: 'Sega CD (MD)', // added for sorting convenience
      mister: 'MegaCD',
      miyoocfw: 'SMD',
      onion: 'SEGACD',
      retrodeck: 'segacd',
    }),
    new GameConsole(/Mega Drive|Genesis/i, ['.gen', '.md', '.mdx', '.sgd', '.smd'], {
      adam: 'MD',
      batocera: 'megadrive',
      esde: 'megadrive',
      funkeyos: 'Sega Genesis',
      jelos: 'genesis',
      minui: 'Sega Genesis (MD)',
      mister: 'Genesis',
      miyoocfw: 'SMD',
      onion: 'MD',
      pocket: 'genesis',
      retrodeck: 'megadrive',
      twmenu: 'gen',
    }),
    new GameConsole(/Saturn/i, [/* '.bin', '.cue' */], {
      batocera: 'saturn',
      esde: 'saturn',
      jelos: 'saturn',
      retrodeck: 'saturn',
    }),
    new GameConsole(/SG[ -]?1000/i, ['.sc', '.sg'], {
      adam: 'SG1000',
      batocera: 'sg1000',
      esde: 'sg-1000',
      jelos: 'sg-1000',
      mister: 'SG1000',
      onion: 'SEGASGONE',
      pocket: 'sg1000',
      retrodeck: 'sg-1000',
      twmenu: 'sg',
    }),
    // Sharp
    new GameConsole(/MZ/i, [], {
      mister: 'SharpMZ',
    }),
    new GameConsole(/X1/i, ['.2d', '.2hd', '.dx1', '.tfd'], {
      batocera: 'x1',
      esde: 'x1',
      jelos: 'x1',
      onion: 'XONE',
      retrodeck: 'x1',
    }),
    new GameConsole(/X68000/i, [], {
      batocera: 'x68000',
      esde: 'x68000',
      jelos: 'x68000',
      mister: 'X68000',
      onion: 'X68000',
      retrodeck: 'x68000',
    }),
    // Sinclair
    new GameConsole(/ZX[ -]?80/i, [], {
      esde: 'zx81',
      mister: 'ZX81',
      retrodeck: 'zx81',
    }),
    new GameConsole(/ZX[ -]?81/i, [], {
      batocera: 'zx81',
      esde: 'zx81',
      jelos: 'zx81',
      mister: 'ZX81',
      onion: 'ZXEIGHTYONE',
      retrodeck: 'zx81',
    }),
    new GameConsole(/ZX[ -]?Spectrum/i, ['.scl', '.szx', '.z80'], {
      adam: 'ZX',
      batocera: 'zxspectrum',
      esde: 'zxspectrum',
      jelos: 'zxspectrum',
      mister: 'Spectrum',
      onion: 'ZXS',
      retrodeck: 'zxspectrum',
    }),
    // SNK
    new GameConsole(/Neo ?Geo/i, [], {
      adam: 'NEOGEO',
      batocera: 'neogeo',
      esde: 'neogeo',
      jelos: 'neogeo',
      mister: 'NeoGeo',
      miyoocfw: 'NEOGEO',
      onion: 'NEOGEO',
      pocket: 'ng',
      retrodeck: 'neogeo',
    }),
    new GameConsole(/Neo ?Geo CD/i, [/* '.bin', '.cue' */], {
      batocera: 'neogeocd',
      esde: 'neogeocd',
      jelos: 'neocd',
      onion: 'NEOCD',
      retrodeck: 'neogeocd',
    }),
    new GameConsole(/Neo ?Geo Pocket/i, ['.ngp'], {
      adam: 'NGP',
      batocera: 'ngp',
      esde: 'ngp',
      funkeyos: 'Neo Geo Pocket',
      jelos: 'ngp',
      minui: 'Neo Geo Pocket (NGPC)', // added for sorting convenience
      onion: 'NGP',
      retrodeck: 'ngp',
      twmenu: 'ngp',
    }),
    new GameConsole(/Neo ?Geo Pocket Color/i, ['.ngc', '.ngpc', '.npc'], {
      adam: 'NGP',
      batocera: 'ngpc',
      esde: 'ngpc',
      funkeyos: 'Neo Geo Pocket',
      jelos: 'ngpc',
      minui: 'Neo Geo Pocket Color (NGPC)', // added for sorting convenience
      onion: 'NGP',
      retrodeck: 'ngpc',
      twmenu: 'ngp',
    }),
    // Sony
    new GameConsole(/PlayStation|psx/i, ['.minipsf', '.pbp', '.psexe', '.psf'], {
      adam: 'PS',
      batocera: 'psx',
      esde: 'psx',
      funkeyos: 'PS1',
      jelos: 'psx',
      minui: 'Sony PlayStation (PS)',
      mister: 'PSX',
      miyoocfw: 'PS1',
      onion: 'PS',
      retrodeck: 'psx',
    }),
    new GameConsole(/PlayStation 2|ps2/i, [/* '.bin', '.cue' */], {
      batocera: 'ps2',
      esde: 'ps2',
      jelos: 'ps2',
      retrodeck: 'ps2',
    }),
    new GameConsole(/PlayStation 3|ps3/i, ['.ps3', '.ps3dir'], {
      batocera: 'ps3',
      esde: 'ps3',
      jelos: 'ps3',
      retrodeck: 'ps3',
    }),
    new GameConsole(/PlayStation ?Portable|psp/i, ['.cso'], {
      batocera: 'psp',
      esde: 'psp',
      jelos: 'psp',
      retrodeck: 'psp',
    }),
    new GameConsole(/PlayStation ?Vita|psvita/i, ['.psvita'], {
      batocera: 'psvita',
      esde: 'psvita',
      retrodeck: 'psvita',
    }),
    new GameConsole(/PlayStation [4-9]|ps[4-9]/i, [/* '.bin' */], {}),
    // Sord
    new GameConsole(/Sord[ -]M(5|five)/i, [/* '.bin', '.cas' */], {
      twmenu: 'm5',
    }),
    // Texas Instruments
    new GameConsole(/TI-?99-?4A/i, ['.rpk'], {
      esde: 'ti99',
      retrodeck: 'ti99',
    }),
    // Tiger
    new GameConsole(/Game.?com/i, ['.tgc'], {
      esde: 'gamecom',
      retrodeck: 'gamecom',
    }),
    // Timetop
    new GameConsole(/GameKing/i, [/* '.bin' */], {
      pocket: 'game_king',
    }),
    // VTech
    new GameConsole(/CreatiVision/i, [/* '.rom' */], {
      batocera: 'crvision',
      esde: 'crvision',
      mister: 'CreatiVision',
      pocket: 'creativision',
      retrodeck: 'crvision',
    }),
    new GameConsole(/V\.Smile/i, [/* '.bin' */], {
      batocera: 'vsmile',
      esde: 'vsmile',
      retrodeck: 'vsmile',
    }),
    // Watara
    new GameConsole(/Supervision/i, ['.sv'], {
      adam: 'SUPERVISION',
      batocera: 'supervision',
      esde: 'supervision',
      jelos: 'supervision',
      mister: 'SuperVision',
      onion: 'SUPERVISION',
      pocket: 'supervision',
      retrodeck: 'supervision',
    }),
    // Wellback
    new GameConsole(/Mega Duck/i, ['.md1', '.md2'], {
      batocera: 'megaduck',
      esde: 'megaduck',
      jelos: 'megaduck',
      onion: 'MEGADUCK',
      pocket: 'mega_duck',
      retrodeck: 'megaduck',
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

  getAdam(): string | undefined {
    return this.outputTokens.adam;
  }

  getBatocera(): string | undefined {
    return this.outputTokens.batocera;
  }

  getESDE(): string | undefined {
    return this.outputTokens.esde;
  }

  getFunkeyOS(): string | undefined {
    return this.outputTokens.funkeyos;
  }

  getJelos(): string | undefined {
    return this.outputTokens.jelos;
  }

  getMinUI(): string | undefined {
    return this.outputTokens.minui;
  }

  getMister(): string | undefined {
    return this.outputTokens.mister;
  }

  getMiyooCFW(): string | undefined {
    return this.outputTokens.miyoocfw;
  }

  getOnion(): string | undefined {
    return this.outputTokens.onion;
  }

  getPocket(): string | undefined {
    return this.outputTokens.pocket;
  }

  getRetroDECK(): string | undefined {
    return this.outputTokens.retrodeck;
  }

  getTWMenu(): string | undefined {
    return this.outputTokens.twmenu;
  }
}
