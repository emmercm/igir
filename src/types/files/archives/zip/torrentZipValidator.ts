import BananaSplit from './bananaSplit/bananaSplit.js';
import { CompressionMethod } from './bananaSplit/fileRecord.js';

export default class TorrentZipValidator {
  private static readonly MODIFIED_TIME_MS = new Date('1996-12-24T23:32:00').getTime();

  static async validate(bananaSplit: BananaSplit): Promise<boolean> {
    const eocd = await bananaSplit.endOfCentralDirectoryRecord();
    if (
      eocd.diskNumber !== 0 ||
      eocd.centralDirectoryDiskStart !== 0 ||
      eocd.comment.length !== 22
    ) {
      return false;
    }

    // TODO(cemmer): validate comment

    const centralDirectoryFileHeaders = await bananaSplit.centralDirectoryFileHeaders();
    if (
      centralDirectoryFileHeaders.some((fileHeader) => {
        return (
          fileHeader.versionMadeBy !== 0 ||
          fileHeader.versionNeeded !== 0 || // TODO(cemmer)
          !(
            fileHeader.generalPurposeBitFlag === 0x02 ||
            fileHeader.generalPurposeBitFlag === (0x02 | 0x8_00)
          ) ||
          fileHeader.compressionMethod !== CompressionMethod.DEFLATE ||
          fileHeader.timestamps.modified?.getTime() !== this.MODIFIED_TIME_MS ||
          // TODO(cemmer): CRC32?
          // TODO(cemmer): compressed size
          // TODO(cemmer): uncompressed size
          // TODO(cemmer): filename
          !(
            fileHeader.extraFields.size === 0 ||
            (fileHeader.extraFields.size === 1 && fileHeader.extraFields.has(0x00_01))
          ) ||
          fileHeader.fileComment.length > 0 ||
          fileHeader.fileDiskStart !== 0 ||
          fileHeader.internalFileAttributes !== 0 ||
          fileHeader.externalFileAttributes !== 0
        );
      })
    ) {
      return false;
    }

    for (const centralDirectoryFileHeader of centralDirectoryFileHeaders) {
      const localFileHeader = await centralDirectoryFileHeader.localFileHeader();
      if (
        !(
          localFileHeader.versionNeeded === 20 ||
          (localFileHeader.versionNeeded === 45 && eocd.isZip64())
        ) ||
        !(
          localFileHeader.generalPurposeBitFlag === 0x02 ||
          localFileHeader.generalPurposeBitFlag === (0x02 | 0x8_00)
        ) ||
        localFileHeader.compressionMethod !== CompressionMethod.DEFLATE ||
        localFileHeader.timestamps.modified?.getTime() !== this.MODIFIED_TIME_MS ||
        localFileHeader.uncompressedCrc32 !== centralDirectoryFileHeader.uncompressedCrc32 ||
        localFileHeader.compressedSize !== centralDirectoryFileHeader.compressedSize ||
        localFileHeader.uncompressedSize !== centralDirectoryFileHeader.uncompressedSize ||
        localFileHeader.fileName !== centralDirectoryFileHeader.fileName ||
        !(
          localFileHeader.extraFields.size === 0 ||
          (localFileHeader.extraFields.size === 1 && localFileHeader.extraFields.has(0x00_01))
        )
      ) {
        return false;
      }
    }

    // TODO(cemmer): validate entries count
    // TODO(cemmer): validate zip file comment

    return true;
  }
}
