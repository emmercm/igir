import path from 'path';

export default class GameConsole {
  /**
   * Analogue Pocket ROMs go in the /Assets/{pocket}/common/ directory
   *
   * MiSTer ROMs go in the /games/{mister}/ directory:
   *  @link https://mister-devel.github.io/MkDocs_MiSTer/cores/console/
   *  @link https://mister-devel.github.io/MkDocs_MiSTer/cores/computer/
   *
   * @link https://emulation.gametechwiki.com/index.php/List_of_filetypes
   * @link https://emulation.fandom.com/wiki/List_of_filetypes
   */
  private static readonly CONSOLES: GameConsole[] = [
    // Arduboy
    new GameConsole(/Arduboy/i, ['.arduboy', '.hex'], 'arduboy', undefined),
    // Atari
    new GameConsole(/2600/i, ['.a26', '.act', '.pb', '.tv', '.tvr', '.mn', '.cv', '.eb', '.ef', '.efr', '.ua', '.x07', '.sb'], '2600', undefined),
    new GameConsole(/5200/i, ['.a52'], undefined, 'Atari5200'),
    new GameConsole(/7800/i, ['.a78'], '7800', 'Atari7800'),
    new GameConsole(/Lynx/i, ['.lnx', '.lyx'], undefined, 'AtariLynx'),
    // Bandai
    new GameConsole(/WonderSwan/i, ['.ws'], undefined, 'WonderSwan'),
    new GameConsole(/WonderSwan Color/i, ['.wsc'], undefined, 'WonderSwan'),
    // Bit Corporation
    new GameConsole(/Gamate/i, [/* '.bin' */], 'gamate', 'Gamate'),
    // Coleco
    new GameConsole(/ColecoVision/i, ['.col'], 'coleco', 'Coleco'),
    // Emerson
    new GameConsole(/Arcadia/i, [/* '.bin' */], 'arcadia', undefined),
    // Entex
    new GameConsole(/Adventure Vision/i, [/* '.bin' */], 'avision', 'AVision'),
    // Fairchild
    new GameConsole(/Channel F/i, [/* '.bin' */], 'channel_f', 'ChannelF'),
    // Magnavox
    new GameConsole(/Odyssey 2/i, [/* '.bin' */], 'odyssey2', 'Odyssey2'),
    // Mattel
    new GameConsole(/Intellivision/i, ['.int'], 'intv', 'Intellivision'),
    // NEC
    new GameConsole(/PC Engine|TurboGrafx/i, ['.pce'], 'pce', 'TGFX16'),
    new GameConsole(/SuperGrafx/i, ['.sgx'], 'pce', 'TGFX16'),
    // Nintendo
    new GameConsole(/FDS|Famicom Computer Disk System/i, ['.fds'], 'nes', 'NES'),
    new GameConsole(/GB|Game Boy/i, ['.gb', '.sgb'], 'gb', 'Gameboy'), // pocket:sgb for spiritualized1997
    new GameConsole(/GBA|Game Boy Advance/i, ['.gba', '.srl'], 'gba', 'GBA'),
    new GameConsole(/GBC|Game Boy Color/i, ['.gbc'], 'gbc', 'Gameboy'),
    new GameConsole(/NES|Nintendo Entertainment System/i, ['.nes', '.nez'], 'nes', 'NES'),
    new GameConsole(/Pokemon Mini/i, ['.min'], 'poke_mini', undefined),
    new GameConsole(/Stellaview/i, ['.bs'], undefined, 'SNES'),
    new GameConsole(/SNES|Super Nintendo Entertainment System/i, ['.smc', '.sfc'], 'snes', 'SNES'),
    // Philips
    new GameConsole(/Videopac/i, [/* '.bin' */], undefined, 'Odyssey2'),
    // RCA
    new GameConsole(/Studio (2|II)/i, [/* '.bin' */], 'studio2', undefined),
    // Sega
    new GameConsole(/Game Gear/i, ['.gg'], 'gg', 'SMS'),
    new GameConsole(/Master System/i, ['.sms'], 'sms', 'SMS'),
    new GameConsole(/Mega Drive|Genesis/i, ['.gen', '.md', '.smd'], 'genesis', ''),
    new GameConsole(/SG-?1000/i, ['.sc', '.sg'], 'sg1000', 'SG1000'),
    // SNK
    new GameConsole(/Neo Geo/i, [], 'ng', 'NeoGeo'),
    new GameConsole(/Neo Geo Pocket/i, ['.ngp'], undefined, undefined),
    new GameConsole(/Neo Geo Pocket Color/i, ['.ngc'], undefined, undefined),
    // Timetop
    new GameConsole(/GameKing/i, [/* '.bin' */], 'game_king', undefined),
    // VTech
    new GameConsole(/CreatiVision/i, [/* '.rom' */], 'creativision', undefined),
    // Watara
    new GameConsole(/Supervision/i, ['.sv'], 'supervision', undefined),
    // Wellback
    new GameConsole(/Mega Duck/i, [/* '.bin',  */'.md1', '.md2'], 'mega_duck', undefined),
  ];

  readonly regex: RegExp;

  readonly extensions: string[];

  readonly pocket?: string;

  readonly mister?: string;

  constructor(regex: RegExp, extensions: string[], pocket?: string, mister?: string) {
    this.regex = regex;
    this.extensions = extensions;
    this.pocket = pocket;
    this.mister = mister;
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
}
