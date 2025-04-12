import fs from 'node:fs';

import FileRecord, { IFileRecord } from './fileRecord.js';

export interface ILocalFileRecord extends IFileRecord {
  localFileDataRelativeOffset: number;
}

export default class LocalFileRecord extends FileRecord implements ILocalFileRecord {
  public static readonly LOCAL_FILE_HEADER_SIGNATURE = Buffer.from('04034b50', 'hex').reverse();
  public static readonly DATA_DESCRIPTOR_SIGNATURE = Buffer.from('08074b50', 'hex').reverse();

  private static readonly FIELD_OFFSETS = {
    versionNeeded: 4,
    generalPurposeBitFlag: 6,
    compressionMethod: 8,
    modifiedTime: 10,
    modifiedDate: 12,
    uncompressedCrc32: 14,
    compressedSize: 18,
    uncompressedSize: 22,
    fileNameLength: 26,
    extraFieldLength: 28,
    fileName: 30,
  } as const;

  readonly localFileDataRelativeOffset: number;

  protected constructor(props: ILocalFileRecord) {
    super(props);
    this.localFileDataRelativeOffset = props.localFileDataRelativeOffset;
  }

  static async localFileRecordFromFileHandle(
    fileHandle: fs.promises.FileHandle,
    localFileHeaderRelativeOffset: number,
  ): Promise<LocalFileRecord> {
    const fileRecord = await FileRecord.fileRecordFromFileHandle(
      fileHandle,
      localFileHeaderRelativeOffset,
      this.FIELD_OFFSETS,
    );

    return new LocalFileRecord({
      ...fileRecord,
      localFileDataRelativeOffset:
        localFileHeaderRelativeOffset +
        this.FIELD_OFFSETS.fileName +
        fileRecord.fileNameLength +
        fileRecord.extraFieldLength,
    });
  }
}
