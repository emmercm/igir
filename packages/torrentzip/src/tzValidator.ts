import CRC32 from 'crc-32';

import type { ZipReader } from '../../zip/index.js';
import { CompressionMethod } from '../../zip/index.js';
import CP437Encoder from './cp437Encoder.js';

export const ValidationResult = {
  VALID_TORRENTZIP: 1,
  VALID_RVZSTD: 2,
  INVALID: 3,
} as const;
export type ValidationResultKey = keyof typeof ValidationResult;
export type ValidationResultValue = (typeof ValidationResult)[ValidationResultKey];
export const ValidationResultInverted = Object.fromEntries(
  Object.entries(ValidationResult).map(([key, value]) => [value, key]),
) as Record<ValidationResultValue, ValidationResultKey>;

/**
 * Validate TorrentZip files.
 */
export default {
  /**
   * Validate if the file is a valid TorrentZip file.
   */
  async validate(zipReader: ZipReader): Promise<ValidationResultValue> {
    // TODO(cemmer): pass in an expected set of files? Including name, CRC32, and uncompressed size

    // Validate very basic points in the EOCD
    const eocd = await zipReader.endOfCentralDirectoryRecord();
    if (
      eocd.diskNumber !== 0 ||
      eocd.centralDirectoryDiskStart !== 0 ||
      eocd.centralDirectoryDiskRecordsCount !== eocd.centralDirectoryTotalRecordsCount ||
      !(
        (eocd.comment.startsWith('TORRENTZIPPED-') && eocd.comment.length === 22) ||
        (eocd.comment.startsWith('RVZSTD-') && eocd.comment.length === 15)
      ) ||
      (eocd.zip64Record &&
        (eocd.zip64Record.diskNumber !== 0 ||
          eocd.zip64Record.centralDirectoryDiskStart !== 0 ||
          eocd.zip64Record.centralDirectoryDiskRecordsCount !==
            eocd.zip64Record.centralDirectoryTotalRecordsCount ||
          eocd.zip64Record.comment !== '' ||
          eocd.zip64Record.versionMadeBy !== 45 ||
          eocd.zip64Record.versionNeeded !== 45))
    ) {
      return ValidationResult.INVALID;
    }

    const centralDirectoryFileHeaders = await zipReader.centralDirectoryFileHeaders();
    const isRvZstd = centralDirectoryFileHeaders.some(
      (cdfh) => cdfh.compressionMethod !== CompressionMethod.DEFLATE,
    );

    for (const cdFileHeader of centralDirectoryFileHeaders) {
      if (
        (isRvZstd &&
          cdFileHeader.compressionMethod !== CompressionMethod.ZSTD &&
          cdFileHeader.compressionMethod !== CompressionMethod.STORE) ||
        (!isRvZstd && cdFileHeader.compressionMethod !== CompressionMethod.DEFLATE)
      ) {
        // Not a valid compression method
        return ValidationResult.INVALID;
      }

      if (
        !(
          (cdFileHeader.compressionMethod === CompressionMethod.DEFLATE &&
            ((cdFileHeader.zip64ExtendedInformation === undefined &&
              cdFileHeader.versionNeeded === 20) ||
              (cdFileHeader.zip64ExtendedInformation !== undefined &&
                cdFileHeader.versionNeeded === 45))) ||
          (cdFileHeader.compressionMethod === CompressionMethod.ZSTD &&
            cdFileHeader.versionNeeded === 63) ||
          (cdFileHeader.compressionMethod === CompressionMethod.STORE &&
            cdFileHeader.versionNeeded === 20)
        ) ||
        !(
          cdFileHeader.generalPurposeBitFlag === 0x02 ||
          (cdFileHeader.generalPurposeBitFlag === (0x02 | 0x8_00) &&
            !CP437Encoder.canEncode(cdFileHeader.fileNameResolved()))
        ) ||
        !(
          (cdFileHeader.compressionMethod === CompressionMethod.DEFLATE &&
            cdFileHeader.fileModificationTime === 48_128 &&
            cdFileHeader.fileModificationDate === 8600) ||
          (cdFileHeader.compressionMethod === CompressionMethod.ZSTD &&
            cdFileHeader.fileModificationTime === 0 &&
            cdFileHeader.fileModificationDate === 0) ||
          (cdFileHeader.compressionMethod === CompressionMethod.STORE &&
            cdFileHeader.fileModificationTime === 0 &&
            cdFileHeader.fileModificationDate === 0)
        ) ||
        (cdFileHeader.compressedSize >= 0xff_ff_ff_ff &&
          (cdFileHeader.zip64ExtendedInformation?.compressedSize ?? 0) <
            cdFileHeader.compressedSize) ||
        (cdFileHeader.uncompressedSize >= 0xff_ff_ff_ff &&
          (cdFileHeader.zip64ExtendedInformation?.uncompressedSize ?? 0) <
            cdFileHeader.uncompressedSize) ||
        (cdFileHeader.compressionMethod === CompressionMethod.STORE &&
          cdFileHeader.uncompressedSize !== 0) ||
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
        return ValidationResult.INVALID;
      }
    }

    // Validate filename sorting
    const fileNamesLowerCase = centralDirectoryFileHeaders.map((fileHeader) =>
      fileHeader.fileNameResolved().toLowerCase(),
    );
    const fileNamesLowerCaseSorted = fileNamesLowerCase.toSorted((a, b) => {
      if (a < b) {
        return -1;
      } else if (a > b) {
        return 1;
      }
      return 0;
    });
    if (fileNamesLowerCase.some((name, i) => name !== fileNamesLowerCaseSorted[i])) {
      return ValidationResult.INVALID;
    }

    // Validate the zip comment
    let crc32 = 0;
    for (const fileHeader of centralDirectoryFileHeaders) {
      crc32 = CRC32.buf(fileHeader.raw, crc32);
    }
    const cdfhCrc32 = (crc32 >>> 0).toString(16).padStart(8, '0').toUpperCase();
    if (
      (!isRvZstd && eocd.comment !== `TORRENTZIPPED-${cdfhCrc32}`) ||
      (isRvZstd && eocd.comment !== `RVZSTD-${cdfhCrc32}`)
    ) {
      return ValidationResult.INVALID;
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
        return ValidationResult.INVALID;
      }
      if (centralDirectoryFileHeader.localFileHeaderRelativeOffsetResolved() !== expectedOffset) {
        // There should be no extra data between file data and the next local file header,
        // e.g. a data descriptor
        return ValidationResult.INVALID;
      }
      expectedOffset += localFileHeader.raw.length + localFileHeader.compressedSizeResolved();

      if (
        localFileHeader.versionNeeded !== centralDirectoryFileHeader.versionNeeded ||
        localFileHeader.generalPurposeBitFlag !==
          centralDirectoryFileHeader.generalPurposeBitFlag ||
        localFileHeader.compressionMethod !== centralDirectoryFileHeader.compressionMethod ||
        localFileHeader.fileModificationTime !== centralDirectoryFileHeader.fileModificationTime ||
        localFileHeader.fileModificationDate !== centralDirectoryFileHeader.fileModificationDate ||
        !localFileHeader.uncompressedCrc32.equals(centralDirectoryFileHeader.uncompressedCrc32) ||
        // TorrentZip LFH sizes can differ from the CDFH when zip64
        !(
          (localFileHeader.compressedSize === 0xff_ff_ff_ff &&
            localFileHeader.zip64ExtendedInformation?.compressedSize !== undefined &&
            ((localFileHeader.zip64ExtendedInformation.compressedSize >= 0xff_ff_ff_ff &&
              localFileHeader.zip64ExtendedInformation.compressedSize ===
                centralDirectoryFileHeader.zip64ExtendedInformation?.compressedSize) ||
              (localFileHeader.zip64ExtendedInformation.compressedSize < 0xff_ff_ff_ff &&
                localFileHeader.zip64ExtendedInformation.compressedSize ===
                  centralDirectoryFileHeader.compressedSize))) ||
          (localFileHeader.compressedSize < 0xff_ff_ff_ff &&
            localFileHeader.compressedSize === centralDirectoryFileHeader.compressedSize)
        ) ||
        !(
          (localFileHeader.uncompressedSize === 0xff_ff_ff_ff &&
            localFileHeader.zip64ExtendedInformation?.uncompressedSize !== undefined &&
            ((localFileHeader.zip64ExtendedInformation.uncompressedSize >= 0xff_ff_ff_ff &&
              localFileHeader.zip64ExtendedInformation.uncompressedSize ===
                centralDirectoryFileHeader.zip64ExtendedInformation?.uncompressedSize) ||
              (localFileHeader.zip64ExtendedInformation.uncompressedSize < 0xff_ff_ff_ff &&
                localFileHeader.zip64ExtendedInformation.uncompressedSize ===
                  centralDirectoryFileHeader.uncompressedSize))) ||
          (localFileHeader.uncompressedSize < 0xff_ff_ff_ff &&
            localFileHeader.uncompressedSize === centralDirectoryFileHeader.uncompressedSize)
        ) ||
        // If one of the sizes exceeds 0xFFFFFFFF, then they must both be clamped
        (localFileHeader.uncompressedSize === 0xff_ff_ff_ff &&
          localFileHeader.compressedSize !== 0xff_ff_ff_ff) ||
        (localFileHeader.compressedSize === 0xff_ff_ff_ff &&
          localFileHeader.uncompressedSize !== 0xff_ff_ff_ff) ||
        localFileHeader.fileNameResolved() !== centralDirectoryFileHeader.fileNameResolved() ||
        !(
          localFileHeader.extraFields.size === 0 ||
          (localFileHeader.extraFields.size === 1 && localFileHeader.extraFields.has(0x00_01))
        )
      ) {
        return ValidationResult.INVALID;
      }
    }

    if (expectedOffset !== eocd.centralDirectoryOffsetResolved()) {
      // There should be no extra data between the last file data and the first central directory
      // header, e.g. an archive decryption header or archive extra data record
      return ValidationResult.INVALID;
    }

    return isRvZstd ? ValidationResult.VALID_RVZSTD : ValidationResult.VALID_TORRENTZIP;
  },
};
