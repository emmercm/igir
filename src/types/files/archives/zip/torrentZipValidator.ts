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
      eocd.getCentralDirectoryDiskRecordsCount() !== eocd.getCentralDirectoryTotalRecordsCount() ||
      eocd.getCentralDirectoryDiskStart() !== 0 ||
      eocd.getComment().length !== 22 ||
      !eocd.getComment().startsWith('TORRENTZIPPED-') ||
      eocd.getDiskNumber() !== 0 ||
      (eocd.getZip64Record() &&
        (eocd.getZip64Record()?.versionMadeBy !== 45 ||
          eocd.getZip64Record()?.versionNeeded !== 45))
    ) {
      return false;
    }

    const centralDirectoryFileHeaders = await bananaSplit.centralDirectoryFileHeaders();
    if (
      centralDirectoryFileHeaders.some((fileHeader) => {
        return (
          fileHeader.getVersionMadeBy() !== 0 ||
          !(
            fileHeader.getVersionNeeded() === 20 ||
            (fileHeader.getVersionNeeded() === 45 && eocd.getZip64Record())
          ) ||
          !(
            fileHeader.getGeneralPurposeBitFlag() === 0x02 ||
            fileHeader.getGeneralPurposeBitFlag() === (0x02 | 0x8_00)
          ) ||
          fileHeader.getCompressionMethod() !== CompressionMethod.DEFLATE ||
          fileHeader.getFileModification().getTime() !== this.MODIFIED_TIME_MS ||
          fileHeader.getFileName().includes('\\') ||
          !(
            fileHeader.getExtraFields().size === 0 ||
            (fileHeader.getExtraFields().size === 1 && fileHeader.getExtraFields().has(0x00_01))
          ) ||
          fileHeader.getFileComment().length > 0 ||
          fileHeader.getFileDiskStart() !== 0 ||
          fileHeader.getInternalFileAttributes() !== 0 ||
          fileHeader.getExternalFileAttributes() !== 0
        );
      })
    ) {
      return false;
    }

    const fileNamesLowerCase = centralDirectoryFileHeaders.map((fileHeader) =>
      fileHeader.getFileName().toLowerCase(),
    );
    if (fileNamesLowerCase !== fileNamesLowerCase.sort()) {
      // Filenames should be sorted by lowercase
      return false;
    }

    const cdfhCrc32 = crc32(
      Buffer.concat(centralDirectoryFileHeaders.map((fileHeader) => fileHeader.getRaw())),
    )
      .toString(16)
      .padStart(8, '0')
      .toUpperCase();
    if (eocd.getComment() !== `TORRENTZIPPED-${cdfhCrc32}`) {
      return false;
    }

    let expectedOffset = 0;
    for (const centralDirectoryFileHeader of centralDirectoryFileHeaders) {
      const localFileHeader = await centralDirectoryFileHeader.localFileHeader();

      if (
        localFileHeader.getLocalFileDataRelativeOffset() !==
        centralDirectoryFileHeader.getLocalFileHeaderRelativeOffset() +
          localFileHeader.getRaw().length
      ) {
        // There should be no extra data between a local file header and its data,
        // e.g. an encryption header
        return false;
      }
      if (centralDirectoryFileHeader.getLocalFileHeaderRelativeOffset() !== expectedOffset) {
        // There should be no extra data between file data and the next local file header,
        // e.g. a data descriptor
        return false;
      }
      expectedOffset += localFileHeader.getRaw().length + localFileHeader.getCompressedSize();

      if (
        !(
          localFileHeader.getVersionNeeded() === 20 ||
          (localFileHeader.getVersionNeeded() === 45 && eocd.getZip64Record())
        ) ||
        !(
          localFileHeader.getGeneralPurposeBitFlag() === 0x02 ||
          localFileHeader.getGeneralPurposeBitFlag() === (0x02 | 0x8_00) // UTF-8 encoding
        ) ||
        localFileHeader.getCompressionMethod() !== CompressionMethod.DEFLATE ||
        localFileHeader.getFileModification().getTime() !== this.MODIFIED_TIME_MS ||
        localFileHeader.getUncompressedCrc32() !==
          centralDirectoryFileHeader.getUncompressedCrc32() ||
        localFileHeader.getCompressedSize() !== centralDirectoryFileHeader.getCompressedSize() ||
        localFileHeader.getUncompressedSize() !==
          centralDirectoryFileHeader.getUncompressedSize() ||
        localFileHeader.getFileName() !== centralDirectoryFileHeader.getFileName() ||
        !(
          localFileHeader.getExtraFields().size === 0 ||
          (localFileHeader.getExtraFields().size === 1 &&
            localFileHeader.getExtraFields().has(0x00_01))
        )
      ) {
        return false;
      }
    }

    if (expectedOffset !== eocd.getCentralDirectoryOffset()) {
      // There should be no extra data between the last file data and the first central directory
      // header, e.g. an archive decryption header or archive extra data record
      return false;
    }

    return true;
  }
}
