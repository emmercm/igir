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
    new GameConsole(['.arduboy', '.hex'], 'Arduboy - Arduboy', 'arduboy', undefined),
    new GameConsole(['.a26', '.act', '.pb', '.tv', '.tvr', '.mn', '.cv', '.eb', '.ef', '.efr', '.ua', '.x07', '.sb'], 'Atari - 2600', '2600', undefined),
    new GameConsole(['.a52'], 'Atari - 5200', undefined, 'Atari5200'),
    new GameConsole(['.a78'], 'Atari - 7800', '7800', 'Atari7800'),
    new GameConsole(['.lnx', '.lyx'], 'Atari - Lynx', undefined, 'AtariLynx'),
    new GameConsole(['.ws'], 'Bandai - WonderSwan', undefined, 'WonderSwan'),
    new GameConsole(['.wsc'], 'Bandai - WonderSwan Color', undefined, 'WonderSwan'),
    new GameConsole([/* '.bin' */], 'Bit Corporation - Gamate', 'gamate', 'Gamate'),
    new GameConsole(['.col'], 'Coleco - ColecoVision', 'coleco', 'Coleco'),
    new GameConsole([/* '.bin' */], 'Emerson - Arcadia 2001', 'arcadia', undefined),
    new GameConsole([/* '.bin' */], 'Entex - Adventure Vision', 'avision', 'AVision'),
    new GameConsole([/* '.bin' */], 'Fairchild - Channel F', 'channel_f', 'ChannelF'),
    new GameConsole([/* '.bin' */], 'Magnavox - Odyssey 2', 'odsyessey2', 'Odyssey2'),
    new GameConsole(['.int'], 'Mattel - Intellivision', 'intv', 'Intellivision'),
    new GameConsole(['.pce'], 'NEC - PC Engine - TurboGrafx 16', 'pce', 'TGFX16'),
    new GameConsole(['.sgx'], 'NEC - PC Engine SuperGrafx', 'pce', 'TGFX16'),
    new GameConsole(['.fds'], 'Nintendo - Famicom Computer Disk System', 'nes', 'NES'),
    new GameConsole(['.gb', '.sgb'], 'Nintendo - Game Boy', 'gb', 'Gameboy'), // pocket:sgb for spiritualized1997
    new GameConsole(['.gba', '.srl'], 'Nintendo - Game Boy Advance', 'gba', 'GBA'),
    new GameConsole(['.gbc'], 'Nintendo - Game Boy Color', 'gbc', 'Gameboy'),
    new GameConsole(['.nes', '.nez'], 'Nintendo - Nintendo Entertainment System', 'nes', 'NES'),
    new GameConsole(['.min'], 'Nintendo - Pokemon Mini', 'poke_mini', undefined),
    new GameConsole(['.bs'], 'Nintendo - Stellaview', undefined, 'SNES'),
    new GameConsole(['.smc', '.sfc'], 'Nintendo - Super Nintendo Entertainment System', 'snes', 'SNES'),
    new GameConsole([/* '.bin' */], 'Philips - Videopac+', undefined, 'Odyssey2'),
    new GameConsole([/* '.bin' */], 'RCA - Studio II', 'studio2', undefined),
    new GameConsole(['.gg'], 'Sega - Game Gear', 'gg', 'SMS'),
    new GameConsole(['.sms'], 'Sega - Master System - Mark III', 'sms', 'SMS'),
    new GameConsole(['.gen', '.md', '.smd'], 'Sega - Mega Drive - Genesis', 'genesis', ''),
    new GameConsole(['.sc', '.sg'], 'Sega - SG-1000', 'sg1000', 'SG1000'),
    new GameConsole([], 'SNK - Neo Geo', 'ng', 'NeoGeo'),
    new GameConsole(['.ngp'], 'SNK - Neo Geo Pocket', undefined, undefined),
    new GameConsole(['.ngc'], 'SNK - Neo Geo Pocket Color', undefined, undefined),
    new GameConsole([/* '.bin' */], 'Timetop - GameKing', 'game_king', undefined),
    new GameConsole([/* '.rom' */], 'VTech - CreatiVision', 'creativision', undefined),
    new GameConsole(['.sv'], 'Watara - Supervision', 'supervision', undefined),
    new GameConsole([/* '.bin',  */'.md1', '.md2'], 'Wellback - Mega Duck', 'mega_duck', undefined),
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
