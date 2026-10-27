import { Memoize } from 'typescript-memoize';

import File from '../models/files/file.js';
import ArrayUtil from '../utils/arrayUtil.js';
import ROM from './dats/rom.js';

type ChecksumsToFiles = Map<string, File[]>;

/**
 * A lookup table of {@link File}s based on their checksums.
 */
export default class IndexedFiles {
  private readonly crc32: ChecksumsToFiles;

  private readonly md5: ChecksumsToFiles;

  private readonly sha1: ChecksumsToFiles;

  private readonly sha256: ChecksumsToFiles;

  private constructor(
    crc32: ChecksumsToFiles,
    md5: ChecksumsToFiles,
    sha1: ChecksumsToFiles,
    sha256: ChecksumsToFiles,
  ) {
    this.crc32 = crc32;
    this.md5 = md5;
    this.sha1 = sha1;
    this.sha256 = sha256;
  }

  /**
   * Generate a {@link IndexedFiles} based on a set of {@link File}s, optionally sorting the files
   * that share each checksum with {@link comparator}.
   */
  static fromFiles(
    files: File[],
    comparator?: (fileOne: File, fileTwo: File) => number,
  ): IndexedFiles {
    const crc32RawMap = new Map<string, File[]>();
    const crc32WithoutHeaderMap = new Map<string, File[]>();
    const crc32PaddedMap = new Map<string, File[]>();

    const md5RawMap = new Map<string, File[]>();
    const md5WithoutHeaderMap = new Map<string, File[]>();
    const md5PaddedMap = new Map<string, File[]>();

    const sha1RawMap = new Map<string, File[]>();
    const sha1WithoutHeaderMap = new Map<string, File[]>();
    const sha1PaddedMap = new Map<string, File[]>();

    const sha256RawMap = new Map<string, File[]>();
    const sha256WithoutHeaderMap = new Map<string, File[]>();
    const sha256PaddedMap = new Map<string, File[]>();

    // Build the maps
    const uniqueFiles = files.filter(ArrayUtil.filterUniqueMapped((file) => file.getLocationKey()));
    for (const file of uniqueFiles) {
      const crc32WithSize = `${file.getCrc32()}|${file.getSize()}`;
      if (crc32RawMap.has(crc32WithSize)) {
        crc32RawMap.get(crc32WithSize)?.push(file);
      } else {
        crc32RawMap.set(crc32WithSize, [file]);
      }

      const md5 = file.getMd5();
      if (md5) {
        if (md5RawMap.has(md5)) {
          md5RawMap.get(md5)?.push(file);
        } else {
          md5RawMap.set(md5, [file]);
        }
      }

      const sha1 = file.getSha1();
      if (sha1) {
        if (sha1RawMap.has(sha1)) {
          sha1RawMap.get(sha1)?.push(file);
        } else {
          sha1RawMap.set(sha1, [file]);
        }
      }

      const sha256 = file.getSha256();
      if (sha256) {
        if (sha256RawMap.has(sha256)) {
          sha256RawMap.get(sha256)?.push(file);
        } else {
          sha256RawMap.set(sha256, [file]);
        }
      }

      if (file.getFileHeader()) {
        const crc32WithoutHeader = `${file.getCrc32WithoutHeader()}|${file.getSizeWithoutHeader()}`;
        if (crc32WithoutHeaderMap.has(crc32WithoutHeader)) {
          crc32WithoutHeaderMap.get(crc32WithoutHeader)?.push(file);
        } else {
          crc32WithoutHeaderMap.set(crc32WithoutHeader, [file]);
        }

        const md5WithoutHeader = file.getMd5WithoutHeader();
        if (md5WithoutHeader) {
          if (md5WithoutHeaderMap.has(md5WithoutHeader)) {
            md5WithoutHeaderMap.get(md5WithoutHeader)?.push(file);
          } else {
            md5WithoutHeaderMap.set(md5WithoutHeader, [file]);
          }
        }

        const sha1WithoutHeader = file.getSha1WithoutHeader();
        if (sha1WithoutHeader) {
          if (sha1WithoutHeaderMap.has(sha1WithoutHeader)) {
            sha1WithoutHeaderMap.get(sha1WithoutHeader)?.push(file);
          } else {
            sha1WithoutHeaderMap.set(sha1WithoutHeader, [file]);
          }
        }

        const sha256WithoutHeader = file.getSha256WithoutHeader();
        if (sha256WithoutHeader) {
          if (sha256WithoutHeaderMap.has(sha256WithoutHeader)) {
            sha256WithoutHeaderMap.get(sha256WithoutHeader)?.push(file);
          } else {
            sha256WithoutHeaderMap.set(sha256WithoutHeader, [file]);
          }
        }
      }

      for (const romPadding of file.getPaddings()) {
        const paddedCrc32 = `${romPadding.getCrc32()}|${romPadding.getPaddedSize()}`;
        if (paddedCrc32) {
          if (crc32PaddedMap.has(paddedCrc32)) {
            crc32PaddedMap.get(paddedCrc32)?.push(file);
          } else {
            crc32PaddedMap.set(paddedCrc32, [file]);
          }
        }

        const paddedMd5 = romPadding.getMd5();
        if (paddedMd5) {
          if (md5PaddedMap.has(paddedMd5)) {
            md5PaddedMap.get(paddedMd5)?.push(file);
          } else {
            md5PaddedMap.set(paddedMd5, [file]);
          }
        }

        const paddedSha1 = romPadding.getSha1();
        if (paddedSha1) {
          if (sha1PaddedMap.has(paddedSha1)) {
            sha1PaddedMap.get(paddedSha1)?.push(file);
          } else {
            sha1PaddedMap.set(paddedSha1, [file]);
          }
        }

        const paddedSha256 = romPadding.getSha256();
        if (paddedSha256) {
          if (sha256PaddedMap.has(paddedSha256)) {
            sha256PaddedMap.get(paddedSha256)?.push(file);
          } else {
            sha256PaddedMap.set(paddedSha256, [file]);
          }
        }
      }
    }

    const crc32Map = this.combineMaps(crc32RawMap, crc32WithoutHeaderMap, crc32PaddedMap);
    const md5Map = this.combineMaps(md5RawMap, md5WithoutHeaderMap, md5PaddedMap);
    const sha1Map = this.combineMaps(sha1RawMap, sha1WithoutHeaderMap, sha1PaddedMap);
    const sha256Map = this.combineMaps(sha256RawMap, sha256WithoutHeaderMap, sha256PaddedMap);

    if (comparator !== undefined) {
      for (const checksumsToFiles of [crc32Map, md5Map, sha1Map, sha256Map]) {
        for (const checksumFiles of checksumsToFiles.values()) {
          checksumFiles.sort(comparator);
        }
      }
    }

    return new IndexedFiles(crc32Map, md5Map, sha1Map, sha256Map);
  }

  private static combineMaps(
    withHeaders: ChecksumsToFiles,
    withoutHeaders: ChecksumsToFiles,
    padded: ChecksumsToFiles,
  ): ChecksumsToFiles {
    const result = new Map(withHeaders);
    for (const [checksum, files] of withoutHeaders) {
      // Prefer "raw" files as they exist on disk, without any header manipulation
      if (result.has(checksum)) {
        continue;
      }
      result.set(checksum, files);
    }
    for (const [checksum, files] of padded) {
      // Prefer "raw" files as they exist on disk, without any padding manipulation
      if (result.has(checksum)) {
        continue;
      }
      result.set(checksum, files);
    }
    return result;
  }

  @Memoize()
  getFiles(): File[] {
    return [
      ...new Set(
        [
          ...this.crc32.values(),
          ...this.md5.values(),
          ...this.sha1.values(),
          ...this.sha256.values(),
        ].flat(),
      ),
    ];
  }

  @Memoize()
  getFilesByFilePath(): Map<string, File[]> {
    return Map.groupBy(this.getFiles(), (file) => file.getFilePath());
  }

  getSize(): number {
    return this.getFiles().length;
  }

  /**
   * Find file(s) in the index based some search criteria.
   */
  findFiles(file: File | ROM): File[] {
    const foundFiles = this.getChecksumKeys(file)
      .map(([checksumsToFiles, checksum]) => checksumsToFiles.get(checksum))
      .filter((checksumFiles) => checksumFiles !== undefined);
    if (foundFiles.length <= 1) {
      // Files commonly only have a CRC32, so skip de-duplicating a single list, which is already
      // unique. Copy it so callers can't modify the index.
      return foundFiles.at(0)?.slice() ?? [];
    }
    return [...new Set(foundFiles.flat())];
  }

  /**
   * The same as {@link findFiles}, limited to files at {@link filePath}. Many files can share a
   * checksum (identical audio tracks across discs, for example), so this skips building and
   * de-duplicating the full list just to keep the few at one path.
   */
  findFilesAtPath(file: File | ROM, filePath: string): File[] {
    const fileOrChecksumsToFiles = this.getChecksumsByFilePath().get(filePath);
    if (fileOrChecksumsToFiles === undefined) {
      return [];
    }
    const checksumKeys = this.getChecksumKeys(file);
    if (fileOrChecksumsToFiles instanceof File) {
      // There's only one file at this path
      return checksumKeys.some(([checksumsToFiles, checksum]) =>
        checksumsToFiles.get(checksum)?.includes(fileOrChecksumsToFiles),
      )
        ? [fileOrChecksumsToFiles]
        : [];
    }
    return [
      ...new Set(
        checksumKeys.flatMap(([, checksum]) => fileOrChecksumsToFiles.get(checksum) ?? []),
      ),
    ];
  }

  /**
   * The checksum indexes again, grouped by file path. To save memory, a path with only one file (an
   * extracted file, or a single-file archive) maps directly to that file rather than to a map, and
   * a checksum with only one file at a path maps directly to that file rather than to an array.
   */
  @Memoize()
  private getChecksumsByFilePath(): Map<string, File | Map<string, File | File[]>> {
    const filesByFilePath = this.getFilesByFilePath();
    const checksumsByFilePath = new Map<string, File | Map<string, File | File[]>>();
    for (const checksumsToFiles of [this.sha256, this.sha1, this.md5, this.crc32]) {
      for (const [checksum, files] of checksumsToFiles) {
        // Map.groupBy() sizes its arrays exactly, unlike growing them with push()
        const filesByPath = Map.groupBy(files, (file) => file.getFilePath());
        for (const [filePath, filesAtPath] of filesByPath) {
          let fileOrChecksumsToFiles = checksumsByFilePath.get(filePath);
          if (fileOrChecksumsToFiles instanceof File) {
            continue;
          }
          if (fileOrChecksumsToFiles === undefined) {
            if ((filesByFilePath.get(filePath)?.length ?? 0) <= 1) {
              checksumsByFilePath.set(filePath, filesAtPath[0]);
              continue;
            }
            fileOrChecksumsToFiles = new Map();
            checksumsByFilePath.set(filePath, fileOrChecksumsToFiles);
          }
          fileOrChecksumsToFiles.set(
            checksum,
            filesAtPath.length === 1 ? filesAtPath[0] : filesAtPath,
          );
        }
      }
    }
    return checksumsByFilePath;
  }

  /**
   * The checksum index and key to look up for each of a file's checksums, strongest first.
   */
  private getChecksumKeys(file: File | ROM): [ChecksumsToFiles, string][] {
    const keys: [ChecksumsToFiles, string][] = [];

    const sha256 = file.sha256?.replaceAll(/[^0-9a-f]/gi, '');
    if (sha256) {
      keys.push([this.sha256, sha256]);
    }

    const sha1 = file.sha1?.replaceAll(/[^0-9a-f]/gi, '');
    if (sha1) {
      keys.push([this.sha1, sha1]);
    }

    const md5 = file.md5?.replaceAll(/[^0-9a-f]/gi, '');
    if (md5) {
      keys.push([this.md5, md5]);
    }

    const crc32 = file.crc32?.replaceAll(/[^0-9a-f]/gi, '');
    if (crc32) {
      keys.push([this.crc32, `${crc32}|${file.getSize()}`]);
    }

    return keys;
  }
}
