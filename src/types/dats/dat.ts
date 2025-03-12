import { Memoize } from 'typescript-memoize';
import xml2js from 'xml2js';

import FsPoly from '../../polyfill/fsPoly.js';
import { ChecksumBitmask } from '../files/fileChecksums.js';
import Game from './game.js';
import Header from './logiqx/header.js';
import Parent from './parent.js';

/**
 * The base class for other DAT classes.
 */
export default abstract class DAT {
  private parents: Parent[] = [];

  abstract getHeader(): Header;

  abstract getGames(): Game[];

  /**
   * Group all {@link Game} clones together into one {@link Parent}. If no parent/clone information
   * exists, then there will be one {@link Parent} for every {@link Game}.
   */
  protected generateGameNamesToParents(): this {
    const gameNamesToParents: Map<string, Parent> = new Map();

    // Find all parents
    this.getGames()
      .filter((game) => game.isParent())
      .forEach((game: Game) => {
        const parent = gameNamesToParents.get(game.getName());
        if (parent) {
          // Two games have the same name, assume this one is a clone
          parent.addChild(game);
        } else {
          gameNamesToParents.set(game.getName(), new Parent(game));
        }
      });

    // Find all clones
    this.getGames()
      .filter((game) => game.isClone())
      .forEach((game: Game) => {
        const parent = gameNamesToParents.get(game.getParent());
        if (parent) {
          parent.addChild(game);
        } else {
          // The DAT is bad, the game is referencing a parent that doesn't exist
          gameNamesToParents.set(game.getName(), new Parent(game));
        }
      });

    this.parents = [...gameNamesToParents.values()];

    return this;
  }

  getParents(): Parent[] {
    return this.parents;
  }

  /**
   * Does any {@link Game} in this {@link DAT} have clone information.
   */
  hasParentCloneInfo(): boolean {
    return this.getParents().length > 0 && this.getParents().length !== this.getGames().length;
  }

  getName(): string {
    return this.getHeader().getName();
  }

  @Memoize()
  getNameShort(): string {
    return (
      this.getName()
        // Prefixes
        .replace('FinalBurn Neo', '')
        .replace('Non-Redump', '')
        .replace('Source Code', '')
        .replace('Unofficial', '')
        // Suffixes
        .replace('Datfile', '')
        .replace('(Deprecated)', '')
        .replace(/\(Parent-Clone\)/g, '')
        .replace('(WIP)', '')
        // Cleanup
        .replace(/-( +-)+/g, '- ')
        .replace(/^[ -]+/, '')
        .replace(/[ -]+$/, '')
        .replace(/  +/g, ' ')
        .trim()
    );
  }

  getDescription(): string | undefined {
    return this.getHeader().getDescription();
  }

  /**
   * Get a No-Intro style filename.
   */
  getFilename(): string {
    let filename = this.getName();
    if (this.getHeader().getVersion()) {
      filename += ` (${this.getHeader().getVersion()})`;
    }
    filename += '.dat';
    return FsPoly.makeLegal(filename.trim());
  }

  getRequiredRomChecksumBitmask(): number {
    let checksumBitmask = 0;
    this.getGames().forEach((game) =>
      game.getRoms().forEach((rom) => {
        if (rom.getCrc32() && rom.getSize()) {
          checksumBitmask |= ChecksumBitmask.CRC32;
        } else if (rom.getMd5()) {
          checksumBitmask |= ChecksumBitmask.MD5;
        } else if (rom.getSha1()) {
          checksumBitmask |= ChecksumBitmask.SHA1;
        } else if (rom.getSha256()) {
          checksumBitmask |= ChecksumBitmask.SHA256;
        }
      }),
    );
    return checksumBitmask;
  }

  getRequiredDiskChecksumBitmask(): number {
    let checksumBitmask = 0;
    this.getGames().forEach((game) =>
      game.getDisks().forEach((disk) => {
        if (disk.getCrc32() && disk.getSize()) {
          checksumBitmask |= ChecksumBitmask.CRC32;
        } else if (disk.getMd5()) {
          checksumBitmask |= ChecksumBitmask.MD5;
        } else if (disk.getSha1()) {
          checksumBitmask |= ChecksumBitmask.SHA1;
        } else if (disk.getSha256()) {
          checksumBitmask |= ChecksumBitmask.SHA256;
        }
      }),
    );
    return checksumBitmask;
  }

  /**
   * Serialize this {@link DAT} to the file contents of an XML file.
   */
  toXmlDat(): string {
    // TODO(cemmer): replace with fast-xml-parser https://github.com/NaturalIntelligence/fast-xml-parser/issues/639
    return new xml2js.Builder({
      renderOpts: { pretty: true, indent: '\t', newline: '\n' },
      xmldec: { version: '1.0' },
      doctype: {
        pubID: '-//Logiqx//DTD ROM Management Datafile//EN',
        sysID: 'http://www.logiqx.com/Dats/datafile.dtd',
      },
      cdata: true,
    }).buildObject(this.toXmlDatObj());
  }

  private toXmlDatObj(): object {
    const parentNames = new Set(this.getParents().map((parent) => parent.getName()));
    return {
      datafile: {
        header: this.getHeader().toXmlDatObj(),
        game: this.getGames().map((game) => game.toXmlDatObj(parentNames)),
      },
    };
  }

  /**
   * Return a short string representation of this {@link DAT}.
   */
  toString(): string {
    return JSON.stringify(
      {
        header: this.getHeader(),
        games: this.getGames().length,
        gamesSize: FsPoly.sizeReadable(
          this.getGames()
            .flatMap((game) => game.getRoms())
            .reduce((sum, rom) => sum + rom.getSize(), 0),
          2,
        ),
      },
      undefined,
      2,
    );
  }
}
