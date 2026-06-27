export interface FileTimestamps {
  modified?: Date;
  accessed?: Date;
  created?: Date;
}

export default {
  /**
   * Parse the Info-ZIP Extended Timestamp (0x5455, "UT") extra field and return the modified,
   * accessed, and/or created times present per the leading info-byte flags. Each time is a
   * 32-bit signed Unix epoch seconds value (UTC) with 1-second resolution.
   * @see https://libzip.org/specifications/appnote_iz.txt
   */
  parseExtendedTimestamp: (buffer: Buffer<ArrayBuffer> | undefined): FileTimestamps | undefined => {
    if (buffer === undefined || buffer.length === 0) {
      return undefined;
    }

    const times = Array.from({ length: Math.floor((buffer.length - 1) / 4) }, (_, idx) =>
      buffer.readInt32LE(1 + idx * 4),
    );
    if (times.length === 0) {
      // Should be invalid
      return undefined;
    }

    const timestamps: FileTimestamps = {};
    let readTimes = 0;

    const infoBit = buffer.readInt8(0);
    if (infoBit & 0x01) {
      const epochSeconds = times.at(readTimes);
      timestamps.modified = epochSeconds === undefined ? undefined : new Date(epochSeconds * 1000);
      readTimes += 1;
    }
    if (infoBit & 0x02) {
      const epochSeconds = times.at(readTimes);
      timestamps.accessed = epochSeconds === undefined ? undefined : new Date(epochSeconds * 1000);
      readTimes += 1;
    }
    if (infoBit & 0x04) {
      const epochSeconds = times.at(readTimes);
      timestamps.created = epochSeconds === undefined ? undefined : new Date(epochSeconds * 1000);
    }

    return timestamps;
  },

  /**
   * Parse the Info-ZIP Unix (0x5855, "UX") or PKWARE Unix (0x000d) extra field and return the
   * accessed and modified times. Both formats begin with an accessed time and a modified time
   * stored as 32-bit unsigned Unix epoch seconds (UTC) with 1-second resolution.
   * @see https://libzip.org/specifications/appnote_iz.txt
   */
  parseUnixExtraTimestamp: (
    buffer: Buffer<ArrayBuffer> | undefined,
  ): FileTimestamps | undefined => {
    if (buffer === undefined || buffer.length === 0) {
      return undefined;
    }

    return {
      accessed: new Date(buffer.readUInt32LE(0) * 1000),
      modified: new Date(buffer.readUInt32LE(4) * 1000),
    };
  },

  /**
   * Parse the NTFS (0x000a) extra field and return the modified, accessed, and created times
   * recorded by Windows. Times are 64-bit FILETIME values (100-ns intervals since 1601-01-01
   * UTC). Returns undefined when the file-times attribute (tag 0x0001) is absent.
   * @see https://libzip.org/specifications/appnote_iz.txt
   */
  parseNtfsExtraTimestamp: (
    buffer: Buffer<ArrayBuffer> | undefined,
  ): FileTimestamps | undefined => {
    if (buffer === undefined || buffer.length === 0) {
      return undefined;
    }

    const attributes = new Map<number, Buffer<ArrayBuffer>>();
    let position = 4;
    while (position < buffer.length) {
      const attributeTagValue = buffer.readUInt16LE(position);
      const attributeTagSize = buffer.readUInt16LE(position + 2);
      const attributeTagData = buffer.subarray(position + 4, position + 4 + attributeTagSize);
      attributes.set(attributeTagValue, attributeTagData);
      position += 4 + attributeTagSize;
    }

    const fileTimes = attributes.get(0x00_01);
    if (fileTimes === undefined) {
      return undefined;
    }

    return {
      modified: new Date(
        Number(BigInt(Date.UTC(1601, 0, 1)) + fileTimes.readBigUInt64LE(0) / 10_000n),
      ),
      accessed: new Date(
        Number(BigInt(Date.UTC(1601, 0, 1)) + fileTimes.readBigUInt64LE(8) / 10_000n),
      ),
      created: new Date(
        Number(BigInt(Date.UTC(1601, 0, 1)) + fileTimes.readBigUInt64LE(16) / 10_000n),
      ),
    };
  },

  /**
   * Parse the Info-ZIP Macintosh (0x334d, "Mac3") extra field and return the file's modified
   * and created times. The trailing Finder/file-info block may be zlib-compressed when flag
   * bit 14 is set; that case is unsupported and yields undefined.
   * @see https://libzip.org/specifications/appnote_iz.txt
   */
  parseInfoZipMacintoshExtraTimestamp: (
    buffer: Buffer<ArrayBuffer> | undefined,
  ): FileTimestamps | undefined => {
    if (buffer === undefined || buffer.length < 6) {
      return undefined;
    }
    const flags = buffer.readUInt16LE(4);
    if (flags & 0x40_00) {
      return undefined;
    }
    // ioFlCrDat at offset 45, ioFlMdDat at offset 49 (both 4-byte big-endian Mac time).
    if (buffer.length < 53) {
      return undefined;
    }
    return {
      created: new Date(buffer.readUInt32BE(45) * 1000 + Date.UTC(1904, 0, 1)),
      modified: new Date(buffer.readUInt32BE(49) * 1000 + Date.UTC(1904, 0, 1)),
    };
  },

  /**
   * Parse the MS-DOS time/date pair carried in every zip header and return the file's
   * modification time. DOS time has 2-second resolution and is interpreted as local time, as
   * the specification provides no timezone information.
   * @see https://github.com/DidierStevens/DidierStevensSuite/blob/master/zipdump.py
   */
  parseDOSTimestamp: (bufferTime: number, bufferDate: number): Date => {
    const seconds = (bufferTime & 0b0000_0000_0001_1111) * 2;
    const minutes = (bufferTime & 0b0000_0111_1110_0000) >> 5;
    const hours = (bufferTime & 0b1111_1000_0000_0000) >> 11;

    const day = bufferDate & 0b0000_0000_0001_1111;
    const month = (bufferDate & 0b0000_0001_1110_0000) >> 5;
    const year = 1980 + ((bufferDate & 0b1111_1110_0000_0000) >> 9);

    // The specification provides no way to know the timezone, so local is assumed
    return new Date(year, month - 1, day, hours, minutes, seconds);
  },
};
