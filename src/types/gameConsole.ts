import path from 'path';

export default class GameConsole {
  /**
   * Analogue Pocket ROMs go in the /Assets/{pocket}/common/ directory
   *
   * MiSTer ROMs go in the /games/{mister}/ directory:
   *  @link https://mister-devel.github.io/MkDocs_MiSTer/cores/console/
   *  @link https://mister-devel.github.io/MkDocs_MiSTer/cores/computer/
   */
  private static readonly CONSOLES: GameConsole[] = [
    new GameConsole(['.a52'], 'Atari - 5200', undefined, 'Atari5200'),
    new GameConsole(['.a78'], 'Atari - 7800', undefined, 'Atari7800'),
    new GameConsole(['.lnx', '.lyx'], 'Atari - Lynx', undefined, 'AtariLynx'),
    new GameConsole(['.ws'], 'Bandai - WonderSwan', undefined, 'WonderSwan'),
    new GameConsole(['.wsc'], 'Bandai - WonderSwan Color', undefined, 'WonderSwan'),
    // new GameConsole(['.bin'], 'Bit Corporation - Gamate', undefined, 'Gamate'),
    new GameConsole(['.col'], 'Coleco - ColecoVision', undefined, 'Coleco'),
    // new GameConsole(['.bin'], 'Entex - Adventure Vision', undefined, 'AVision'),
    // new GameConsole(['.bin'], 'Fairchild - Channel F', undefined, 'ChannelF'),
    // new GameConsole(['.bin'], 'Magnavox - Odyssey 2', undefined, 'Odyssey2'),
    new GameConsole(['.int'], 'Mattel - Intellivision', undefined, 'Intellivision'),
    new GameConsole(['.pce'], 'NEC - PC Engine - TurboGrafx 16', 'pce', 'TGFX16'),
    new GameConsole(['.sgx'], 'NEC - PC Engine SuperGrafx', undefined, 'TGFX16'),
    new GameConsole(['.fds'], 'Nintendo - Famicom Computer Disk System', 'nes', 'NES'),
    new GameConsole(['.gb'], 'Nintendo - Game Boy', 'gb', 'Gameboy'),
    new GameConsole(['.gba'], 'Nintendo - Game Boy Advance', 'gba', 'GBA'),
    new GameConsole(['.gbc'], 'Nintendo - Game Boy Color', 'gbc', 'Gameboy'),
    new GameConsole(['.nes'], 'Nintendo - Nintendo Entertainment System', 'nes', 'NES'),
    new GameConsole(['.bs'], 'Nintendo - Stellaview', undefined, 'SNES'),
    new GameConsole(['.smc', '.sfc'], 'Nintendo - Super Nintendo Entertainment System', 'snes', 'SNES'),
    // new GameConsole(['.bin'], 'Philips - Videopac+', undefined, 'Odyssey2'),
    new GameConsole(['.gg'], 'Sega - Game Gear', 'gg', 'SMS'),
    new GameConsole(['.sms'], 'Sega - Master System -  Mark III', 'sms', 'SMS'),
    new GameConsole(['.md'], 'Sega - Mega Drive - Genesis', 'genesis', ''),
    new GameConsole(['.sc', '.sg'], 'Sega - SG-1000', 'sg1000', 'SG1000'),
    // new GameConsole([], 'SNK Neo Geo', undefined, 'NeoGeo'),
    new GameConsole(['.sv'], 'Watara - Supervision', 'supervision', undefined),
  ];

  readonly extensions: string[];

  readonly long: string;

  readonly pocket?: string;

  readonly mister?: string;

  constructor(extensions: string[], long: string, pocket?: string, mister?: string) {
    this.long = long;
    this.pocket = pocket;
    this.mister = mister;
    this.extensions = extensions;
  }

  static getForFilename(filePath: string): GameConsole | undefined {
    const fileExtension = path.extname(filePath).toLowerCase();
    return this.CONSOLES
      .filter((console) => console.getExtensions().some((ext) => ext === fileExtension))[0];
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
