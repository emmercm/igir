import { crc32 } from '@node-rs/crc32';

import BananaSplit from './bananaSplit/bananaSplit.js';
import { CompressionMethod } from './bananaSplit/fileRecord.js';

export default class TorrentZipValidator {
  private static readonly MODIFIED_TIME_MS = new Date('1996-12-24T23:32:00').getTime();

  static async validate(bananaSplit: BananaSplit): Promise<boolean> {
    // TODO(cemmer): pass in an expected set of files? Including name, CRC32, and uncompressed size
    // TODO(cemmer): validate what the non-zip64 info looks like when zip64 is present

    const eocd = await bananaSplit.endOfCentralDirectoryRecord();
    if (
      eocd.diskNumber !== 0 ||
      eocd.centralDirectoryDiskStart !== 0 ||
      eocd.centralDirectoryDiskRecordsCount !== eocd.centralDirectoryTotalRecordsCount ||
      eocd.comment.length !== 22 ||
      !eocd.comment.startsWith('TORRENTZIPPED-') ||
      (eocd.zip64Record &&
        (eocd.zip64Record.diskNumber !== 0 ||
          eocd.zip64Record.centralDirectoryDiskStart !== 0 ||
          eocd.zip64Record.centralDirectoryDiskRecordsCount !==
            eocd.zip64Record.centralDirectoryTotalRecordsCount ||
          eocd.zip64Record.comment !== '' ||
          eocd.zip64Record.versionMadeBy !== 45 ||
          eocd.zip64Record.versionNeeded !== 45))
    ) {
      return false;
    }

    const centralDirectoryFileHeaders = await bananaSplit.centralDirectoryFileHeaders();
    if (
      centralDirectoryFileHeaders.some((fileHeader) => {
        return (
          fileHeader.versionMadeBy !== 0 ||
          !(
            fileHeader.versionNeeded === 20 ||
            (fileHeader.versionNeeded === 45 && eocd.zip64Record)
          ) ||
          !(
            fileHeader.generalPurposeBitFlag === 0x02 ||
            fileHeader.generalPurposeBitFlag === (0x02 | 0x8_00)
          ) ||
          fileHeader.compressionMethod !== CompressionMethod.DEFLATE ||
          fileHeader.fileModificationResolved().getTime() !== this.MODIFIED_TIME_MS ||
          fileHeader.fileNameResolved().includes('\\') ||
          !(
            fileHeader.extraFields.size === 0 ||
            (fileHeader.extraFields.size === 1 && fileHeader.extraFields.has(0x00_01))
          ) ||
          fileHeader.fileCommentResolved().length > 0 ||
          fileHeader.fileDiskStartResolved() !== 0 ||
          fileHeader.internalFileAttributes !== 0 ||
          fileHeader.externalFileAttributes !== 0
        );
      })
    ) {
      return false;
    }

    const fileNamesLowerCase = centralDirectoryFileHeaders.map((fileHeader) =>
      fileHeader.fileNameResolved().toLowerCase(),
    );
    if (fileNamesLowerCase !== fileNamesLowerCase.sort()) {
      // Filenames should be sorted by lowercase
      return false;
    }

    const cdfhCrc32 = crc32(
      Buffer.concat(centralDirectoryFileHeaders.map((fileHeader) => fileHeader.raw)),
    )
      .toString(16)
      .padStart(8, '0')
      .toUpperCase();
    if (eocd.comment !== `TORRENTZIPPED-${cdfhCrc32}`) {
      return false;
    }

    let expectedOffset = 0;
    for (const centralDirectoryFileHeader of centralDirectoryFileHeaders) {
      const localFileHeader = await centralDirectoryFileHeader.localFileHeader();

      if (
        localFileHeader.getLocalFileDataRelativeOffset() !==
        centralDirectoryFileHeader.localFileHeaderRelativeOffsetResolved() +
          localFileHeader.raw.length
      ) {
        // There should be no extra data between a local file header and its data,
        // e.g. an encryption header
        return false;
      }
      if (centralDirectoryFileHeader.localFileHeaderRelativeOffsetResolved() !== expectedOffset) {
        // There should be no extra data between file data and the next local file header,
        // e.g. a data descriptor
        return false;
      }
      expectedOffset += localFileHeader.raw.length + localFileHeader.compressedSizeResolved();

      if (
        !(
          localFileHeader.versionNeeded === 20 ||
          (localFileHeader.versionNeeded === 45 && eocd.zip64Record)
        ) ||
        !(
          localFileHeader.generalPurposeBitFlag === 0x02 ||
          localFileHeader.generalPurposeBitFlag === (0x02 | 0x8_00) // UTF-8 encoding
        ) ||
        localFileHeader.compressionMethod !== CompressionMethod.DEFLATE ||
        localFileHeader.fileModificationResolved().getTime() !== this.MODIFIED_TIME_MS ||
        localFileHeader.uncompressedCrc32String() !==
          centralDirectoryFileHeader.uncompressedCrc32String() ||
        localFileHeader.compressedSizeResolved() !==
          centralDirectoryFileHeader.compressedSizeResolved() ||
        localFileHeader.uncompressedSizeResolved() !==
          centralDirectoryFileHeader.uncompressedSizeResolved() ||
        localFileHeader.fileNameResolved() !== centralDirectoryFileHeader.fileNameResolved() ||
        !(
          localFileHeader.extraFields.size === 0 ||
          (localFileHeader.extraFields.size === 1 && localFileHeader.extraFields.has(0x00_01))
        )
      ) {
        return false;
      }
    }

    if (expectedOffset !== eocd.centralDirectoryOffsetResolved()) {
      // There should be no extra data between the last file data and the first central directory
      // header, e.g. an archive decryption header or archive extra data record
      return false;
    }

    return true;
  }
}
