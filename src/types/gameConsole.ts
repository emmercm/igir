import path from 'node:path';

interface OutputTokens {

  // Adam image has it's roms in the /ROMS/{adam} subdirectory
  // @see https://github.com/eduardofilo/RG350_adam_image/wiki/En:-3.-Content-installation#roms
  adam?: string,

  // Batocera ROMs go in the roms/{batocera} directory:
  // @see https://wiki.batocera.org/systems
  batocera?: string,

  // Canonicalized console name
  console?: string,

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
   */
  private static readonly CONSOLES: GameConsole[] = [
    // Acorn
    new GameConsole(/Atom/i, [], {
      batocera: 'atom',
      console: 'Acorn Atom',
      mister: 'AcornAtom',
    }),
    // Amstrad
    new GameConsole(/CPC/i, [], {
      adam: 'AMSTRAD',
      batocera: 'amstradcpc',
      console: 'Amstrad CPC',
      jelos: 'amstradcpc',
      mister: 'Amstrad',
      onion: 'CPC',
      twmenu: 'cpc',
    }),
    new GameConsole(/PCW/i, [], {
      console: 'Amstrad PCW',
      mister: 'AmstradPCW',
    }),
    // ACT
    new GameConsole(/Apricot/i, [/* '.dsk' */], {
      console: 'ACT Apricot PC Xi',
    }),
    // APF
    new GameConsole(/Imagination Machine/i, [/* '.wav' */], {
      console: 'APF Imagination Machine',
    }),
    new GameConsole(/MP-?1000/i, [/* '.bin' */], {
      console: 'APF MP-1000',
    }),
    // Apple
    new GameConsole(/Apple.*I/i, [], {
      console: 'Apple I',
      mister: 'Apple-I',
    }),
    new GameConsole(/Apple.*IIe?/i, [], {
      batocera: 'apple2',
      console: 'Apple II',
      mister: 'Apple-II',
    }),
    // Arduboy
    new GameConsole(/Arduboy/i, ['.arduboy', '.hex'], {
      batocera: 'arduboy',
      console: 'Arduboy - Arduboy',
      jelos: 'arduboy',
      mister: 'Arduboy',
      pocket: 'arduboy',
    }),
    // Atari
    new GameConsole(/(a(tari)?|^|\s)800(\s|$)|8-?b(it)? Family/i, ['.atr', '.atx'], {
      batocera: 'atari800',
      console: 'Atari 800',
      jelos: 'atari800',
      mister: 'ATARI800',
      onion: 'EIGHTHUNDRED',
    }),
    new GameConsole(/2600/, ['.a26', '.act', '.pb', '.tv', '.tvr', '.mn', '.cv', '.eb', '.ef', '.efr', '.ua', '.x07', '.sb'], {
      adam: 'A2600',
      batocera: 'atari2600',
      console: 'Atari 2600',
      jelos: 'atari2600',
      mister: 'Atari2600',
      miyoocfw: '2600',
      onion: 'ATARI',
      pocket: '2600',
      twmenu: 'a26',
    }),
    new GameConsole(/5200/, ['.a52'], {
      adam: 'A5200',
      batocera: 'atari5200',
      console: 'Atari 5200',
      jelos: 'atari5200',
      mister: 'Atari5200',
      onion: 'FIFTYTWOHUNDRED',
      twmenu: 'a52',
    }),
    new GameConsole(/7800/, ['.a78'], {
      adam: 'A7800',
      batocera: 'atari7800',
      console: 'Atari 7800',
      jelos: 'atari7800',
      mister: 'Atari7800',
      onion: 'SEVENTYEIGHTHUNDRED',
      pocket: '7800',
      twmenu: 'a78',
    }),
    new GameConsole(/Jaguar/i, ['.j64'], {
      batocera: 'jaguar',
      console: 'Atari Jaguar',
      jelos: 'atarijaguar',
      onion: 'JAGUAR',
    }),
    new GameConsole(/Jaguar ?CD( Interactive( Entertainment System)?)?/i, [/* '.bin', '.cue' */], {
      console: 'Atari Jaguar CD Interactive Entertainment System',
    }),
    new GameConsole(/Lynx/i, ['.lnx', '.lyx'], {
      adam: 'LYNX',
      batocera: 'lynx',
      console: 'Atari Lynx',
      funkeyos: 'Atari lynx',
      jelos: 'atarilynx',
      mister: 'AtariLynx',
      miyoocfw: 'LYNX',
      onion: 'LYNX',
    }),
    new GameConsole(/Atari.*ST/i, ['.msa', '.st', '.stx'], {
      batocera: 'atarist',
      console: 'Atari ST',
      jelos: 'atarist',
      mister: 'AtariST',
      onion: 'ATARIST',
    }),
    // Bally
    new GameConsole(/Astrocade/i, [/* '.bin' */], {
      batocera: 'astrocde',
      console: 'Bally Astrocade',
      mister: 'Astrocade',
    }),
    // Bandai
    new GameConsole(/Super ?Vision 8000/i, [], {
      console: 'Bandai Super Vision 8000',
      mister: 'Supervision8000',
    }),
    new GameConsole(/RX[ -]?78/i, [], {
      console: 'Bandai RX-78',
      mister: 'RX78',
    }),
    new GameConsole(/WonderSwan/i, ['.ws'], {
      adam: 'WSC',
      batocera: 'wswan',
      console: 'Bandai WonderSwan',
      funkeyos: 'WonderSwan',
      jelos: 'wonderswan',
      mister: 'WonderSwan',
      miyoocfw: 'WSWAN',
      onion: 'WS',
      pocket: 'wonderswan',
      twmenu: 'ws',
    }),
    new GameConsole(/WonderSwan Color/i, ['.wsc'], {
      adam: 'WSC',
      batocera: 'wswanc',
      console: 'Bandai WonderSwan Color',
      funkeyos: 'WonderSwan',
      jelos: 'wonderswancolor',
      mister: 'WonderSwan',
      miyoocfw: 'WSWAN', // TODO: check if this works
      onion: 'WS',
      pocket: 'wonderswan',
      twmenu: 'ws',
    }),
    // Benesse
    new GameConsole(/Pocket Challenge (V?2|II)/i, ['.pc2'], {
      console: 'Benesse Pocket Challenge V2',
    }),
    new GameConsole(/Pocket Challenge W/i, ['.pcw'], {
      console: 'Benesse Pocket Challenge W',
    }),
    // Bit Corporation
    new GameConsole(/Gamate/i, [/* '.bin' */], {
      batocera: 'gamate',
      console: 'Bit Corporation Gamate',
      mister: 'Gamate',
      pocket: 'gamate',
    }),
    // Capcom
    // TODO(cemmer): CPS1, CPS2, CPS3
    // Casio
    new GameConsole(/PV[ -]?1000/i, [/* '.bin' */], {
      batocera: 'pv1000',
      console: 'Casio PV-1000',
      mister: 'Casio_PV-1000',
    }),
    new GameConsole(/Loopy/i, [/* '.bin' */], {
      console: 'Casio Loopy',
    }),
    new GameConsole(/PV[ -]?2000/i, [/* '.bin' */], {
      console: 'Casio PV-2000',
      mister: 'Casio_PV-2000',
    }),
    // Commodore
    new GameConsole(/Amiga/i, [], {
      adam: 'AMIGA',
      console: 'Commodore Amiga',
      jelos: 'amiga',
      mister: 'Amiga',
      onion: 'AMIGA',
      pocket: 'amiga',
    }),
    new GameConsole(/(Amiga )?CD32/i, [/* '.bin', '.cue' */], {
      adam: 'AMIGA',
      batocera: 'amigacd32',
      console: 'Commorore Amiga CD32',
      jelos: 'amigacd32',
      mister: 'Amiga',
    }),
    new GameConsole(/(Amiga )?CDTV/i, [/* '.bin', '.cue' */], {
      adam: 'AMIGA',
      batocera: 'amigacdtv',
      console: 'Commodore Amiga CDTV',
    }),
    new GameConsole(/Commodore Vic-?20/i, [/* '.bin' */], {
      console: 'Commodore Vic-20',
    }),
    new GameConsole(/Commodore (Plus|\+)-?4/i, [/* '.bin' */], {
      console: 'Commodore Plus-4',
    }),
    new GameConsole(/Commodore C?16/i, [/* unknown */], {
      jelos: 'c16',
      console: 'Commodore C16',
      mister: 'C16',
    }),
    new GameConsole(/Commodore C?64/i, ['.crt', '.d64', '.t64'], {
      adam: 'C64',
      batocera: 'c64',
      console: 'Commodore C64',
      jelos: 'c64',
      mister: 'C64',
      onion: 'COMMODORE',
    }),
    new GameConsole(/Commodore C?128/i, [/* unknown */], {
      batocera: 'c128',
      console: 'Commodore C128',
      jelos: 'c128',
      mister: 'C128',
    }),
    // Coleco
    new GameConsole(/ColecoVision/i, ['.col'], {
      adam: 'COLECO',
      batocera: 'colecovision',
      console: 'Coleco ColecoVision',
      jelos: 'coleco',
      mister: 'Coleco',
      onion: 'COLECO',
      pocket: 'coleco',
      twmenu: 'col',
    }),
    // Emerson
    new GameConsole(/Arcadia/i, [/* '.bin' */], {
      batocera: 'arcadia',
      console: 'Emerson Arcadia',
      mister: 'Arcadia',
      pocket: 'arcadia',
    }),
    // Entex
    new GameConsole(/Adventure Vision/i, [/* '.bin' */], {
      batocera: 'advision',
      console: 'Entex Adventure Vision',
      mister: 'AVision',
      pocket: 'avision',
    }),
    // Epoch
    new GameConsole(/Super Cassette Vision/i, [/* '.bin' */], {
      console: 'Epoch Super Cassette Vision',
      batocera: 'scv',
    }),
    // Fairchild
    new GameConsole(/Channel F/i, [/* '.bin' */], {
      batocera: 'channelf',
      console: 'Fairchild Channel F',
      jelos: 'channelf',
      mister: 'ChannelF',
      onion: 'FAIRCHILD',
      pocket: 'channel_f',
    }),
    // Funtech
    new GameConsole(/Super A'?Can/i, [/* '.bin' */], {
      console: 'Funtech Super A-Can',
      batocera: 'supracan',
    }),
    // Fukutake Publishing
    new GameConsole(/StudyBox/i, ['.study'], {
      console: 'Fukutake Publishing StudyBox',
    }),
    // GCE
    new GameConsole(/Vectrex/i, ['.vec'], {
      batocera: 'vectrex',
      console: 'GCE Vectrex',
      jelos: 'vectrex',
      mister: 'Vectrex',
      miyoocfw: 'VECTREX',
      onion: 'VECTREX',
    }),
    // Game Park
    new GameConsole(/GP ?32/i, [/* '.bin' */], {
      console: 'Game Park GP32',
    }),
    new GameConsole(/GP ?2X/i, [/* '.bin' */], {
      console: 'Game Park GP2X',
    }),
    new GameConsole(/GP ?2X Wiz/i, [/* '.bin' */], {
      console: 'Game Park Holdings GP2X Wiz',
    }),
    // Hartung
    new GameConsole(/Game ?Master/i, [], {
      console: 'Hartung Game Master',
    }),
    // Interton
    new GameConsole(/VC ?4000/i, [/* '.bin' */], {
      batocera: 'vc4000',
      console: 'Interton VC 4000',
      mister: 'VC4000',
    }),
    // iQue
    new GameConsole(/iQue/i, [], {
      console: 'iQue iQue',
    }),
    // Konami
    new GameConsole(/Picno/i, [/* '.bin' */], {
      console: 'Konami Picno',
    }),
    // LeapFrog
    new GameConsole(/Leapster( Learning Game System|LGS)?/i, [], {
      console: 'LeapFrog Leapster Learning Game System',
    }),
    new GameConsole(/LeapPad/i, [/* '.bin' */], {
      console: 'LeapFrog LeapPad',
    }),
    // Lexaloffle
    new GameConsole(/Pico[- ]?8/i, ['.png', '.p8'], {
      adam: 'PICO8',
      batocera: 'pico',
      console: 'Lexaloffle Pico-8',
      jelos: 'pico-8',
      minui: 'Pico-8 (P8)',
      onion: 'PICO',
    }),
    // Magnavox / Philips
    new GameConsole(/(Odyssey ?2|Videopac)/i, [/* '.bin' */], {
      batocera: 'o2em',
      console: 'Magnavox Odyssey 2',
      jelos: 'odyssey',
      mister: 'Odyssey2',
      onion: 'ODYSSEY',
      pocket: 'odyssey2',
    }),
    // Mattel
    new GameConsole(/Intellivision/i, ['.int'], {
      adam: 'INTELLI',
      batocera: 'intellivision',
      console: 'Mattel Intellivision',
      jelos: 'intellivision',
      mister: 'Intellivision',
      onion: 'INTELLIVISION',
      pocket: 'intv',
    }),
    // Microsoft
    new GameConsole(/MSX/i, [], {
      adam: 'MSX',
      batocera: 'msx1',
      console: 'Microsoft MSX',
      jelos: 'msx',
      mister: 'MSX',
      onion: 'MSX',
    }),
    new GameConsole(/MSX2/i, [], {
      adam: 'MSX',
      batocera: 'msx2',
      console: 'Microsoft MSX2',
      jelos: 'msx2',
      mister: 'MSX',
      onion: 'MSX',
    }),
    new GameConsole(/MSX2+/i, [], {
      adam: 'MSX',
      batocera: 'msx2+',
      console: 'Microsoft MSX2+',
      mister: 'MSX',
      onion: 'MSX',
    }),
    new GameConsole(/MSX TurboR/i, [], {
      adam: 'MSX',
      batocera: 'msxturbor',
      console: 'Microsoft MSX TurboR',
      mister: 'MSX',
      onion: 'MSX',
    }),
    new GameConsole(/Xbox/i, [/* '.iso' */], {
      batocera: 'xbox',
      console: 'Microsoft XBox',
      jelos: 'xbox',
    }),
    new GameConsole(/Xbox 360/i, [/* '.iso' */], {
      batocera: 'xbox360',
      console: 'Microsoft XBox 360',
    }),
    // Nichibutsu
    new GameConsole(/My Vision/i, [], {
      console: 'Nichibutsu My Vision',
      mister: 'MyVision',
    }),
    // NEC
    new GameConsole(/PC Engine|TurboGrafx/i, ['.pce'], {
      adam: 'PCE',
      batocera: 'pcengine',
      console: 'NEC PC Engine',
      funkeyos: 'PCE-TurboGrafx',
      jelos: 'tg16',
      minui: 'TurboGrafx-16 (PCE)',
      mister: 'TGFX16',
      miyoocfw: 'PCE',
      onion: 'PCE',
      pocket: 'pce',
      twmenu: 'tg16',
    }),
    new GameConsole(/(PC Engine|TurboGrafx) CD/i, [/* '.bin', '.cue' */], {
      adam: 'PCECD',
      batocera: 'pcenginecd',
      console: 'NEC PC Engine CD',
      jelos: 'tg16cd',
      minui: 'TurboGrafx-16 CD (PCE)',
      mister: 'TGFX16',
      miyoocfw: 'PCE',
      onion: 'PCECD',
      pocket: 'pcecd',
    }),
    new GameConsole(/SuperGrafx/i, ['.sgx'], {
      batocera: 'supergrafx',
      console: 'NEC SuberGrafx',
      jelos: 'sgfx',
      mister: 'TGFX16',
      onion: 'SGFX',
      pocket: 'pce',
    }),
    new GameConsole(/PC-88/i, ['.d88'], {
      batocera: 'pc88',
      console: 'NEC PC-88',
      jelos: 'pc88',
      mister: 'PC8801',
      onion: 'PCEIGHTYEIGHT',
    }),
    new GameConsole(/PC-98/i, ['.d98'], {
      batocera: 'pc98',
      console: 'NEC PC-98',
      jelos: 'pc98',
      onion: 'PCNINETYEIGHT',
    }),
    new GameConsole(/PC-FX/i, [/* '.bin', '.cue' */], {
      batocera: 'pcfx',
      console: 'NEC PC-FX',
      jelos: 'pcfx',
      onion: 'PCFX',
    }),
    // nesbox
    new GameConsole(/TIC-80/i, ['.tic'], {
      adam: 'TIC80',
      batocera: 'tic80',
      console: 'Nexbox TIC-80',
      onion: 'TIC',
    }),
    // Nintendo
    new GameConsole(/e-?Reader/i, [/* '.raw' */], {
      console: 'Nintendo e-Reader',
    }),
    new GameConsole(/Family BASIC/i, [/* '.wav' */], {
      console: 'Nintendo Family BASIC',
    }),
    new GameConsole(/FNS|Famicom Computer Network System/i, ['.fns'], {
      console: 'Nintendo Family Computer Network System',
    }),
    new GameConsole(/FDS|Famicom Computer Disk System/i, ['.fds'], {
      adam: 'FDS',
      batocera: 'fds',
      console: 'Nintendo Famicom Computer Disk System',
      funkeyos: 'NES',
      jelos: 'fds',
      minui: 'Famicom Disk System (FC)',
      mister: 'NES',
      miyoocfw: 'NES',
      onion: 'FDS',
      pocket: 'nes',
    }),
    new GameConsole(/Game (and|&) Watch/i, ['.mgw'], {
      adam: 'GW',
      batocera: 'gameandwatch',
      console: 'Nintendo Game and Watch',
      jelos: 'gameandwatch',
      mister: 'GameNWatch',
      onion: 'GW',
    }),
    new GameConsole(/GameCube/i, [/* '.iso' */], {
      batocera: 'gamecube',
      console: 'Nintendo GameCube',
      jelos: 'gamecube',
    }),
    new GameConsole(/GB|Game ?Boy/i, ['.gb', '.sgb'], {
      adam: 'GB',
      batocera: 'gb',
      console: 'Nintendo GameBoy',
      funkeyos: 'Game Boy',
      jelos: 'gb',
      minui: 'Game Boy (GB)',
      mister: 'Gameboy',
      miyoocfw: 'GB',
      onion: 'GB',
      pocket: 'gb',
      twmenu: 'gb',
    }), // pocket:sgb for spiritualized1997
    new GameConsole(/GBA|Game ?Boy Advance/i, ['.gba', '.srl'], {
      adam: 'GBA',
      batocera: 'gba',
      console: 'Nintendo GameBoy Advance',
      funkeyos: 'Game Boy Advance',
      jelos: 'gba',
      minui: 'Game Boy Advance (GBA)',
      mister: 'GBA',
      miyoocfw: 'GBA',
      onion: 'GBA',
      pocket: 'gba',
      twmenu: 'gba',
    }),
    new GameConsole(/GBC|Game ?Boy Color/i, ['.gbc'], {
      adam: 'GBC',
      batocera: 'gbc',
      console: 'Nintendo GameBoy Color',
      funkeyos: 'Game Boy Color',
      jelos: 'gbc',
      minui: 'Game Boy Color (GBC)',
      mister: 'Gameboy',
      miyoocfw: 'GB',
      onion: 'GBC',
      pocket: 'gbc',
      twmenu: 'gb',
    }),
    new GameConsole(/Nintendo 64|N64/i, ['.n64', '.v64', '.z64'], {
      batocera: 'n64',
      console: 'Nintendo 64',
      jelos: 'n64',
      mister: 'N64',
    }),
    new GameConsole(/Nintendo 64DD|N64DD/i, ['.ndd'], {
      batocera: 'n64dd',
      console: 'Nintendo 64DD',
    }),
    new GameConsole(/(\W|^)3DS(\W|$)|Nintendo 3DS/i, ['.3ds'], {
      batocera: '3ds',
      console: 'Nintendo 3DS',
      jelos: '3ds',
    }),
    new GameConsole(/(\W|^)NDS(\W|$)|Nintendo DS/i, ['.nds'], {
      batocera: 'nds',
      console: 'Nintendo DS',
      jelos: 'nds',
      twmenu: 'nds',
    }),
    new GameConsole(/(\W|^)NDSi(\W|$)|Nintendo DSi([Ww]are)?/i, [], {
      console: 'Nintendo DSiWare',
      twmenu: 'dsiware',
    }), // try to map DSiWare
    new GameConsole(/(\W|^)NES(\W|$)|Nintendo Entertainment System/i, ['.nes', '.nez'], {
      adam: 'FC',
      batocera: 'nes',
      console: 'Nintendo Entertainment System',
      funkeyos: 'NES',
      jelos: 'nes',
      minui: 'Nintendo Entertainment System (FC)',
      mister: 'NES',
      miyoocfw: 'NES',
      onion: 'FC',
      pocket: 'nes',
      twmenu: 'nes',
    }),
    new GameConsole(/Pokemon Mini/i, ['.min'], {
      adam: 'POKEMINI',
      batocera: 'pokemini',
      console: 'Nintendo Pokemon Mini',
      funkeyos: 'Pokemini',
      jelos: 'pokemini',
      minui: 'Pokemon mini (PKM)', // uses unrendedable unicode char in original install
      mister: 'PokemonMini',
      miyoocfw: 'POKEMINI',
      onion: 'POKE',
      pocket: 'poke_mini',
    }),
    new GameConsole(/Satellaview/i, ['.bs'], {
      batocera: 'satellaview',
      console: 'Nintendo Satellaview',
      jelos: 'satellaview',
      mister: 'SNES',
      onion: 'SATELLAVIEW',
      pocket: 'snes',
    }),
    new GameConsole(/Sufami/i, [], {
      batocera: 'sufami',
      console: 'Nintendo Sufami',
      jelos: 'sufami',
      onion: 'SUFAMI',
    }),
    new GameConsole(/(\W|^)SNES(\W|$)|Super Nintendo Entertainment System/i, ['.sfc', '.smc'], {
      adam: 'SFC',
      batocera: 'snes',
      console: 'Nintendo Super Nintendo Entertainment System',
      funkeyos: 'SNES',
      jelos: 'snes',
      minui: 'Super Nintendo Entertainment System (SFC)',
      mister: 'SNES',
      miyoocfw: 'SNES',
      onion: 'SFC',
      pocket: 'snes',
      twmenu: 'snes',
    }),
    new GameConsole(/Virtual ?Boy/i, ['.vb', '.vboy'], {
      adam: 'VB',
      batocera: 'virtualboy',
      console: 'Nintendo VirtualBoy',
      funkeyos: 'Virtualboy',
      jelos: 'virtualboy',
      minui: 'Virtual Boy (VB)',
      onion: 'VB',
    }),
    new GameConsole(/Wii/i, [/* '.iso' */], {
      batocera: 'wii',
      console: 'Nintendo Wii',
      jelos: 'wii',
    }),
    new GameConsole(/Wii ?U/i, [/* '.iso' */], {
      batocera: 'wiiu',
      console: 'Nintendo Wii U',
      jelos: 'wiiu',
    }),
    // OpenPandora
    new GameConsole(/(\s|^)Pandora/i, ['.pnd'], {
      console: 'OpenPandora Pandora',
    }),
    new GameConsole(/(\s|^)Pyre/i, [], {
      console: 'OpenPandora Pyre',
    }),
    // Panasonic
    new GameConsole(/3DO/i, [/* '.bin', '.cue' */], {
      batocera: '3do',
      console: 'Panasonic 3DO',
      jelos: '3do',
      onion: 'PANASONIC',
    }),
    // Philips
    new GameConsole(/CD[ -]?i/i, [/* '.bin', '.cue' */], {
      batocera: 'cdi',
      console: 'Philips CDi',
    }),
    new GameConsole(/(Videopac\+|G7400)/i, [/* '.bin' */], {
      batocera: 'videopacplus',
      console: 'Philips Videopac+',
      jelos: 'videopac',
      mister: 'Odyssey2',
      onion: 'VIDEOPAC',
    }),
    // RCA
    new GameConsole(/Studio (2|II)/i, [/* '.bin' */], {
      console: 'RCA Studio II',
      pocket: 'studio2',
    }),
    // Sammy
    new GameConsole(/Atomiswave/i, [/* '.bin', '.cue' */], {
      batocera: 'atomiswave',
      console: 'Sammy Atomiswave',
      jelos: 'atomiswave',
    }),
    // Sega
    new GameConsole(/32X/i, ['.32x'], {
      adam: '32X',
      batocera: 'sega32x',
      console: 'Sega 32X',
      jelos: 'sega32x',
      minui: 'Sega 32X (MD)', // added for sorting convenience
      mister: 'S32X',
      onion: 'THIRTYTWOX',
    }),
    new GameConsole(/Dreamcast/i, [/* '.bin', '.cue' */], {
      batocera: 'dreamcast',
      console: 'Sega Dreamcast',
      jelos: 'dreamcast',
    }),
    new GameConsole(/Game Gear/i, ['.gg'], {
      adam: 'GG',
      batocera: 'gamegear',
      console: 'Sega Game Gear',
      funkeyos: 'Game Gear',
      jelos: 'gamegear',
      minui: 'Sega Game Gear (GG)',
      mister: 'SMS',
      miyoocfw: 'SMS',
      onion: 'GG',
      pocket: 'gg',
      twmenu: 'gg',
    }),
    new GameConsole(/Master System/i, ['.sms'], {
      adam: 'SMS',
      batocera: 'mastersystem',
      console: 'Sega Master System',
      funkeyos: 'Sega Master System',
      jelos: 'mastersystem',
      minui: 'Sega Master System (SMS)',
      mister: 'SMS',
      miyoocfw: 'SMS',
      onion: 'MS',
      pocket: 'sms',
      twmenu: 'sms',
    }),
    new GameConsole(/(Mega|Sega) CD/i, [/* '.bin', '.cue' */], {
      adam: 'SEGACD',
      batocera: 'segacd',
      console: 'Sega Mega CD, Sega CD',
      jelos: 'segacd',
      minui: 'Sega CD (MD)', // added for sorting convenience
      mister: 'MegaCD',
      miyoocfw: 'SMD',
      onion: 'SEGACD',
    }),
    new GameConsole(/Mega Drive|Genesis/i, ['.gen', '.md', '.mdx', '.sgd', '.smd'], {
      adam: 'MD',
      batocera: 'megadrive',
      console: 'Sega Megadrive, Genesis',
      funkeyos: 'Sega Genesis',
      jelos: 'genesis',
      minui: 'Sega Genesis (MD)',
      mister: 'Genesis',
      miyoocfw: 'SMD',
      onion: 'MD',
      pocket: 'genesis',
      twmenu: 'gen',
    }),
    new GameConsole(/Naomi/i, [/* '.bin', '.cue' */], {
      batocera: 'naomi',
      console: 'Sega Naomi',
      jelos: 'naomi',
    }),
    new GameConsole(/Naomi ?(2|II)/i, [/* '.bin', '.cue' */], {
      batocera: 'naomi2',
      console: 'Sega Naomi 2',
    }),
    new GameConsole(/Saturn/i, [/* '.bin', '.cue' */], {
      batocera: 'saturn',
      console: 'Sega Saturn',
      jelos: 'saturn',
    }),
    new GameConsole(/SG[ -]?1000/i, ['.sc', '.sg'], {
      adam: 'SG1000',
      batocera: 'sg1000',
      console: 'Sega SG-1000',
      jelos: 'sg-1000',
      mister: 'SG1000',
      onion: 'SEGASGONE',
      pocket: 'sg1000',
      twmenu: 'sg',
    }),
    // Sharp
    new GameConsole(/MZ/i, [], {
      console: 'Sharp MZ',
      mister: 'SharpMZ',
    }),
    new GameConsole(/X1/i, ['.2d', '.2hd', '.dx1', '.tfd'], {
      batocera: 'x1',
      console: 'Sharp X1',
      jelos: 'x1',
      onion: 'XONE',
    }),
    new GameConsole(/X68000/i, [], {
      batocera: 'x68000',
      console: 'Sharp X68000',
      jelos: 'x68000',
      mister: 'X68000',
      onion: 'X68000',
    }),
    // Sinclair
    new GameConsole(/ZX[ -]?80/i, [], {
      console: 'Sinclair ZX80',
      mister: 'ZX81',
    }),
    new GameConsole(/ZX[ -]?81/i, [], {
      batocera: 'zx81',
      console: 'Sinclair ZX81',
      jelos: 'zx81',
      onion: 'ZXEIGHTYONE',
      mister: 'ZX81',
    }),
    new GameConsole(/ZX[ -]?Spectrum/i, ['.scl', '.szx', '.z80'], {
      adam: 'ZX',
      batocera: 'zxspectrum',
      console: 'Sinclair ZX Spectrum',
      jelos: 'zxspectrum',
      mister: 'Spectrum',
      onion: 'ZXS',
    }),
    // SNK
    new GameConsole(/Neo ?Geo/i, [], {
      adam: 'NEOGEO',
      batocera: 'neogeo',
      console: 'SNK Neo Geo',
      jelos: 'neogeo',
      mister: 'NeoGeo',
      miyoocfw: 'NEOGEO',
      onion: 'NEOGEO',
      pocket: 'ng',
    }),
    new GameConsole(/Neo ?Geo CD/i, [/* '.bin', '.cue' */], {
      batocera: 'neogeocd',
      console: 'SNK Neo Geo CD',
      jelos: 'neocd',
      onion: 'NEOCD',
    }),
    new GameConsole(/Neo ?Geo Pocket/i, ['.ngp'], {
      adam: 'NGP',
      batocera: 'ngp',
      console: 'SNK Neo Geo Pocket',
      funkeyos: 'Neo Geo Pocket',
      jelos: 'ngp',
      minui: 'Neo Geo Pocket (NGPC)', // added for sorting convenience
      onion: 'NGP',
      twmenu: 'ngp',
    }),
    new GameConsole(/Neo ?Geo Pocket Color/i, ['.ngc'], {
      adam: 'NGP',
      batocera: 'ngpc',
      console: 'SNK Neo Geo Pocket Color',
      funkeyos: 'Neo Geo Pocket',
      jelos: 'ngpc',
      minui: 'Neo Geo Pocket Color (NGPC)', // added for sorting convenience
      onion: 'NGP',
      twmenu: 'ngp',
    }),
    // Sony
    new GameConsole(/PlayStation|psx/i, [/* '.bin', '.cue' */], {
      adam: 'PS',
      batocera: 'psx',
      console: 'Sony PlayStation',
      funkeyos: 'PS1',
      jelos: 'psx',
      minui: 'Sony PlayStation (PS)',
      mister: 'PSX',
      miyoocfw: 'PS1',
      onion: 'PS',
    }),
    new GameConsole(/PlayStation 2|ps2/i, [/* '.bin', '.cue' */], {
      batocera: 'ps2',
      console: 'Sony PlayStation 2',
      jelos: 'ps2',
    }),
    new GameConsole(/PlayStation 3|ps3/i, [/* '.bin', '.cue' */], {
      batocera: 'ps3',
      console: 'Sony PlayStation 3',
      jelos: 'ps3',
    }),
    new GameConsole(/PlayStation ?Portable|psp/i, [/* '.bin', '.cue' */], {
      batocera: 'psp',
      console: 'Sony PlayStation Portable',
      jelos: 'psp',
    }),
    new GameConsole(/PlayStation ?Vita|psvita/i, [], {
      batocera: 'psvita',
      console: 'Sony PlayStation Vita',
    }),
    new GameConsole(/PlayStation [4-9]|ps[4-9]/i, [/* '.bin', '.cue' */], {}),
    // Sord
    new GameConsole(/Sord[ -]M(5|five)/i, [/* '.bin', '.cas' */], {
      console: 'Sord M5',
      twmenu: 'm5',
    }),
    // Sun Microsystems
    new GameConsole(/(J2|Java) ?ME/i, ['.jar'], {
      console: 'Sun Microsystems J2ME',
      jelos: 'j2me',
    }),
    // Tiger
    new GameConsole(/Game.com/i, ['.tgc'], {
      console: 'Tiger Game.com',
    }),
    // Tiger Electronics (of Gizmondo fame)
    // Timetop
    new GameConsole(/GameKing/i, [/* '.bin' */], {
      console: 'TimeTop GameKing',
      pocket: 'game_king',
    }),
    // Toshiba
    new GameConsole(/Visicom/i, [/* '.bin', '.rom' */], {
      console: 'Toshiba Visicom',
    }),
    // Uzebox
    new GameConsole(/Uzebox/i, ['.uze'], {
      batocera: 'uzebox',
      console: 'Uzebox',
      jelos: 'uzebox',
    }),
    // VTech
    new GameConsole(/CreatiVision/i, [/* '.rom' */], {
      batocera: 'crvision',
      console: 'VTech CreatiVision',
      mister: 'CreatiVision',
      pocket: 'creativision',
    }),
    new GameConsole(/V\.Smile/i, [/* '.bin' */], {
      batocera: 'vsmile',
      console: 'VTech V.Smile',
    }),
    // WASM-4
    new GameConsole(/WASM-?4/i, ['.wasm'], {
      batocera: 'wasm4',
      console: 'WASM-4',
    }),
    // Watara
    new GameConsole(/Supervision/i, ['.sv'], {
      adam: 'SUPERVISION',
      batocera: 'supervision',
      console: 'Watara Supervision',
      jelos: 'supervision',
      mister: 'SuperVision',
      onion: 'SUPERVISION',
      pocket: 'supervision',
    }),
    // Wellback
    new GameConsole(/Mega ?Duck/i, ['.md1', '.md2'], {
      batocera: 'megaduck',
      console: 'Wellback Mega Duck',
      jelos: 'megaduck',
      onion: 'MEGADUCK',
      pocket: 'mega_duck',
    }),
    // Zeeboo
    new GameConsole(/Zeebo/i, [], {
      console: 'Zeebo Zeebo',
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

  getConsoleName(): string | undefined {
    return this.outputTokens.console;
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

  getTWMenu(): string | undefined {
    return this.outputTokens.twmenu;
  }
}
