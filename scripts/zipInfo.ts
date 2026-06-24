/**
 * Prints YAML describing every field of a zip file to stdout, in the same order the records
 * physically appear in the archive, per APPNOTE.TXT:
 *
 *   [local file header / encryption header / file data / data descriptor] for each entry
 *   [archive decryption header]
 *   [archive extra data record]
 *   [central directory header] for each entry
 *   [zip64 end of central directory record]
 *   [zip64 end of central directory locator]
 *   [end of central directory record]
 *
 * A preamble before the first local file header is also surfaced. Records that should NOT be
 * present in a TorrentZip archive (encryption headers, data descriptors, archive decryption
 * headers, archive extra data records) are reported so they show up in a diff.
 *
 * All zip parsing is delegated to packages/zip; this script only re-serializes what it parses, and
 * reads opaque byte regions (encryption headers, archive decryption headers) that have no
 * parseable structure. Insertion-ordered Maps are used throughout so the emitted field order is
 * guaranteed.
 *
 * Usage: tsx scripts/zipInfo.ts <path/to/file.zip>
 */

import fs from 'node:fs';
import process from 'node:process';

import type {
  ArchiveExtraDataRecord,
  CentralDirectoryFileHeader,
  DataDescriptor,
} from '../packages/zip/index.js';
import { CompressionMethodInverted, ZipReader } from '../packages/zip/index.js';
import type EndOfCentralDirectory from '../packages/zip/src/endOfCentralDirectory.js';
import type LocalFileHeader from '../packages/zip/src/localFileHeader.js';

type YamlValue = string | number | boolean | undefined | YamlValue[] | Map<string, YamlValue>;

// The most bytes of any raw region (extra fields, gaps) to print before truncating.
const MAX_REGION_BYTES = 256;

/**
 * Build an insertion-ordered Map so the emitted YAML key order is guaranteed.
 */
function ordered(entries: [string, YamlValue][]): Map<string, YamlValue> {
  return new Map(entries);
}

/**
 * Format a scalar as a valid YAML flow scalar.
 */
function formatScalar(value: string | number | boolean | undefined): string {
  if (value === undefined) {
    return 'null';
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value.toString() : `"${value.toString()}"`;
  }
  // Double-quoting via JSON is always a valid YAML scalar and keeps the output diff-stable.
  return JSON.stringify(value);
}

/**
 * Recursively serialize a value to deterministic YAML.
 */
function toYaml(value: YamlValue, indent: number): string {
  const pad = '  '.repeat(indent);

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return `${pad}[]`;
    }
    return value
      .map((item) => {
        if (item instanceof Map || Array.isArray(item)) {
          return `${pad}-\n${toYaml(item, indent + 1)}`;
        }
        return `${pad}- ${formatScalar(item)}`;
      })
      .join('\n');
  }

  if (value instanceof Map) {
    if (value.size === 0) {
      return `${pad}{}`;
    }
    return [...value.entries()]
      .map(([key, child]) => {
        if (child instanceof Map || Array.isArray(child)) {
          const isEmpty = child instanceof Map ? child.size === 0 : child.length === 0;
          if (isEmpty) {
            return `${pad}${key}: ${Array.isArray(child) ? '[]' : '{}'}`;
          }
          return `${pad}${key}:\n${toYaml(child, indent + 1)}`;
        }
        return `${pad}${key}: ${formatScalar(child)}`;
      })
      .join('\n');
  }

  return `${pad}${formatScalar(value)}`;
}

/**
 * Read a region of the file, capped at MAX_REGION_BYTES, and describe it.
 */
async function describeRegion(
  fileHandle: fs.promises.FileHandle,
  offset: number,
  length: number,
): Promise<Map<string, YamlValue>> {
  const readLength = Math.max(0, Math.min(length, MAX_REGION_BYTES));
  const buffer = Buffer.allocUnsafe(readLength);
  if (readLength > 0) {
    await fileHandle.read({ buffer, position: offset });
  }
  return ordered([
    ['offsetBytes', offset],
    ['lengthBytes', length],
    ['truncated', length > MAX_REGION_BYTES],
    ['bytesHex', buffer.toString('hex')],
  ]);
}

/**
 * Serialize a data descriptor parsed by packages/zip.
 */
function describeDataDescriptor(
  dataDescriptor: DataDescriptor,
  offset: number,
): Map<string, YamlValue> {
  return ordered([
    ['offsetBytes', offset],
    ['lengthBytes', dataDescriptor.raw.length],
    ['signaturePresent', dataDescriptor.signaturePresent],
    ['uncompressedCrc32', dataDescriptor.uncompressedCrc32String()],
    ['compressedSize', dataDescriptor.compressedSize],
    ['uncompressedSize', dataDescriptor.uncompressedSize],
  ]);
}

/**
 * Serialize an archive extra data record parsed by packages/zip.
 */
function describeArchiveExtraDataRecord(
  archiveExtraDataRecord: ArchiveExtraDataRecord,
  offset: number,
): Map<string, YamlValue> {
  return ordered([
    ['offsetBytes', offset],
    ['lengthBytes', archiveExtraDataRecord.raw.length],
    ['extraFieldLength', archiveExtraDataRecord.extraFieldLength],
    [
      'extraFieldDataHex',
      archiveExtraDataRecord.extraFieldData.subarray(0, MAX_REGION_BYTES).toString('hex'),
    ],
  ]);
}

/**
 * Decode the general purpose bit flag into named booleans.
 */
function decodeGeneralPurposeBitFlag(flag: number): Map<string, YamlValue> {
  return ordered([
    ['raw', `0x${flag.toString(16).padStart(4, '0')}`],
    ['encrypted', (flag & 0x00_01) !== 0],
    ['compressionOption1', (flag & 0x00_02) !== 0],
    ['compressionOption2', (flag & 0x00_04) !== 0],
    ['dataDescriptor', (flag & 0x00_08) !== 0],
    ['strongEncryption', (flag & 0x00_40) !== 0],
    ['utf8', (flag & 0x08_00) !== 0],
  ]);
}

/**
 * Serialize a Map of extra fields keyed by header ID into a diffable Map.
 */
function describeExtraFields(
  extraFields: Map<number, Buffer<ArrayBuffer>>,
): Map<string, YamlValue> {
  return ordered(
    [...extraFields.entries()]
      .toSorted((a, b) => a[0] - b[0])
      .map(([headerId, bytes]) => [
        `0x${headerId.toString(16).padStart(4, '0')}`,
        ordered([
          ['lengthBytes', bytes.length],
          ['bytesHex', bytes.subarray(0, MAX_REGION_BYTES).toString('hex')],
        ]),
      ]),
  );
}

/**
 * Serialize the zip64 extended information, if any.
 */
function describeZip64ExtendedInformation(
  record: CentralDirectoryFileHeader | LocalFileHeader,
): YamlValue {
  const zip64 = record.zip64ExtendedInformation;
  if (zip64 === undefined) {
    return undefined;
  }
  return ordered([
    ['uncompressedSize', zip64.uncompressedSize],
    ['compressedSize', zip64.compressedSize],
    ['localFileHeaderRelativeOffset', zip64.localFileHeaderRelativeOffset],
    ['fileDiskStart', zip64.fileDiskStart],
  ]);
}

/**
 * Serialize a local file header.
 */
function describeLocalFileHeader(localFileHeader: LocalFileHeader): Map<string, YamlValue> {
  return ordered([
    ['rawLengthBytes', localFileHeader.raw.length],
    ['versionNeeded', localFileHeader.versionNeeded],
    ['generalPurposeBitFlag', decodeGeneralPurposeBitFlag(localFileHeader.generalPurposeBitFlag)],
    [
      'compressionMethod',
      `${localFileHeader.compressionMethod} (${CompressionMethodInverted[localFileHeader.compressionMethod]})`,
    ],
    ['fileModificationTime', localFileHeader.fileModificationTime],
    ['fileModificationDate', localFileHeader.fileModificationDate],
    ['fileModificationResolved', localFileHeader.fileModificationResolved().toISOString()],
    ['uncompressedCrc32', localFileHeader.uncompressedCrc32String()],
    ['compressedSize', localFileHeader.compressedSize],
    ['uncompressedSize', localFileHeader.uncompressedSize],
    ['compressedSizeResolved', localFileHeader.compressedSizeResolved()],
    ['uncompressedSizeResolved', localFileHeader.uncompressedSizeResolved()],
    ['fileNameLength', localFileHeader.fileNameLength],
    ['extraFieldLength', localFileHeader.extraFieldLength],
    ['fileName', localFileHeader.fileNameResolved()],
    ['extraFields', describeExtraFields(localFileHeader.extraFields)],
    ['zip64ExtendedInformation', describeZip64ExtendedInformation(localFileHeader)],
    ['dataRelativeOffset', localFileHeader.getLocalFileDataRelativeOffset()],
  ]);
}

/**
 * Serialize a central directory file header.
 */
function describeCentralDirectoryFileHeader(
  centralDirectoryFileHeader: CentralDirectoryFileHeader,
): Map<string, YamlValue> {
  return ordered([
    ['rawLengthBytes', centralDirectoryFileHeader.raw.length],
    ['versionMadeBy', centralDirectoryFileHeader.versionMadeBy],
    ['versionNeeded', centralDirectoryFileHeader.versionNeeded],
    [
      'generalPurposeBitFlag',
      decodeGeneralPurposeBitFlag(centralDirectoryFileHeader.generalPurposeBitFlag),
    ],
    [
      'compressionMethod',
      `${centralDirectoryFileHeader.compressionMethod} (${CompressionMethodInverted[centralDirectoryFileHeader.compressionMethod]})`,
    ],
    ['fileModificationTime', centralDirectoryFileHeader.fileModificationTime],
    ['fileModificationDate', centralDirectoryFileHeader.fileModificationDate],
    [
      'fileModificationResolved',
      centralDirectoryFileHeader.fileModificationResolved().toISOString(),
    ],
    ['uncompressedCrc32', centralDirectoryFileHeader.uncompressedCrc32String()],
    ['compressedSize', centralDirectoryFileHeader.compressedSize],
    ['uncompressedSize', centralDirectoryFileHeader.uncompressedSize],
    ['compressedSizeResolved', centralDirectoryFileHeader.compressedSizeResolved()],
    ['uncompressedSizeResolved', centralDirectoryFileHeader.uncompressedSizeResolved()],
    ['fileNameLength', centralDirectoryFileHeader.fileNameLength],
    ['extraFieldLength', centralDirectoryFileHeader.extraFieldLength],
    ['fileCommentLength', centralDirectoryFileHeader.fileCommentLength],
    ['fileDiskStart', centralDirectoryFileHeader.fileDiskStart],
    ['fileDiskStartResolved', centralDirectoryFileHeader.fileDiskStartResolved()],
    ['internalFileAttributes', centralDirectoryFileHeader.internalFileAttributes],
    ['externalFileAttributes', centralDirectoryFileHeader.externalFileAttributes],
    ['localFileHeaderRelativeOffset', centralDirectoryFileHeader.localFileHeaderRelativeOffset],
    [
      'localFileHeaderRelativeOffsetResolved',
      centralDirectoryFileHeader.localFileHeaderRelativeOffsetResolved(),
    ],
    ['fileName', centralDirectoryFileHeader.fileNameResolved()],
    ['fileComment', centralDirectoryFileHeader.fileCommentResolved()],
    ['extraFields', describeExtraFields(centralDirectoryFileHeader.extraFields)],
    ['zip64ExtendedInformation', describeZip64ExtendedInformation(centralDirectoryFileHeader)],
  ]);
}

/**
 * Serialize the zip64 end of central directory record, which physically precedes the locator.
 */
function describeZip64EndOfCentralDirectoryRecord(eocd: EndOfCentralDirectory): YamlValue {
  if (eocd.zip64Record === undefined) {
    return undefined;
  }
  return ordered([
    ['versionMadeBy', eocd.zip64Record.versionMadeBy],
    ['versionNeeded', eocd.zip64Record.versionNeeded],
    ['diskNumber', eocd.zip64Record.diskNumber],
    ['centralDirectoryDiskStart', eocd.zip64Record.centralDirectoryDiskStart],
    ['centralDirectoryDiskRecordsCount', eocd.zip64Record.centralDirectoryDiskRecordsCount],
    ['centralDirectoryTotalRecordsCount', eocd.zip64Record.centralDirectoryTotalRecordsCount],
    ['centralDirectorySizeBytes', eocd.zip64Record.centralDirectorySizeBytes],
    ['centralDirectoryOffset', eocd.zip64Record.centralDirectoryOffset],
    ['comment', eocd.zip64Record.comment],
  ]);
}

/**
 * Serialize the zip64 end of central directory locator, which physically precedes the EOCD.
 */
function describeZip64EndOfCentralDirectoryLocator(eocd: EndOfCentralDirectory): YamlValue {
  if (eocd.zip64Locator === undefined) {
    return undefined;
  }
  return ordered([
    ['centralDirectoryDiskStart', eocd.zip64Locator.centralDirectoryDiskStart],
    ['centralDirectoryOffset', eocd.zip64Locator.centralDirectoryOffset],
    ['diskCount', eocd.zip64Locator.diskCount],
  ]);
}

/**
 * Serialize the (non-zip64) end of central directory record.
 */
function describeEndOfCentralDirectory(eocd: EndOfCentralDirectory): Map<string, YamlValue> {
  return ordered([
    ['diskNumber', eocd.diskNumber],
    ['centralDirectoryDiskStart', eocd.centralDirectoryDiskStart],
    ['centralDirectoryDiskRecordsCount', eocd.centralDirectoryDiskRecordsCount],
    ['centralDirectoryTotalRecordsCount', eocd.centralDirectoryTotalRecordsCount],
    ['centralDirectorySizeBytes', eocd.centralDirectorySizeBytes],
    ['centralDirectoryOffset', eocd.centralDirectoryOffset],
    ['comment', eocd.comment],
    ['diskNumberResolved', eocd.diskNumberResolved()],
    ['centralDirectoryDiskStartResolved', eocd.centralDirectoryDiskStartResolved()],
    ['centralDirectoryDiskRecordsCountResolved', eocd.centralDirectoryDiskRecordsCountResolved()],
    ['centralDirectoryTotalRecordsCountResolved', eocd.centralDirectoryTotalRecordsCountResolved()],
    ['centralDirectorySizeBytesResolved', eocd.centralDirectorySizeBytesResolved()],
    ['centralDirectoryOffsetResolved', eocd.centralDirectoryOffsetResolved()],
  ]);
}

if (process.argv.length < 3) {
  throw new Error('Usage: tsx scripts/zipInfo.ts <path/to/file.zip>');
}
const zipFilePath = process.argv[2];

const zipReader = new ZipReader(zipFilePath);
const fileHandle = await fs.promises.open(zipFilePath, 'r');
try {
  const fileSizeBytes = (await fileHandle.stat()).size;
  const eocd = await zipReader.endOfCentralDirectoryRecord();
  const centralDirectoryFileHeaders = await zipReader.centralDirectoryFileHeaders();

  const startOfCentralDirectory = eocd.centralDirectoryOffsetResolved();

  // Resolve each entry's local file header up front, then order entries by their physical offset.
  const entriesInByteOrder = (
    await Promise.all(
      centralDirectoryFileHeaders.map(async (cdfh) => ({
        cdfh,
        lfh: await cdfh.localFileHeader(),
      })),
    )
  ).toSorted(
    (a, b) =>
      a.cdfh.localFileHeaderRelativeOffsetResolved() -
      b.cdfh.localFileHeaderRelativeOffsetResolved(),
  );

  // The first local file header should be at offset 0; anything before it is a preamble.
  const firstHeaderOffset =
    entriesInByteOrder.length > 0
      ? entriesInByteOrder[0].cdfh.localFileHeaderRelativeOffsetResolved()
      : 0;

  // Each entry's local file header, encryption header, file data, and data descriptor, in physical
  // order. The byte position immediately after the last entry is also tracked.
  const localFiles: YamlValue[] = [];
  let endOfLocalFiles = 0;
  for (const { cdfh, lfh } of entriesInByteOrder) {
    const headerOffset = cdfh.localFileHeaderRelativeOffsetResolved();
    const headerEnd = headerOffset + lfh.raw.length;
    const dataOffset = lfh.getLocalFileDataRelativeOffset();
    const dataEnd = dataOffset + lfh.compressedSizeResolved();

    // Bytes between the local file header and its data, i.e. an encryption header.
    const encryptionHeaderLength = dataOffset - headerEnd;

    // A data descriptor (parsed by packages/zip) follows the data when general purpose bit 3 is set.
    const dataDescriptor = await lfh.dataDescriptor();
    endOfLocalFiles = dataEnd + (dataDescriptor?.raw.length ?? 0);

    localFiles.push(
      ordered([
        ['fileName', cdfh.fileNameResolved()],
        ['localFileHeader', describeLocalFileHeader(lfh)],
        [
          'encryptionHeader',
          encryptionHeaderLength > 0
            ? await describeRegion(fileHandle, headerEnd, encryptionHeaderLength)
            : undefined,
        ],
        [
          'fileData',
          ordered([
            ['offsetBytes', dataOffset],
            ['lengthBytes', lfh.compressedSizeResolved()],
          ]),
        ],
        [
          'dataDescriptor',
          dataDescriptor === undefined
            ? undefined
            : describeDataDescriptor(dataDescriptor, dataEnd),
        ],
      ]),
    );
  }

  // Between the last entry and the central directory, an archive extra data record (parsed by
  // packages/zip) may appear. Any other bytes there are an opaque archive decryption header; the
  // two can't be split without the proprietary encryption spec, so when an archive decryption
  // header is present the whole region is reported as such.
  const archiveExtraDataRecord = await zipReader.archiveExtraDataRecord();
  const archiveDecryptionHeaderLength =
    archiveExtraDataRecord === undefined ? startOfCentralDirectory - endOfLocalFiles : 0;

  // Central directory file headers, in physical order.
  const centralDirectory: YamlValue[] = entriesInByteOrder.map(({ cdfh }) =>
    describeCentralDirectoryFileHeader(cdfh),
  );

  const document = ordered([
    [
      'file',
      ordered([
        ['path', zipFilePath],
        ['sizeBytes', fileSizeBytes],
      ]),
    ],
    [
      'preamble',
      firstHeaderOffset > 0 ? await describeRegion(fileHandle, 0, firstHeaderOffset) : undefined,
    ],
    ['localFiles', localFiles],
    [
      'archiveDecryptionHeader',
      archiveDecryptionHeaderLength > 0
        ? await describeRegion(fileHandle, endOfLocalFiles, archiveDecryptionHeaderLength)
        : undefined,
    ],
    [
      'archiveExtraDataRecord',
      archiveExtraDataRecord === undefined
        ? undefined
        : describeArchiveExtraDataRecord(archiveExtraDataRecord, endOfLocalFiles),
    ],
    ['centralDirectoryFileHeaders', centralDirectory],
    ['zip64EndOfCentralDirectoryRecord', describeZip64EndOfCentralDirectoryRecord(eocd)],
    ['zip64EndOfCentralDirectoryLocator', describeZip64EndOfCentralDirectoryLocator(eocd)],
    ['endOfCentralDirectory', describeEndOfCentralDirectory(eocd)],
  ]);

  process.stdout.write(`${toYaml(document, 0)}\n`);
} finally {
  await fileHandle.close();
}
