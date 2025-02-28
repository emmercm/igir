import path from 'node:path';

interface OutputTokens {
  // Adam image has it's roms in the /ROMS/{adam} subdirectory
  // @see https://github.com/eduardofilo/RG350_adam_image/wiki/En:-3.-Content-installation#roms
  adam?: string;

  // Batocera ROMs go in the roms/{batocera} directory:
  // @see https://wiki.batocera.org/systems
  batocera?: string;

  // EmulationStation ROMs go in the roms/{es} directory:
  // @see https://gitlab.com/es-de/emulationstation-de/-/blob/master/resources/systems/linux/es_systems.xml
  emulationstation?: string;

  // FunKey S ROMs go into the subfolder of / for the console:
  // @see https://github.com/FunKey-Project/FunKey-OS/tree/master/FunKey/board/funkey/rootfs-overlay/usr/games/collections
  funkeyos?: string;

  // JELOS ROMs go in the ??? directory:
  // @see https://github.com/JustEnoughLinuxOS/distribution/blob/main/documentation/PER_DEVICE_DOCUMENTATION/AMD64/SUPPORTED_EMULATORS_AND_CORES.md
  jelos?: string;

  // MinUI roms go into the /Roms folder on the SD card
  // @see https://github.com/shauninman/MinUI/tree/main/skeleton/BASE/Roms
  // @see https://github.com/shauninman/MinUI/tree/main/skeleton/EXTRAS/Roms
  // There are some special considerations about naming these folders
  // to influence UI presentation
  // @see https://github.com/shauninman/MinUI/blob/main/skeleton/BASE/README.txt
  minui?: string;

  // MiSTer ROMs go in the /games/{mister}/ directory:
  // @see https://mister-devel.github.io/MkDocs_MiSTer/developer/corenames/
  // @see https://mister-devel.github.io/MkDocs_MiSTer/cores/console/
  // @see https://mister-devel.github.io/MkDocs_MiSTer/cores/computer/
  mister?: string;

  // MiyooCFW Roms go into the /roms subfolder of the SD card
  // @see https://github.com/TriForceX/MiyooCFW/wiki/Emulator-Info
  miyoocfw?: string;

  // OnionOS/GarlicOS ROMs go in the /Roms/{onion} directory:
  // @see https://onionui.github.io/docs/emulators
  onion?: string;

  // Analogue Pocket ROMs go in the /Assets/{pocket}/common/ directory
  // @see https://openfpga-cores-inventory.github.io/analogue-pocket/
  pocket?: string;

  // RetroDECK ROMs go in the /roms/{retrodeck} directory:
  // @see https://github.com/XargonWan/RetroDECK/blob/main/es-configs/es_systems.xml
  retrodeck?: string;

  // RomM ROMs go in the /romm/library/{romm} directory:
  // @see https://docs.romm.app/latest/Platforms-and-Players/Supported-Platforms/
  romm?: string;

  // TWiLightMenu++ Roms go into the /roms subfolder on the 3DS/DSi SD card
  // @see https://github.com/DS-Homebrew/TWiLightMenu/tree/master/7zfile/roms
  twmenu?: string;
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
    new GameConsole(/Archimedes/i, [], {
      mister: 'ARCHIE',
    }),
    new GameConsole(/Atom/i, [], {
      batocera: 'atom',
      mister: 'AcornAtom',
    }),
    // Amstrad
    new GameConsole(/CPC/i, [], {
      adam: 'AMSTRAD',
      batocera: 'amstradcpc',
      emulationstation: 'amstradcpc',
      jelos: 'amstradcpc',
      mister: 'Amstrad',
      onion: 'CPC',
      retrodeck: 'amstradcpc',
      romm: 'acpc',
      twmenu: 'cpc',
    }),
    new GameConsole(
      /PCW/i,
      [
        /* unknown */
      ],
      {
        mister: 'AmstradPCW',
        romm: 'amstrad-pcw',
      },
    ),
    // Apple
    new GameConsole(
      /Apple.*I/i,
      [
        /* unknown */
      ],
      {
        mister: 'Apple-I',
      },
    ),
    new GameConsole(/Apple.*IIe?/i, ['.do', '.nib', '.po'], {
      batocera: 'apple2',
      emulationstation: 'apple2',
      mister: 'Apple-II',
      retrodeck: 'apple2',
      romm: 'appleii',
    }),
    new GameConsole(/Apple.*IIGS/i, ['.2mg'], {
      emulationstation: 'apple2gs',
      retrodeck: 'apple2gs',
      romm: 'apple-iigs',
    }),
    // Arduboy
    new GameConsole(/Arduboy/i, ['.arduboy', '.hex'], {
      batocera: 'arduboy',
      emulationstation: 'arduboy',
      jelos: 'arduboy',
      mister: 'Arduboy',
      pocket: 'arduboy',
      retrodeck: 'arduboy',
      romm: 'arduboy',
    }),
    // Atari
    new GameConsole(/800|8-bit Family/, ['.atr', '.atx'], {
      batocera: 'atari800',
      emulationstation: 'atari800',
      jelos: 'atari800',
      mister: 'Atari800',
      onion: 'EIGHTHUNDRED',
      retrodeck: 'atari800',
      romm: 'atari8bit',
    }),
    new GameConsole(
      /2600/,
      [
        '.a26',
        '.act',
        '.pb',
        '.tv',
        '.tvr',
        '.mn',
        '.cv',
        '.eb',
        '.ef',
        '.efr',
        '.ua',
        '.x07',
        '.sb',
      ],
      {
        adam: 'A2600',
        batocera: 'atari2600',
        emulationstation: 'atari2600',
        jelos: 'atari2600',
        mister: 'Atari2600',
        miyoocfw: '2600',
        onion: 'ATARI',
        pocket: '2600',
        retrodeck: 'atari2600',
        romm: 'atari2600',
        twmenu: 'a26',
      },
    ),
    new GameConsole(/5200/, ['.a52'], {
      adam: 'A5200',
      batocera: 'atari5200',
      emulationstation: 'atari5200',
      jelos: 'atari5200',
      mister: 'Atari5200',
      onion: 'FIFTYTWOHUNDRED',
      retrodeck: 'atari5200',
      romm: 'atari5200',
      twmenu: 'a52',
    }),
    new GameConsole(/7800/, ['.a78'], {
      adam: 'A7800',
      batocera: 'atari7800',
      emulationstation: 'atari7800',
      jelos: 'atari7800',
      mister: 'Atari7800',
      onion: 'SEVENTYEIGHTHUNDRED',
      pocket: '7800',
      retrodeck: 'atari7800',
      romm: 'atari7800',
      twmenu: 'a78',
    }),
    new GameConsole(/Jaguar/i, ['.j64'], {
      batocera: 'jaguar',
      emulationstation: 'atarijaguar',
      jelos: 'atarijaguar',
      onion: 'JAGUAR',
      retrodeck: 'atarijaguar',
      romm: 'jaguar',
    }),
    new GameConsole(/Lynx/i, ['.lnx', '.lyx'], {
      adam: 'LYNX',
      batocera: 'lynx',
      emulationstation: 'atarilynx',
      funkeyos: 'Atari lynx',
      jelos: 'atarilynx',
      mister: 'AtariLynx',
      miyoocfw: 'LYNX',
      onion: 'LYNX',
      retrodeck: 'atarilynx',
      romm: 'lynx',
    }),
    new GameConsole(/Atari.*ST/i, ['.msa', '.st', '.stx'], {
      batocera: 'atarist',
      emulationstation: 'atarist',
      jelos: 'atarist',
      mister: 'AtariST',
      onion: 'ATARIST',
      retrodeck: 'atarist',
      romm: 'atari-st',
    }),
    // Bally
    new GameConsole(
      /Astrocade/i,
      [
        /* '.bin' */
      ],
      {
        batocera: 'astrocde',
        emulationstation: 'astrocde',
        mister: 'Astrocade',
        retrodeck: 'astrocde',
        romm: 'astrocade',
      },
    ),
    // Bandai
    new GameConsole(
      /Super ?Vision 8000/i,
      [
        /* unknown */
      ],
      {
        mister: 'Supervision8000',
      },
    ),
    new GameConsole(/RX[ -]?78/i, [], {
      mister: 'RX78',
    }),
    new GameConsole(/WonderSwan/i, ['.ws'], {
      adam: 'WSC',
      batocera: 'wswan',
      emulationstation: 'wonderswan',
      funkeyos: 'WonderSwan',
      jelos: 'wonderswan',
      mister: 'WonderSwan',
      miyoocfw: 'WSWAN',
      onion: 'WS',
      pocket: 'wonderswan',
      retrodeck: 'wonderswan',
      romm: 'wonderswan',
      twmenu: 'ws',
    }),
    new GameConsole(/WonderSwan Color/i, ['.wsc'], {
      adam: 'WSC',
      batocera: 'wswanc',
      emulationstation: 'wswanc',
      funkeyos: 'WonderSwan',
      jelos: 'wonderswancolor',
      mister: 'WonderSwan',
      miyoocfw: 'WSWAN', // TODO: check if this works
      onion: 'WS',
      pocket: 'wonderswan',
      retrodeck: 'wonderswancolor',
      romm: 'wonderswan-color',
      twmenu: 'ws',
    }),
    // Bit Corporation
    new GameConsole(
      /Gamate/i,
      [
        /* '.bin' */
      ],
      {
        batocera: 'gamate',
        emulationstation: 'gamate',
        mister: 'Gamate',
        pocket: 'gamate',
        romm: 'gamate',
      },
    ),
    // Capcom
    // TODO(cemmer): CPS1, CPS2, CPS3
    // Casio
    new GameConsole(
      /PV[ -]?1000/i,
      [
        /* '.bin' */
      ],
      {
        batocera: 'pv1000',
        emulationstation: 'pv1000',
        mister: 'Casio_PV-1000',
        retrodeck: 'pv1000',
      },
    ),
    new GameConsole(
      /PV[ -]?2000/i,
      [
        /* '.bin' */
      ],
      {
        mister: 'Casio_PV-2000',
      },
    ),
    // Commodore
    new GameConsole(/Amiga/i, [], {
      adam: 'AMIGA',
      emulationstation: 'amiga',
      jelos: 'amiga',
      mister: 'Amiga',
      onion: 'AMIGA',
      pocket: 'amiga',
      retrodeck: 'amiga',
      romm: 'amiga',
    }),
    new GameConsole(
      /Amiga CD32/i,
      [
        /* '.bin', '.cue' */
      ],
      {
        adam: 'AMIGA',
        batocera: 'amigacd32',
        emulationstation: 'amigacd32',
        jelos: 'amigacd32',
        mister: 'Amiga',
        onion: 'AMIGACD',
        retrodeck: 'amigacd32',
        romm: 'amiga-cd32',
      },
    ),
    new GameConsole(
      /Amiga CDTV/i,
      [
        /* '.bin', '.cue' */
      ],
      {
        adam: 'AMIGA',
        batocera: 'amigacdtv',
        emulationstation: 'cdtv',
        retrodeck: 'cdtv',
        romm: 'commodore-cdtv',
      },
    ),
    new GameConsole(
      /Commodore C?16/i,
      [
        /* unknown */
      ],
      {
        jelos: 'c16',
        mister: 'C16',
        romm: 'c16',
      },
    ),
    new GameConsole(/Commodore C?64/i, ['.crt', '.d64', '.t64'], {
      adam: 'C64',
      batocera: 'c64',
      emulationstation: 'c64',
      jelos: 'c64',
      mister: 'C64',
      onion: 'COMMODORE',
      retrodeck: 'c64',
      romm: 'c64',
    }),
    new GameConsole(
      /Commodore C?128/i,
      [
        /* unknown */
      ],
      {
        batocera: 'c128',
        jelos: 'c128',
        mister: 'C128',
        romm: 'c64',
      },
    ),
    new GameConsole(/Plus.*4/i, [], {
      emulationstation: 'plus4',
      retrodeck: 'plus4',
      romm: 'c-plus-4',
    }),
    new GameConsole(/VIC[ -]?20/i, [], {
      emulationstation: 'vic20',
      onion: 'VIC20',
      retrodeck: 'vic20',
      romm: 'vic-20',
    }),
    // Coleco
    new GameConsole(/ColecoVision/i, ['.col'], {
      adam: 'COLECO',
      batocera: 'colecovision',
      emulationstation: 'colecovision',
      jelos: 'coleco',
      mister: 'Coleco',
      onion: 'COLECO',
      pocket: 'coleco',
      retrodeck: 'colecovision',
      romm: 'colecovision',
      twmenu: 'col',
    }),
    // Emerson
    new GameConsole(
      /Arcadia/i,
      [
        /* '.bin' */
      ],
      {
        batocera: 'arcadia',
        emulationstation: 'arcadia',
        mister: 'Arcadia',
        pocket: 'arcadia',
        retrodeck: 'arcadia',
      },
    ),
    // Entex
    new GameConsole(
      /Adventure Vision/i,
      [
        /* '.bin' */
      ],
      {
        batocera: 'advision',
        emulationstation: 'avision',
        mister: 'AVision',
        pocket: 'avision',
      },
    ),
    // Epoch
    new GameConsole(/Super Cassette Vision/i, [], {
      batocera: 'scv',
      emulationstation: 'scv',
      retrodeck: 'scv',
      romm: 'epoch-super-cassette-vision',
    }),
    // Fairchild
    new GameConsole(/Channel F/i, ['.chf'], {
      batocera: 'channelf',
      emulationstation: 'channelf',
      jelos: 'channelf',
      mister: 'ChannelF',
      onion: 'FAIRCHILD',
      pocket: 'channel_f',
      retrodeck: 'channelf',
      romm: 'fairchild-channel-f',
    }),
    // Funtech
    new GameConsole(
      /Super A'?Can/i,
      [
        /* '.bin' */
      ],
      {
        emulationstation: 'supracan',
        batocera: 'supracan',
      },
    ),
    // GamePark
    new GameConsole(/GP2X/i, [], {
      romm: 'gp2x',
    }),
    new GameConsole(
      /GP32/i,
      [
        /* '.smc' */
      ],
      {
        batocera: 'gp32',
        romm: 'gp32',
      },
    ),
    // GCE
    new GameConsole(/Vectrex/i, ['.gam', '.vc', '.vec'], {
      batocera: 'vectrex',
      emulationstation: 'vectrex',
      jelos: 'vectrex',
      mister: 'Vectrex',
      miyoocfw: 'VECTREX',
      onion: 'VECTREX',
      pocket: 'vectrex',
      retrodeck: 'vectrex',
      romm: 'vectrex',
    }),
    // Hartung
    new GameConsole(
      /Game Master/i,
      [
        /* '.bin' */
      ],
      {
        emulationstation: 'gmaster',
        retrodeck: 'gmaster',
      },
    ),
    // Interton
    new GameConsole(
      /VC ?4000/i,
      [
        /* '.bin' */
      ],
      {
        batocera: 'vc4000',
        mister: 'VC4000',
        romm: 'vc-4000',
      },
    ),
    // Magnavox
    new GameConsole(
      /Odyssey 2/i,
      [
        /* '.bin' */
      ],
      {
        batocera: 'o2em',
        emulationstation: 'odyssey2',
        jelos: 'odyssey',
        mister: 'Odyssey2',
        onion: 'ODYSSEY',
        pocket: 'odyssey2',
        retrodeck: 'odyssey2',
        romm: 'odyssey-2-slash-videopac-g7000',
      },
    ),
    // Mattel
    new GameConsole(/Intellivision/i, ['.int'], {
      adam: 'INTELLI',
      batocera: 'intellivision',
      emulationstation: 'intellivision',
      jelos: 'intellivision',
      mister: 'Intellivision',
      onion: 'INTELLIVISION',
      pocket: 'intv',
      retrodeck: 'intellivision',
      romm: 'intellivision',
    }),
    // Microsoft
    new GameConsole(/MSX/i, ['.mx1'], {
      adam: 'MSX',
      batocera: 'msx1',
      emulationstation: 'msx',
      jelos: 'msx',
      mister: 'MSX1',
      onion: 'MSX',
      retrodeck: 'msx',
      romm: 'msx',
    }),
    new GameConsole(/MSX2/i, ['.mx2'], {
      adam: 'MSX',
      batocera: 'msx2',
      emulationstation: 'msx2',
      jelos: 'msx2',
      mister: 'MSX',
      onion: 'MSX',
      retrodeck: 'msx2',
      romm: 'msx2',
    }),
    new GameConsole(/MSX2+/i, [], {
      adam: 'MSX',
      batocera: 'msx2+',
      emulationstation: 'msx2',
      mister: 'MSX',
      onion: 'MSX',
      retrodeck: 'msx2',
      romm: 'msx2',
    }),
    new GameConsole(/MSX TurboR/i, [], {
      adam: 'MSX',
      batocera: 'msxturbor',
      emulationstation: 'msx',
      mister: 'MSX',
      onion: 'MSX',
      retrodeck: 'msxturbor',
      romm: 'msx',
    }),
    new GameConsole(
      /Xbox/i,
      [
        /* '.iso' */
      ],
      {
        batocera: 'xbox',
        emulationstation: 'xbox',
        jelos: 'xbox',
        retrodeck: 'xbox',
        romm: 'xbox',
      },
    ),
    new GameConsole(
      /Xbox 360/i,
      [
        /* '.iso' */
      ],
      {
        batocera: 'xbox360',
        emulationstation: 'xbox360',
        romm: 'xbox360',
      },
    ),
    // Mobile
    new GameConsole(/J2ME/i, ['.jar'], {
      emulationstation: 'j2me',
      retrodeck: 'j2me',
    }),
    new GameConsole(/Palm OS/i, ['.pqa', '.prc'], {
      emulationstation: 'palm',
      retrodeck: 'palm',
      romm: 'palm-os',
    }),
    new GameConsole(/Symbian/i, ['.sis', '.sisx', '.symbian'], {
      emulationstation: 'symbian',
      retrodeck: 'symbian',
    }),
    // Nichibutsu
    new GameConsole(
      /My Vision/i,
      [
        /* unknown */
      ],
      {
        mister: 'MyVision',
      },
    ),
    // NEC
    new GameConsole(/PC Engine|TurboGrafx/i, ['.pce'], {
      adam: 'PCE',
      batocera: 'pcengine',
      emulationstation: 'pcengine',
      funkeyos: 'PCE-TurboGrafx',
      jelos: 'tg16',
      minui: 'TurboGrafx-16 (PCE)',
      mister: 'TGFX16',
      miyoocfw: 'PCE',
      onion: 'PCE',
      pocket: 'pce',
      retrodeck: 'pcengine',
      romm: 'turbografx16--1',
      twmenu: 'tg16',
    }),
    new GameConsole(
      /(PC Engine|TurboGrafx) CD/i,
      [
        /* '.bin', '.cue' */
      ],
      {
        adam: 'PCECD',
        batocera: 'pcenginecd',
        emulationstation: 'pcenginecd',
        jelos: 'tg16cd',
        minui: 'TurboGrafx-16 CD (PCE)',
        mister: 'TGFX16-CD',
        miyoocfw: 'PCE',
        onion: 'PCECD',
        pocket: 'pcecd',
        retrodeck: 'pcenginecd',
        romm: 'turbografx-16-slash-pc-engine-cd',
      },
    ),
    new GameConsole(/SuperGrafx/i, ['.sgx'], {
      batocera: 'supergrafx',
      emulationstation: 'supergrafx',
      jelos: 'sgfx',
      mister: 'TGFX16',
      onion: 'SGFX',
      pocket: 'pce',
      retrodeck: 'supergrafx',
      romm: 'supergrafx',
    }),
    new GameConsole(/PC[ -]?88(01)?/i, ['.d88'], {
      batocera: 'pc88',
      emulationstation: 'pc88',
      jelos: 'pc88',
      mister: 'PC8801',
      onion: 'PCEIGHTYEIGHT',
      retrodeck: 'pc88',
      romm: 'pc-8800-series',
    }),
    new GameConsole(/PC-98/i, ['.d98'], {
      batocera: 'pc98',
      emulationstation: 'pc98',
      jelos: 'pc98',
      onion: 'PCNINETYEIGHT',
      retrodeck: 'pc98',
      romm: 'pc-9800-series',
    }),
    new GameConsole(/PC-FX/i, [], {
      emulationstation: 'pcfx',
      onion: 'PCFX',
      retrodeck: 'pcfx',
      romm: 'pc-fx',
    }),
    // nesbox
    new GameConsole(/TIC-80/i, ['.tic'], {
      adam: 'TIC80',
      emulationstation: 'tic80',
      retrodeck: 'tic80',
    }),
    // Nintendo
    new GameConsole(/FDS|(Famicom|Family) Computer Disk System/i, ['.fds'], {
      adam: 'FDS',
      batocera: 'fds',
      emulationstation: 'fds',
      funkeyos: 'NES',
      jelos: 'fds',
      minui: 'Famicom Disk System (FC)',
      mister: 'NES',
      miyoocfw: 'NES',
      onion: 'FDS',
      pocket: 'nes',
      retrodeck: 'fds',
      romm: 'fds',
    }),
    new GameConsole(/Game (and|&) Watch/i, ['.mgw'], {
      adam: 'GW',
      batocera: 'gameandwatch',
      emulationstation: 'gameandwatch',
      jelos: 'gameandwatch',
      mister: 'GameNWatch',
      onion: 'GW',
      retrodeck: 'gameandwatch',
      romm: 'game-and-watch',
    }),
    new GameConsole(/GameCube/i, ['.gcm', '.gcz'], {
      batocera: 'gc',
      emulationstation: 'gc',
      jelos: 'gamecube',
      retrodeck: 'gc',
      romm: 'ngc',
    }),
    new GameConsole(/GB|Game ?Boy/i, ['.gb', '.sgb'], {
      adam: 'GB',
      batocera: 'gb',
      emulationstation: 'gb',
      funkeyos: 'Game Boy',
      jelos: 'gb',
      minui: 'Game Boy (GB)',
      mister: 'Gameboy',
      miyoocfw: 'GB',
      onion: 'GB',
      pocket: 'gb',
      retrodeck: 'gb',
      romm: 'gb',
      twmenu: 'gb',
    }),
    new GameConsole(/GBA|Game ?Boy Advance/i, ['.gba'], {
      adam: 'GBA',
      batocera: 'gba',
      emulationstation: 'gba',
      funkeyos: 'Game Boy Advance',
      jelos: 'gba',
      minui: 'Game Boy Advance (GBA)',
      mister: 'GBA',
      miyoocfw: 'GBA',
      onion: 'GBA',
      pocket: 'gba',
      retrodeck: 'gba',
      romm: 'gba',
      twmenu: 'gba',
    }),
    new GameConsole(/GBC|Game ?Boy Color/i, ['.gbc'], {
      adam: 'GBC',
      batocera: 'gbc',
      emulationstation: 'gbc',
      funkeyos: 'Game Boy Color',
      jelos: 'gbc',
      minui: 'Game Boy Color (GBC)',
      mister: 'Gameboy',
      miyoocfw: 'GB',
      onion: 'GBC',
      pocket: 'gbc',
      retrodeck: 'gbc',
      romm: 'gbc',
      twmenu: 'gb',
    }),
    new GameConsole(/Nintendo 64|N64/i, ['.d64', '.n64', '.v64', '.z64'], {
      batocera: 'n64',
      emulationstation: 'n64',
      jelos: 'n64',
      mister: 'N64',
      retrodeck: 'n64',
      romm: 'n64',
    }),
    new GameConsole(/Nintendo 64DD|N64DD/i, ['.ndd'], {
      batocera: 'n64dd',
      emulationstation: 'n64dd',
      retrodeck: 'n64dd',
      romm: 'nintendo-64dd',
    }),
    new GameConsole(
      /(\W|^)3DS(\W|$)|Nintendo 3DS/i,
      ['.3ds', '.3dsx', '.cci', '.cia', '.cfa', '.cxi'],
      {
        batocera: '3ds',
        emulationstation: 'n3ds',
        jelos: '3ds',
        retrodeck: 'n3ds',
        romm: '3ds',
      },
    ),
    new GameConsole(/(\W|^)NDS(\W|$)|Nintendo DS/i, ['.nds'], {
      batocera: 'nds',
      emulationstation: 'nds',
      jelos: 'nds',
      onion: 'NDS',
      retrodeck: 'nds',
      romm: 'nds',
      twmenu: 'nds',
    }),
    new GameConsole(/(\W|^)NDSi(\W|$)|Nintendo DSi([Ww]are)?/i, ['.dsi'], {
      emulationstation: 'nds',
      retrodeck: 'nds',
      romm: 'nintendo-dsi',
      twmenu: 'dsiware',
    }), // try to map DSiWare
    new GameConsole(
      /(\W|^)NES(\W|$)|Famicom|Nintendo Entertainment System/i,
      ['.fc', '.nes', '.nez'],
      {
        adam: 'FC',
        batocera: 'nes',
        emulationstation: 'nes',
        funkeyos: 'NES',
        jelos: 'nes',
        minui: 'Nintendo Entertainment System (FC)',
        mister: 'NES',
        miyoocfw: 'NES',
        onion: 'FC',
        pocket: 'nes',
        retrodeck: 'nes',
        romm: 'nes',
        twmenu: 'nes',
      },
    ),
    new GameConsole(/Pokemon Mini/i, ['.min'], {
      adam: 'POKEMINI',
      batocera: 'pokemini',
      emulationstation: 'pokemini',
      funkeyos: 'Pokemini',
      jelos: 'pokemini',
      minui: 'Pokemon mini (PKM)', // uses unrendedable unicode char in original install
      mister: 'PokemonMini',
      miyoocfw: 'POKEMINI',
      onion: 'POKE',
      pocket: 'poke_mini',
      retrodeck: 'pokemini',
      romm: 'pokemon-mini',
    }),
    new GameConsole(/Satellaview/i, ['.bs'], {
      batocera: 'satellaview',
      emulationstation: 'satellaview',
      jelos: 'satellaview',
      mister: 'SNES',
      onion: 'SATELLAVIEW',
      pocket: 'snes',
      retrodeck: 'satellaview',
      romm: 'satellaview',
    }),
    new GameConsole(/Sufami/i, [], {
      batocera: 'sufami',
      emulationstation: 'sufami',
      jelos: 'sufami',
      onion: 'SUFAMI',
      retrodeck: 'sufami',
    }),
    new GameConsole(
      /(\W|^)SNES(\W|$)|Super (Nintendo Entertainment System|Famicom)/i,
      ['.fig', '.sfc', '.smc', '.snes'],
      {
        adam: 'SFC',
        batocera: 'snes',
        emulationstation: 'snes',
        funkeyos: 'SNES',
        jelos: 'snes',
        minui: 'Super Nintendo Entertainment System (SFC)',
        mister: 'SNES',
        miyoocfw: 'SNES',
        onion: 'SFC',
        pocket: 'snes',
        retrodeck: 'snes',
        romm: 'snes',
        twmenu: 'snes',
      },
    ),
    new GameConsole(/Switch/i, ['.nca', '.nro', '.nso', '.nsp', '.nsz', '.xci', '.xcz', '.zca'], {
      emulationstation: 'switch',
      retrodeck: 'switch',
      romm: 'switch',
    }),
    new GameConsole(/Virtual Boy/i, ['.vb', '.vboy'], {
      adam: 'VB',
      batocera: 'virtualboy',
      emulationstation: 'virtualboy',
      funkeyos: 'Virtualboy',
      jelos: 'virtualboy',
      minui: 'Virtual Boy (VB)',
      onion: 'VB',
      retrodeck: 'virtualboy',
      romm: 'virtualboy',
    }),
    new GameConsole(
      /Wii/i,
      [
        /* '.iso' */
      ],
      {
        batocera: 'wii',
        emulationstation: 'wii',
        jelos: 'wii',
        retrodeck: 'wii',
        romm: 'wii',
      },
    ),
    new GameConsole(/Wii ?U/i, ['.rpx', '.wua', '.wud', '.wup', '.wux'], {
      batocera: 'wiiu',
      emulationstation: 'wiiu',
      jelos: 'wiiu',
      retrodeck: 'wiiu',
      romm: 'wiiu',
    }),
    // Panasonic
    new GameConsole(
      /3DO/i,
      [
        /* '.bin', '.cue' */
      ],
      {
        batocera: '3do',
        emulationstation: '3do',
        jelos: '3do',
        onion: 'PANASONIC',
        retrodeck: '3do',
        romm: '3do',
      },
    ),
    // Philips
    new GameConsole(
      /CD[ -]?i/i,
      [
        /* '.bin', '.cue' */
      ],
      {
        batocera: 'cdi',
        emulationstation: 'cdimono1',
        retrodeck: 'cdimono1',
      },
    ),
    new GameConsole(
      /Videopac/i,
      [
        /* '.bin' */
      ],
      {
        batocera: 'videopacplus',
        emulationstation: 'videopac',
        jelos: 'videopac',
        mister: 'Odyssey2',
        onion: 'VIDEOPAC',
        retrodeck: 'videopac',
        romm: 'odyssey-2-slash-videopac-g7000',
      },
    ),
    // RCA
    new GameConsole(
      /Studio (2|II)/i,
      [
        /* '.bin' */
      ],
      {
        pocket: 'studio2',
      },
    ),
    // Sega
    new GameConsole(/32X/i, ['.32x'], {
      adam: '32X',
      batocera: 'sega32x',
      emulationstation: 'sega32x',
      jelos: 'sega32x',
      minui: 'Sega 32X (MD)', // added for sorting convenience
      mister: 'S32X',
      onion: 'THIRTYTWOX',
      retrodeck: 'sega32x',
      romm: 'sega32',
    }),
    new GameConsole(
      /Dreamcast/i,
      [
        /* '.bin', '.cue' */
      ],
      {
        batocera: 'dreamcast',
        emulationstation: 'dreamcast',
        jelos: 'dreamcast',
        retrodeck: 'dreamcast',
        romm: 'dc',
      },
    ),
    new GameConsole(/Game Gear/i, ['.gg'], {
      adam: 'GG',
      batocera: 'gamegear',
      emulationstation: 'gamegear',
      funkeyos: 'Game Gear',
      jelos: 'gamegear',
      minui: 'Sega Game Gear (GG)',
      mister: 'SMS',
      miyoocfw: 'SMS',
      onion: 'GG',
      pocket: 'gg',
      retrodeck: 'gamegear',
      romm: 'gamegear',
      twmenu: 'gg',
    }),
    new GameConsole(/Master System/i, ['.sms'], {
      adam: 'SMS',
      batocera: 'mastersystem',
      emulationstation: 'mastersystem',
      funkeyos: 'Sega Master System',
      jelos: 'mastersystem',
      minui: 'Sega Master System (SMS)',
      mister: 'SMS',
      miyoocfw: 'SMS',
      onion: 'MS',
      pocket: 'sms',
      retrodeck: 'mastersystem',
      romm: 'sms',
      twmenu: 'sms',
    }),
    new GameConsole(
      /(Mega|Sega) CD/i,
      [
        /* '.bin', '.cue' */
      ],
      {
        adam: 'SEGACD',
        batocera: 'segacd',
        emulationstation: 'segacd',
        jelos: 'segacd',
        minui: 'Sega CD (MD)', // added for sorting convenience
        mister: 'MegaCD',
        miyoocfw: 'SMD',
        onion: 'SEGACD',
        retrodeck: 'segacd',
        romm: 'segacd',
      },
    ),
    new GameConsole(/Mega Drive|Genesis/i, ['.gen', '.md', '.mdx', '.sgd', '.smd'], {
      adam: 'MD',
      batocera: 'megadrive',
      emulationstation: 'megadrive',
      funkeyos: 'Sega Genesis',
      jelos: 'genesis',
      minui: 'Sega Genesis (MD)',
      mister: 'Genesis',
      miyoocfw: 'SMD',
      onion: 'MD',
      pocket: 'genesis',
      retrodeck: 'megadrive',
      romm: 'genesis-slash-megadrive',
      twmenu: 'gen',
    }),
    new GameConsole(
      /Saturn/i,
      [
        /* '.bin', '.cue' */
      ],
      {
        batocera: 'saturn',
        emulationstation: 'saturn',
        jelos: 'saturn',
        retrodeck: 'saturn',
        romm: 'saturn',
      },
    ),
    new GameConsole(/SG[ -]?1000/i, ['.sc', '.sg'], {
      adam: 'SG1000',
      batocera: 'sg1000',
      emulationstation: 'sg-1000',
      jelos: 'sg-1000',
      mister: 'SG1000',
      onion: 'SEGASGONE',
      pocket: 'sg1000',
      retrodeck: 'sg-1000',
      romm: 'sg1000',
      twmenu: 'sg',
    }),
    // Sharp
    new GameConsole(/MZ/i, [], {
      mister: 'SharpMZ',
      romm: 'sharp-mz-2200',
    }),
    new GameConsole(/X1/i, ['.2d', '.2hd', '.dx1', '.tfd'], {
      batocera: 'x1',
      emulationstation: 'x1',
      jelos: 'x1',
      onion: 'XONE',
      retrodeck: 'x1',
      romm: 'x1',
    }),
    new GameConsole(/X68000/i, [], {
      batocera: 'x68000',
      emulationstation: 'x68000',
      jelos: 'x68000',
      mister: 'X68000',
      onion: 'X68000',
      retrodeck: 'x68000',
      romm: 'sharp-x68000',
    }),
    // Sinclair
    new GameConsole(/ZX[ -]?80/i, [], {
      emulationstation: 'zx81',
      mister: 'ZX81',
      onion: 'ZXEIGHTYONE',
      retrodeck: 'zx81',
      romm: 'sinclair-zx81',
    }),
    new GameConsole(/ZX[ -]?81/i, [], {
      batocera: 'zx81',
      emulationstation: 'zx81',
      jelos: 'zx81',
      mister: 'ZX81',
      retrodeck: 'zx81',
      romm: 'sinclair-zx81',
    }),
    new GameConsole(/ZX[ -]?Spectrum/i, ['.scl', '.szx', '.z80'], {
      adam: 'ZX',
      batocera: 'zxspectrum',
      emulationstation: 'zxspectrum',
      jelos: 'zxspectrum',
      mister: 'Spectrum',
      onion: 'ZXS',
      retrodeck: 'zxspectrum',
      romm: 'zxs',
    }),
    // SNK
    new GameConsole(/Neo ?Geo/i, [], {
      adam: 'NEOGEO',
      batocera: 'neogeo',
      emulationstation: 'neogeo',
      jelos: 'neogeo',
      mister: 'NeoGeo', // AES & MVS
      miyoocfw: 'NEOGEO',
      onion: 'NEOGEO',
      pocket: 'ng',
      retrodeck: 'neogeo',
      romm: 'neogeomvs',
    }),
    new GameConsole(
      /Neo ?Geo CD/i,
      [
        /* '.bin', '.cue' */
      ],
      {
        batocera: 'neogeocd',
        emulationstation: 'neogeocd',
        jelos: 'neocd',
        onion: 'NEOCD',
        retrodeck: 'neogeocd',
        romm: 'neo-geo-cd',
      },
    ),
    new GameConsole(/Neo ?Geo Pocket/i, ['.ngp'], {
      adam: 'NGP',
      batocera: 'ngp',
      emulationstation: 'ngp',
      funkeyos: 'Neo Geo Pocket',
      jelos: 'ngp',
      minui: 'Neo Geo Pocket (NGPC)', // added for sorting convenience
      onion: 'NGP',
      retrodeck: 'ngp',
      romm: 'neo-geo-pocket',
      twmenu: 'ngp',
    }),
    new GameConsole(/Neo ?Geo Pocket Color/i, ['.ngc', '.ngpc', '.npc'], {
      adam: 'NGP',
      batocera: 'ngpc',
      emulationstation: 'ngpc',
      funkeyos: 'Neo Geo Pocket',
      jelos: 'ngpc',
      minui: 'Neo Geo Pocket Color (NGPC)', // added for sorting convenience
      onion: 'NGP',
      retrodeck: 'ngpc',
      romm: 'neo-geo-pocket-color',
      twmenu: 'ngp',
    }),
    // Sony
    new GameConsole(/PlayStation|psx/i, ['.minipsf', '.pbp', '.psexe', '.psf'], {
      adam: 'PS',
      batocera: 'psx',
      emulationstation: 'psx',
      funkeyos: 'PS1',
      jelos: 'psx',
      minui: 'Sony PlayStation (PS)',
      mister: 'PSX',
      miyoocfw: 'PS1',
      onion: 'PS',
      retrodeck: 'psx',
      romm: 'ps',
    }),
    new GameConsole(
      /PlayStation 2|ps2/i,
      [
        /* '.bin', '.cue' */
      ],
      {
        batocera: 'ps2',
        emulationstation: 'ps2',
        jelos: 'ps2',
        retrodeck: 'ps2',
        romm: 'ps2',
      },
    ),
    new GameConsole(/PlayStation 3|ps3/i, ['.ps3', '.ps3dir'], {
      batocera: 'ps3',
      emulationstation: 'ps3',
      jelos: 'ps3',
      retrodeck: 'ps3',
      romm: 'ps3',
    }),
    new GameConsole(/PlayStation ?Portable|psp/i, ['.cso'], {
      batocera: 'psp',
      emulationstation: 'psp',
      jelos: 'psp',
      retrodeck: 'psp',
      romm: 'psp',
    }),
    new GameConsole(/PlayStation ?Vita|psvita/i, ['.psvita'], {
      batocera: 'psvita',
      emulationstation: 'psvita',
      retrodeck: 'psvita',
      romm: 'psvita',
    }),
    new GameConsole(
      /PlayStation [4-9]|ps[4-9]/i,
      [
        /* '.bin' */
      ],
      {},
    ),
    // Sord
    new GameConsole(
      /Sord[ -]M(5|five)/i,
      [
        /* '.bin', '.cas' */
      ],
      {
        twmenu: 'm5',
      },
    ),
    // Texas Instruments
    new GameConsole(/TI[ -]?99[ -]?4A/i, ['.rpk'], {
      emulationstation: 'ti99',
      mister: 'TI-99_4A',
      retrodeck: 'ti99',
      romm: 'ti-99',
    }),
    // Tiger
    new GameConsole(/Game.?com/i, ['.tgc'], {
      emulationstation: 'gamecom',
      retrodeck: 'gamecom',
      romm: 'game-dot-com',
    }),
    // Timetop
    new GameConsole(
      /GameKing/i,
      [
        /* '.bin' */
      ],
      {
        pocket: 'game_king',
      },
    ),
    // VTech
    new GameConsole(
      /CreatiVision/i,
      [
        /* '.rom' */
      ],
      {
        batocera: 'crvision',
        emulationstation: 'crvision',
        mister: 'CreatiVision',
        pocket: 'creativision',
        retrodeck: 'crvision',
      },
    ),
    new GameConsole(
      /V\.Smile/i,
      [
        /* '.bin' */
      ],
      {
        batocera: 'vsmile',
        emulationstation: 'vsmile',
        retrodeck: 'vsmile',
        romm: 'vsmile',
      },
    ),
    // Watara
    new GameConsole(/Supervision/i, ['.sv'], {
      adam: 'SUPERVISION',
      batocera: 'supervision',
      emulationstation: 'supervision',
      jelos: 'supervision',
      mister: 'SuperVision',
      onion: 'SUPERVISION',
      pocket: 'supervision',
      retrodeck: 'supervision',
      romm: 'watara-slash-quickshot-supervision',
    }),
    // Wellback
    new GameConsole(/Mega Duck/i, ['.md1', '.md2'], {
      batocera: 'megaduck',
      emulationstation: 'megaduck',
      jelos: 'megaduck',
      onion: 'MEGADUCK',
      pocket: 'mega_duck',
      retrodeck: 'megaduck',
      romm: 'mega-duck-slash-cougar-boy',
    }),
  ];

  readonly datRegex: RegExp;

  readonly extensions: string[];

  readonly outputTokens: OutputTokens;

  constructor(datRegex: RegExp, extensions: string[], outputTokens: OutputTokens) {
    this.datRegex = datRegex;
    this.extensions = extensions;
    this.outputTokens = outputTokens;
  }

  static getForFilename(filePath: string): GameConsole | undefined {
    const fileExtension = path.extname(filePath).toLowerCase();
    return this.CONSOLES.find((console) => console.getExtensions().includes(fileExtension));
  }

  static getForDatName(consoleName: string): GameConsole | undefined {
    return this.CONSOLES.slice()
      .reverse() // more specific names come second (e.g. "Game Boy" and "Game Boy Color")
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

  getEmulationStation(): string | undefined {
    return this.outputTokens.emulationstation;
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

  getRomM(): string | undefined {
    return this.outputTokens.romm;
  }

  getTWMenu(): string | undefined {
    return this.outputTokens.twmenu;
  }
}
