export interface FileTimestamps {
  modified?: Date;
  accessed?: Date;
  created?: Date;
}

export default {
  /**
   * @see https://libzip.org/specifications/appnote_iz.txt
   */
  parseExtendedTimestamp: (buffer: Buffer<ArrayBuffer> | undefined): FileTimestamps | undefined => {
    if (buffer === undefined || buffer.length === 0) {
      return undefined;
    }

    const times = [...Array.from({ length: (buffer.length - 1) / 4 }).keys()].map((idx) =>
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
