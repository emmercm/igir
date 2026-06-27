import type fs from 'node:fs';

export interface IDataDescriptor {
  raw: Buffer<ArrayBuffer>;
  signaturePresent: boolean;
  uncompressedCrc32: Buffer<ArrayBuffer>;
  compressedSize: number;
  uncompressedSize: number;
}

/**
 * A data descriptor that follows a local file's data when general purpose bit 3 is set, carrying
 * the CRC32 and sizes that weren't known when the local file header was written.
 * @see https://en.wikipedia.org/wiki/ZIP_(file_format)#Data_descriptor
 */
export default class DataDescriptor {
  static readonly DATA_DESCRIPTOR_SIGNATURE = Buffer.from('08074b50', 'hex').toReversed();

  // The largest possible descriptor: signature (4) + CRC32 (4) + two 8-byte zip64 sizes (16).
  private static readonly MAX_DATA_DESCRIPTOR_SIZE = 24;

  readonly raw: Buffer<ArrayBuffer>;
  readonly signaturePresent: boolean;
  readonly uncompressedCrc32: Buffer<ArrayBuffer>;
  readonly compressedSize: number;
  readonly uncompressedSize: number;

  private constructor(props: IDataDescriptor) {
    this.raw = props.raw;
    this.signaturePresent = props.signaturePresent;
    this.uncompressedCrc32 = props.uncompressedCrc32;
    this.compressedSize = props.compressedSize;
    this.uncompressedSize = props.uncompressedSize;
  }

  /**
   * Parse the data descriptor that follows the local file's data.
   */
  static async fromFileHandle(
    fileHandle: fs.promises.FileHandle,
    position: number,
    isZip64: boolean,
  ): Promise<DataDescriptor> {
    const buffer = Buffer.allocUnsafe(this.MAX_DATA_DESCRIPTOR_SIZE);
    const { bytesRead } = await fileHandle.read({ buffer, position });
    const descriptor = buffer.subarray(0, bytesRead);

    // The signature is optional; only consume it when present.
    const isSignaturePresent = descriptor
      .subarray(0, this.DATA_DESCRIPTOR_SIGNATURE.length)
      .equals(this.DATA_DESCRIPTOR_SIGNATURE);
    let offset = isSignaturePresent ? this.DATA_DESCRIPTOR_SIGNATURE.length : 0;

    const uncompressedCrc32 = Buffer.from(descriptor.subarray(offset, offset + 4));
    offset += 4;

    // ZIP64 format archives use 8-byte sizes.
    const compressedSize = isZip64
      ? Number(descriptor.readBigUInt64LE(offset))
      : descriptor.readUInt32LE(offset);
    offset += isZip64 ? 8 : 4;
    const uncompressedSize = isZip64
      ? Number(descriptor.readBigUInt64LE(offset))
      : descriptor.readUInt32LE(offset);
    offset += isZip64 ? 8 : 4;

    return new DataDescriptor({
      raw: Buffer.from(descriptor.subarray(0, offset)),
      signaturePresent: isSignaturePresent,
      uncompressedCrc32,
      compressedSize,
      uncompressedSize,
    });
  }

  /**
   * Return the numerical CRC32.
   */
  uncompressedCrc32Number(): number {
    return this.uncompressedCrc32.readUInt32LE();
  }

  /**
   * Return the lowercased and padded CRC32 string.
   */
  uncompressedCrc32String(): string {
    return this.uncompressedCrc32Number().toString(16).toLowerCase().padStart(8, '0');
  }
}
