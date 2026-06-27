import type fs from 'node:fs';

export interface IArchiveExtraDataRecord {
  raw: Buffer<ArrayBuffer>;
  extraFieldLength: number;
  extraFieldData: Buffer<ArrayBuffer>;
}

/**
 * An archive extra data record, which may appear once between the last file's data and the central
 * directory.
 * @see https://en.wikipedia.org/wiki/ZIP_(file_format)#Archive_extra_data_record
 */
export default class ArchiveExtraDataRecord {
  static readonly ARCHIVE_EXTRA_DATA_RECORD_SIGNATURE = Buffer.from('08064b50', 'hex').toReversed();

  // Size of the signature plus the extra field length field, without the variable-length data.
  private static readonly ARCHIVE_EXTRA_DATA_RECORD_SIZE = 8;

  readonly raw: Buffer<ArrayBuffer>;
  readonly extraFieldLength: number;
  readonly extraFieldData: Buffer<ArrayBuffer>;

  private constructor(props: IArchiveExtraDataRecord) {
    this.raw = props.raw;
    this.extraFieldLength = props.extraFieldLength;
    this.extraFieldData = props.extraFieldData;
  }

  /**
   * Parse an archive extra data record at the given position, or return undefined if its signature
   * is not present there.
   */
  static async fromFileHandle(
    fileHandle: fs.promises.FileHandle,
    position: number,
  ): Promise<ArchiveExtraDataRecord | undefined> {
    const fixedLengthBuffer = Buffer.allocUnsafe(this.ARCHIVE_EXTRA_DATA_RECORD_SIZE);
    const { bytesRead } = await fileHandle.read({ buffer: fixedLengthBuffer, position });
    if (
      bytesRead < this.ARCHIVE_EXTRA_DATA_RECORD_SIZE ||
      !fixedLengthBuffer
        .subarray(0, this.ARCHIVE_EXTRA_DATA_RECORD_SIGNATURE.length)
        .equals(this.ARCHIVE_EXTRA_DATA_RECORD_SIGNATURE)
    ) {
      return undefined;
    }

    const extraFieldLength = fixedLengthBuffer.readUInt32LE(4);
    const extraFieldData = Buffer.allocUnsafe(extraFieldLength);
    if (extraFieldLength > 0) {
      await fileHandle.read({
        buffer: extraFieldData,
        position: position + fixedLengthBuffer.length,
      });
    }

    return new ArchiveExtraDataRecord({
      raw: Buffer.concat([fixedLengthBuffer, extraFieldData]),
      extraFieldLength,
      extraFieldData,
    });
  }
}
