import { crc32 } from '@node-rs/crc32';

import BananaSplit from '../bananaSplit/bananaSplit.js';
import { CompressionMethod } from '../bananaSplit/fileRecord.js';

export default {
  async validate(bananaSplit: BananaSplit): Promise<boolean> {
    // TODO(cemmer): pass in an expected set of files? Including name, CRC32, and uncompressed size

    // Validate very basic points in the EOCD
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
    for (const cdFileHeader of centralDirectoryFileHeaders) {
      // Validate very basic points in the CDFH
      if (
        cdFileHeader.versionMadeBy !== 0 ||
        (cdFileHeader.zip64ExtendedInformation === undefined &&
          cdFileHeader.versionNeeded !== 20) ||
        (cdFileHeader.zip64ExtendedInformation !== undefined &&
          cdFileHeader.versionNeeded !== 45) ||
        !(
          cdFileHeader.generalPurposeBitFlag === 0x02 ||
          cdFileHeader.generalPurposeBitFlag === (0x02 | 0x8_00)
        ) ||
        cdFileHeader.compressionMethod !== CompressionMethod.DEFLATE ||
        cdFileHeader.fileModificationTime !== 48_128 ||
        cdFileHeader.fileModificationDate !== 8600 ||
        (cdFileHeader.compressedSize >= 0xff_ff_ff_ff &&
          (cdFileHeader.zip64ExtendedInformation?.compressedSize ?? 0) <
            cdFileHeader.compressedSize) ||
        (cdFileHeader.uncompressedSize >= 0xff_ff_ff_ff &&
          (cdFileHeader.zip64ExtendedInformation?.uncompressedSize ?? 0) <
            cdFileHeader.uncompressedSize) ||
        cdFileHeader.fileNameResolved().includes('\\') ||
        !(
          cdFileHeader.extraFields.size === 0 ||
          (cdFileHeader.extraFields.size === 1 && cdFileHeader.extraFields.has(0x00_01))
        ) ||
        cdFileHeader.fileComment.length > 0 ||
        cdFileHeader.fileDiskStart !== 0 ||
        cdFileHeader.internalFileAttributes !== 0 ||
        cdFileHeader.externalFileAttributes !== 0
      ) {
        return false;
      }
    }

    // Validate filename sorting
    const fileNamesLowerCase = centralDirectoryFileHeaders.map((fileHeader) =>
      fileHeader.fileNameResolved().toLowerCase(),
    );
    if (fileNamesLowerCase !== fileNamesLowerCase.sort()) {
      return false;
    }

    // Validate the zip comment
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

      // Validate very basic points in the LFH
      if (
        (localFileHeader.zip64ExtendedInformation === undefined &&
          localFileHeader.versionNeeded !== 20) ||
        (localFileHeader.zip64ExtendedInformation !== undefined &&
          localFileHeader.versionNeeded !== 45) ||
        !(
          localFileHeader.generalPurposeBitFlag === 0x02 ||
          localFileHeader.generalPurposeBitFlag === (0x02 | 0x8_00)
        ) ||
        localFileHeader.compressionMethod !== CompressionMethod.DEFLATE ||
        localFileHeader.fileModificationTime !== 48_128 ||
        localFileHeader.fileModificationDate !== 8600 ||
        !localFileHeader.uncompressedCrc32.equals(centralDirectoryFileHeader.uncompressedCrc32) ||
        localFileHeader.compressedSize !== centralDirectoryFileHeader.compressedSize ||
        localFileHeader.zip64ExtendedInformation?.compressedSize !==
          centralDirectoryFileHeader.zip64ExtendedInformation?.compressedSize ||
        localFileHeader.uncompressedSize !== centralDirectoryFileHeader.uncompressedSize ||
        localFileHeader.zip64ExtendedInformation?.uncompressedSize !==
          centralDirectoryFileHeader.zip64ExtendedInformation?.uncompressedSize ||
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
  },
};
