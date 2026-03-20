import path from 'node:path';

import outputTokensData from './outputTokens.json' with { type: 'json' };

interface OutputTokensJson {
  consoles: {
    datNameRegex: string;
    extensions: string[];
    tokens: OutputTokenValues;
  }[];
}

interface OutputTokenValues {
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

  // SpruceOS ROMs go in the /Roms/{spruce} directory:
  // @see https://github.com/spruceUI/spruceOS/wiki/11.-Adding-Games/
  spruce?: string;

  // TWiLightMenu++ Roms go into the /roms subfolder on the 3DS/DSi SD card
  // @see https://github.com/DS-Homebrew/TWiLightMenu/tree/master/7zfile/roms
  twmenu?: string;
}

/**
 * A class of information about specific game consoles and their names, standard file extensions,
 * and how to replace output tokens such as `{pocket}`.
 */
export default class OutputTokens {
  /**
   * Other:
   *  @see https://emulation.gametechwiki.com/index.php/List_of_filetypes
   *  @see https://emulation.fandom.com/wiki/List_of_filetypes
   *  @see https://github.com/OpenEmu/OpenEmu/wiki/User-guide:-Importing
   *  @see https://github.com/XargonWan/RetroDECK/blob/main/es-configs/es_systems.xml
   */
  private static readonly CONSOLES: OutputTokens[] = (
    outputTokensData as unknown as OutputTokensJson
  ).consoles.map(({ datNameRegex, extensions, tokens }) => {
    const lastSlash = datNameRegex.lastIndexOf('/');
    const pattern = datNameRegex.slice(1, lastSlash);
    const flags = datNameRegex.slice(lastSlash + 1);
    return new OutputTokens(new RegExp(pattern, flags || undefined), extensions, tokens);
  });

  readonly datRegex: RegExp;

  readonly extensions: string[];

  readonly tokens: OutputTokenValues;

  constructor(datRegex: RegExp, extensions: string[], tokens: OutputTokenValues) {
    this.datRegex = datRegex;
    this.extensions = extensions;
    this.tokens = tokens;
  }

  static getForFilename(filePath: string): OutputTokens | undefined {
    const fileExtension = path.extname(filePath).toLowerCase();
    return this.CONSOLES.find((console) => console.getExtensions().includes(fileExtension));
  }

  static getForDatName(consoleName: string): OutputTokens | undefined {
    return this.CONSOLES.toReversed() // more specific names come second (e.g. "Game Boy" and "Game Boy Color")
      .find((console) => console.getDatRegex().test(consoleName));
  }

  private getDatRegex(): RegExp {
    return this.datRegex;
  }

  private getExtensions(): string[] {
    return this.extensions;
  }

  getAdam(): string | undefined {
    return this.tokens.adam;
  }

  getBatocera(): string | undefined {
    return this.tokens.batocera;
  }

  getEmulationStation(): string | undefined {
    return this.tokens.emulationstation;
  }

  getFunkeyOS(): string | undefined {
    return this.tokens.funkeyos;
  }

  getJelos(): string | undefined {
    return this.tokens.jelos;
  }

  getMinUI(): string | undefined {
    return this.tokens.minui;
  }

  getMister(): string | undefined {
    return this.tokens.mister;
  }

  getMiyooCFW(): string | undefined {
    return this.tokens.miyoocfw;
  }

  getOnion(): string | undefined {
    return this.tokens.onion;
  }

  getPocket(): string | undefined {
    return this.tokens.pocket;
  }

  getRetroDECK(): string | undefined {
    return this.tokens.retrodeck;
  }

  getRomM(): string | undefined {
    return this.tokens.romm;
  }

  getSpruce(): string | undefined {
    return this.tokens.spruce;
  }

  getTWMenu(): string | undefined {
    return this.tokens.twmenu;
  }
}
