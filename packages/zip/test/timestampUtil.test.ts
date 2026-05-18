import TimestampUtil from '../src/timestampUtil.js';

// Date.UTC(1904, 0, 1) is the Mac classic epoch (1904-01-01 UTC).

describe('parseInfoZipMacintoshExtraTimestamp', () => {
  test('returns undefined for an undefined buffer', () => {
    expect(TimestampUtil.parseInfoZipMacintoshExtraTimestamp(undefined)).toBeUndefined();
  });

  test('returns undefined for an empty buffer', () => {
    expect(TimestampUtil.parseInfoZipMacintoshExtraTimestamp(Buffer.alloc(0))).toBeUndefined();
  });

  test('returns undefined when the compressed flag (bit 14) is set', () => {
    const buffer = Buffer.alloc(64);
    buffer.writeUInt32LE(64, 0); // fullSize
    buffer.writeUInt16LE(0x40_00, 4); // flags: compressed bit set
    expect(TimestampUtil.parseInfoZipMacintoshExtraTimestamp(buffer)).toBeUndefined();
  });

  test('extracts the ioFlMdDat modified time from uncompressed data', () => {
    const expected = Date.UTC(2020, 0, 1);
    const macSeconds = (expected - Date.UTC(1904, 0, 1)) / 1000;
    // Layout per Info-ZIP Mac3 (0x334d): fullSize(4) flags(2) fdType(4) fdCreator(4)
    // fdFlags(2) fdLocation(4) fdFldr(2) fdScript(1) fdXFlags(1) ioFlAttrib(1)
    // ioFlStBlk(2) ioFlLgLen(4) ioFlPyLen(4) ioFlRStBlk(2) ioFlRLgLen(4) ioFlRPyLen(4)
    // ioFlCrDat(4) ioFlMdDat(4) → ioFlMdDat at offset 49.
    const buffer = Buffer.alloc(64);
    buffer.writeUInt32LE(64, 0);
    buffer.writeUInt16LE(0, 4); // flags: uncompressed
    buffer.writeUInt32BE(macSeconds, 49);
    expect(TimestampUtil.parseInfoZipMacintoshExtraTimestamp(buffer)?.modified?.toISOString()).toBe(
      '2020-01-01T00:00:00.000Z',
    );
  });

  test('returns undefined when buffer is too short to reach ioFlMdDat', () => {
    const buffer = Buffer.alloc(20);
    buffer.writeUInt32LE(20, 0);
    buffer.writeUInt16LE(0, 4);
    expect(TimestampUtil.parseInfoZipMacintoshExtraTimestamp(buffer)).toBeUndefined();
  });
});
