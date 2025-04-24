import CP437Decoder from './cp437Decoder.js';
import { IZip64ExtendedInformation } from './fileRecordUtil.js';
import TimestampUtil from './timestampUtil.js';

export interface IFileRecord {
  raw: Buffer<ArrayBuffer>;

  versionNeeded: number;
  generalPurposeBitFlag: number;
  compressionMethod: CompressionMethodValue;
  fileModificationTime: number;
  fileModificationDate: number;
  uncompressedCrc32: Buffer<ArrayBuffer>;
  compressedSize: number;
  uncompressedSize: number;
  fileNameLength: number;
  extraFieldLength: number;
  fileName: Buffer<ArrayBuffer>;
  extraFields: Map<number, Buffer<ArrayBuffer>>;

  zip64ExtendedInformation?: IZip64ExtendedInformation;
}

export const CompressionMethod = {
  STORE: 0,
  SHRUNK: 1,
  REDUCED_FACTOR_1: 2,
  REDUCED_FACTOR_2: 3,
  REDUCED_FACTOR_3: 4,
  REDUCED_FACTOR_4: 5,
  IMPLODE: 6,
  DEFLATE: 8,
  DEFLATE64: 9,
  PKWARE_IMPLODE: 10,
  BZIP2: 12,
  LZMA: 14,
  IBM_CMPSC: 16,
  IBM_TERSE: 18,
  IBM_LZ77: 19,
  ZSTD_DEPRECATED: 20,
  ZSTD: 93,
  MP3: 94,
  XZ: 95,
  JPEG_VARIANT: 96,
  WAVPACK: 97,
  PPMD: 98,
  AE_X: 99,
} as const;
export type CompressionMethodKey = keyof typeof CompressionMethod;
export type CompressionMethodValue = (typeof CompressionMethod)[CompressionMethodKey];
export const CompressionMethodInverted = Object.fromEntries(
  Object.entries(CompressionMethod).map(([key, value]) => [value, key]),
) as Record<CompressionMethodValue, CompressionMethodKey>;

export default class FileRecord {
  private readonly raw: Buffer<ArrayBuffer>;

  private readonly versionNeeded: number;
  private readonly generalPurposeBitFlag: number;
  private readonly compressionMethod: CompressionMethodValue;
  private readonly fileModificationTime: number;
  private readonly fileModificationDate: number;
  private readonly uncompressedCrc32: Buffer<ArrayBuffer>;
  private readonly compressedSize: number;
  private readonly uncompressedSize: number;
  private readonly fileNameLength: number;
  private readonly extraFieldLength: number;
  private readonly fileName: Buffer<ArrayBuffer>;
  private readonly extraFields: Map<number, Buffer<ArrayBuffer>>;

  private readonly zip64ExtendedInformation?: IZip64ExtendedInformation;

  constructor(props: IFileRecord) {
    this.raw = props.raw;

    this.versionNeeded = props.versionNeeded;
    this.generalPurposeBitFlag = props.generalPurposeBitFlag;
    this.compressionMethod = props.compressionMethod;
    this.fileModificationTime = props.fileModificationTime;
    this.fileModificationDate = props.fileModificationDate;
    this.uncompressedCrc32 = props.uncompressedCrc32;
    this.compressedSize = props.compressedSize;
    this.uncompressedSize = props.uncompressedSize;
    this.fileNameLength = props.fileNameLength;
    this.extraFieldLength = props.extraFieldLength;
    this.fileName = props.fileName;
    this.extraFields = props.extraFields;

    this.zip64ExtendedInformation = props.zip64ExtendedInformation;
  }

  getRaw(): Buffer<ArrayBuffer> {
    return this.raw;
  }

  getVersionNeeded(): number {
    return this.versionNeeded;
  }

  getGeneralPurposeBitFlag(): number {
    return this.generalPurposeBitFlag;
  }

  getCompressionMethod(): CompressionMethodValue {
    return this.compressionMethod;
  }

  getFileModification(): Date {
    // TODO(cemmer): 0x000d UNIX timestamp
    // TODO(cemmer): 0x7855 unix extra field new?
    return (
      TimestampUtil.parseExtendedTimestamp(this.extraFields.get(0x54_55))?.modified ??
      TimestampUtil.parseUnixExtraTimestamp(this.extraFields.get(0x58_55))?.modified ??
      TimestampUtil.parseNtfsExtraTimestamp(this.extraFields.get(0x00_0a))?.modified ??
      TimestampUtil.parseDOSTimestamp(this.fileModificationTime, this.fileModificationDate)
    );
  }

  getUncompressedCrc32(): string {
    return Buffer.from(this.uncompressedCrc32).reverse().toString('hex').toLowerCase();
  }

  getCompressedSize(): number {
    return (
      this.zip64ExtendedInformation?.compressedSize ??
      this.compressedSize - (this.isEncrypted() ? 12 : 0)
    );
  }

  getUncompressedSize(): number {
    return this.zip64ExtendedInformation?.uncompressedSize ?? this.uncompressedSize;
  }

  getFileName(): string {
    return (
      // Info-ZIP Unicode Path Extra Field
      this.extraFields.get(0x70_75)?.subarray(5).toString('utf8') ??
      (this.generalPurposeBitFlag & 0x8_00
        ? this.fileName.toString('utf8')
        : CP437Decoder.decode(this.fileName))
    );
  }

  getExtraFields(): Map<number, Buffer<ArrayBuffer>> {
    return this.extraFields;
  }

  getZip64ExtendedInformation(): IZip64ExtendedInformation | undefined {
    return this.zip64ExtendedInformation;
  }

  isEncrypted(): boolean {
    return (this.generalPurposeBitFlag & 0x01) !== 0;
  }

  hasDataDescriptor(): boolean {
    return (this.generalPurposeBitFlag & 0x08) !== 0;
  }

  isDirectory(): boolean {
    return this.getFileName().endsWith('/');
  }
}
