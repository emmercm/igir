import ExpectedError from '../../expectedError.js';

export interface DATProps extends CMProObject {
  clrmamepro?: ClrMameProProps;
  game?: GameProps | GameProps[];
  resource?: ROMProps | ROMProps[];
}

export interface ClrMameProProps extends CMProObject {
  name?: string;
  description?: string;
  category?: string;
  version?: string;
  forcemerging?: 'none' | 'split' | 'full';
  forcezipping?: 'yes' | 'no';
  // sampleOf?: string;
  // NON-STANDARD PROPERTIES
  date?: string;
  author?: string;
  homepage?: string;
  url?: string;
  comment?: string;
}

export interface GameProps extends CMProObject {
  name?: string;
  description?: string;
  year?: string;
  manufacturer?: string;
  cloneof?: string;
  romof?: string;
  // sampleof?: string;
  rom?: ROMProps | ROMProps[];
  disk?: ROMProps | ROMProps[];
  sample?: SampleProps | SampleProps[];
  // NON-STANDARD PROPERTIES
  comment?: string;
  // serial?: string,
  // publisher?: string,
  // releaseyear?: string,
  // releasemonth?: string,
  // developer?: string,
  // users?: string,
  // esrbrating?: string,
  genre?: string;
}

export interface ROMProps extends CMProObject {
  name?: string;
  // merge?: string,
  size?: string;
  crc?: string;
  // flags?: string,
  md5?: string;
  sha1?: string;
  // NON-STANDARD PROPERTIES
  // serial?: string,
}

export interface SampleProps extends CMProObject {
  name: string;
}

type CMProValue = CMProObject | string | undefined;

interface CMProObject {
  [key: string]: CMProValue | CMProValue[];
}

/**
 * A parser for CMPRo schema DATs.
 * @see http://www.logiqx.com/DatFAQs/CMPro.php
 */
export default class CMProParser {
  private static readonly WHITESPACE_CHARS = new Set([' ', '\t', '\n', '\r', '\v']);

  private readonly contents: string;

  private pos = 0;

  constructor(contents: string) {
    this.contents = contents;
  }

  /**
   * Parse the CMPro DAT's file contents.
   */
  public parse(): DATProps {
    this.pos = 0;

    const result: CMProObject = {};
    while (this.pos < this.contents.length) {
      const tag = this.parseTag();
      const value = this.parseValue();

      const existing = result[tag];
      if (existing === undefined) {
        result[tag] = value;
      } else {
        if (Array.isArray(existing)) {
          result[tag] = [...existing, value];
        } else {
          result[tag] = [existing, value];
        }
      }

      this.skipWhitespace();
    }
    return result;
  }

  private skipWhitespace(): void {
    while (CMProParser.WHITESPACE_CHARS.has(this.contents.charAt(this.pos))) {
      this.pos += 1;
    }
  }

  private parseObject(): CMProObject {
    if (this.contents.charAt(this.pos) === '(') {
      this.pos += 1;
    }
    this.skipWhitespace();

    const result: CMProObject = {};
    while (this.contents.charAt(this.pos) !== ')') {
      const tag = this.parseTag();
      const value = this.parseValue();

      const existing = result[tag];
      if (existing === undefined) {
        result[tag] = value;
      } else {
        if (Array.isArray(existing)) {
          result[tag] = [...existing, value];
        } else {
          result[tag] = [existing, value];
        }
      }

      this.skipWhitespace();
    }
    this.pos += 1;
    return result;
  }

  private parseTag(): string {
    this.skipWhitespace();

    const initialPos = this.pos;
    while (!CMProParser.WHITESPACE_CHARS.has(this.contents.charAt(this.pos))) {
      this.pos += 1;
    }

    return this.contents.slice(initialPos, this.pos);
  }

  private parseValue(): CMProValue {
    this.skipWhitespace();

    // Parse object
    if (this.contents.charAt(this.pos) === '(') {
      this.pos += 1;
      return this.parseObject();
    }

    // Parse quoted string
    if (this.contents.charAt(this.pos) === '"') {
      return this.parseQuotedString();
    }

    // Parse unquoted string
    return this.parseUnquotedString();
  }

  private parseQuotedString(): string {
    if (this.contents.charAt(this.pos) !== '"') {
      throw new ExpectedError('invalid quoted string');
    }
    this.pos += 1;

    const initialPos = this.pos;
    while (this.pos < this.contents.length) {
      // String termination, return the value
      if (this.contents.charAt(this.pos) === '"') {
        const value = this.contents.slice(initialPos, this.pos);
        this.pos += 1;
        return value;
      }

      // Quoted character, skip it
      if (this.contents.charAt(this.pos) === '\\') {
        this.pos += 2;
      } else {
        this.pos += 1;
      }
    }

    throw new ExpectedError('invalid quoted string');
  }

  private parseUnquotedString(): string {
    const initialPos = this.pos;
    while (!CMProParser.WHITESPACE_CHARS.has(this.contents.charAt(this.pos))) {
      this.pos += 1;
    }
    return this.contents.slice(initialPos, this.pos);
  }
}
