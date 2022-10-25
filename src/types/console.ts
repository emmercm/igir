export default class Console {
  // @link https://mister-devel.github.io/MkDocs_MiSTer/cores/console/
  private static readonly CONSOLES: Console[] = [
    new Console(['.a52'], 'Atari - 5200', undefined, 'Atari5200'),
    new Console(['.a78'], 'Atari - 7800', undefined, 'Atari7800'),
    new Console(['.lnx', '.lyx'], 'Atari - Lynx', undefined, 'AtariLynx'),
    new Console(['.pce'], 'NEC - PC Engine - TurboGrafx 16', 'pce', 'TGFX16'),
    new Console(['.sgx'], 'NEC - PC Engine SuperGrafx', 'pce', 'TGFX16'),
    new Console(['.fds'], 'Nintendo - Famicom Computer Disk System', 'nes', 'NES'),
    new Console(['.gb'], 'Nintendo - Game Boy', 'gb', 'Gameboy'),
    new Console(['.gba'], 'Nintendo - Game Boy Advance', 'gba', 'GBA'),
    new Console(['.gbc'], 'Nintendo - Game Boy Color', 'gbc', 'Gameboy'),
    new Console(['.nes'], 'Nintendo - Nintendo Entertainment System', 'nes', 'NES'),
    new Console(['.smc', '.sfc'], 'Nintendo - Super Nintendo Entertainment System', 'snes', 'SNES'),
    new Console(['.gg'], 'Sega - Game Gear', 'gg', 'SMS'),
    new Console(['.sms'], 'Sega - Master System -  Mark III', 'sms', 'SMS'),
    new Console(['.md'], 'Sega - Mega Drive - Genesis', 'genesis', ''),
    new Console(['.sc', '.sg'], 'Sega - SG-1000', 'sg1000', 'SG1000'),
    new Console(['.sv'], 'Watara - Supervision', 'supervision', undefined),
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
}
