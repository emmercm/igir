import xml2js from 'xml2js';

import FsPoly from '../../polyfill/fsPoly.js';
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
  protected generateGameNamesToParents(): DAT {
    const gameNamesToParents: Map<string, Parent> = new Map();

    // Find all parents
    this.getGames()
      .filter((game) => game.isParent())
      .forEach((game: Game) => {
        gameNamesToParents.set(game.getName(), new Parent(game));
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

  getNameShort(): string {
    return this.getName()
      // Prefixes
      .replace('FinalBurn Neo', '')
      .replace('Non-Redump', '')
      .replace('Source Code', '')
      .replace('Unofficial', '')
      // Suffixes
      .replace('Datfile', '')
      .replace('Games', '')
      .replace('(Deprecated)', '')
      .replace(/\(Parent-Clone\)/g, '')
      .replace('(WIP)', '')
      // Cleanup
      .replace(/^[ -]+/, '')
      .replace(/[ -]+$/, '')
      .replace(/  +/g, ' ')
      .trim();
  }

  getDescription(): string | undefined {
    return this.getHeader().getDescription();
  }

  getRomNamesContainDirectories(): boolean {
    return this.getHeader().getRomNamesContainDirectories()
      || this.isBiosDat();
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

  /**
   * Is this a {@link LogiqxDAT} that only contains BIOS files.
   */
  isBiosDat(): boolean {
    return (this.getGames().length > 0 && this.getGames().every((game) => game.isBios()))
      // Redump-style DAT names
      || this.getName().match(/(\W|^)BIOS(\W|$)/i) !== null
      // libretro-style DAT comments
      || (this.getHeader().getComment() ?? '').match(/(\W|^)BIOS(\W|$)/i) !== null;
  }

  /**
   * Does a DAT explicitly contain headered ROMs. It is possible for a DAT to be both non-headered
   *  and non-headerless.
   */
  isHeadered(): boolean {
    // No-Intro "headerless" DATs have this field set
    if (this.getHeader().getClrMamePro()?.getHeader()) {
      return false;
    }

    return this.getName().match(/\(headered\)/i) !== null;
  }

  /**
   * Does a DAT explicitly contain headerless ROMs. It is possible for a DAT to be both non-headered
   * and non-headerless.
   */
  isHeaderless(): boolean {
    // No-Intro "headerless" DATs have this field set
    if (this.getHeader().getClrMamePro()?.getHeader()) {
      return true;
    }

    return this.getName().match(/\(headerless\)/i) !== null;
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
    return `{"header": ${this.getHeader().toString()}, "games": ${this.getGames().length}}`;
  }
}
