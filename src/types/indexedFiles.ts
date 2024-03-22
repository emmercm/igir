import { Memoize } from 'typescript-memoize';

import ArrayPoly from '../polyfill/arrayPoly.js';
import File from '../types/files/file.js';
import ROM from './dats/rom.js';

export type ChecksumsToFiles = Map<string, File[]>;

export interface AllChecksums {
  crc32: ChecksumsToFiles,
  md5: ChecksumsToFiles,
  sha1: ChecksumsToFiles,
  sha256: ChecksumsToFiles,
}

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
   * Generate a {@link IndexedFiles} based on a set of {@link File}s.
   */
  static fromFiles(files: File[]): IndexedFiles {
    const crc32RawMap = new Map<string, File[]>();
    const crc32WithoutHeaderMap = new Map<string, File[]>();
    const md5RawMap = new Map<string, File[]>();
    const md5WithoutHeaderMap = new Map<string, File[]>();
    const sha1RawMap = new Map<string, File[]>();
    const sha1WithoutHeaderMap = new Map<string, File[]>();
    const sha256RawMap = new Map<string, File[]>();
    const sha256WithoutHeaderMap = new Map<string, File[]>();

    // Build the maps
    files.forEach((file) => {
      const crc32WithSize = `${file.getCrc32()}|${file.getSize()}`;
      crc32RawMap.set(crc32WithSize, [file, ...(crc32RawMap.get(crc32WithSize) ?? [])]);

      const md5 = file.getMd5();
      if (md5) {
        md5RawMap.set(md5, [file, ...(md5RawMap.get(md5) ?? [])]);
      }

      const sha1 = file.getSha1();
      if (sha1) {
        sha1RawMap.set(sha1, [file, ...(sha1RawMap.get(sha1) ?? [])]);
      }

      const sha256 = file.getSha256();
      if (sha256) {
        sha256RawMap.set(sha256, [file, ...(sha256RawMap.get(sha256) ?? [])]);
      }

      if (file.getFileHeader()) {
        const crc32WithoutHeader = `${file.getCrc32WithoutHeader()}|${file.getSizeWithoutHeader()}`;
        crc32WithoutHeaderMap.set(
          crc32WithoutHeader,
          [...(crc32WithoutHeaderMap.get(crc32WithoutHeader) ?? []), file],
        );

        const md5WithoutHeader = file.getMd5WithoutHeader();
        if (md5WithoutHeader) {
          md5WithoutHeaderMap.set(
            md5WithoutHeader,
            [...(md5WithoutHeaderMap.get(md5WithoutHeader) ?? []), file],
          );
        }

        const sha1WithoutHeader = file.getSha1WithoutHeader();
        if (sha1WithoutHeader) {
          sha1WithoutHeaderMap.set(
            sha1WithoutHeader,
            [...(sha1WithoutHeaderMap.get(sha1WithoutHeader) ?? []), file],
          );
        }

        const sha256WithoutHeader = file.getSha256WithoutHeader();
        if (sha256WithoutHeader) {
          sha256WithoutHeaderMap.set(
            sha256WithoutHeader,
            [...(sha256WithoutHeaderMap.get(sha256WithoutHeader) ?? []), file],
          );
        }
      }
    });

    const crc32Map = this.combineMaps(crc32RawMap, crc32WithoutHeaderMap);
    const md5Map = this.combineMaps(md5RawMap, md5WithoutHeaderMap);
    const sha1Map = this.combineMaps(sha1RawMap, sha1WithoutHeaderMap);
    const sha256Map = this.combineMaps(sha256RawMap, sha256WithoutHeaderMap);
    return new IndexedFiles(crc32Map, md5Map, sha1Map, sha256Map);
  }

  private static combineMaps(
    withHeaders: ChecksumsToFiles,
    withoutHeaders: ChecksumsToFiles,
  ): ChecksumsToFiles {
    const result = new Map(withHeaders);
    [...withoutHeaders.entries()]
      // Prefer "raw" files as they exist on disk, without any header manipulation
      .filter(([checksum]) => !result.has(checksum))
      .forEach(([checksum, files]) => {
        result.set(checksum, files);
      });
    return result;
  }

  @Memoize()
  getFiles(): File[] {
    return [
      ...this.crc32.values(),
      ...this.md5.values(),
      ...this.sha1.values(),
      ...this.sha256.values(),
    ]
      .flat()
      .filter(ArrayPoly.filterUniqueMapped((file) => file.toString()));
  }

  getSize(): number {
    return this.getFiles().length;
  }

  /**
   * Find file(s) in the index based some search criteria.
   */
  findFiles(file: File | ROM): File[] | undefined {
    const { sha256 } = file;
    if (sha256 && this.sha256.has(sha256)) {
      return this.sha256.get(sha256);
    }

    const { sha1 } = file;
    if (sha1 && this.sha1.has(sha1)) {
      return this.sha1.get(sha1);
    }

    const { md5 } = file;
    if (md5 && this.md5.has(md5)) {
      return this.md5.get(md5);
    }

    const { crc32 } = file;
    if (crc32) {
      const crc32WithSize = `${crc32}|${file.getSize()}`;
      if (this.crc32.has(crc32WithSize)) {
        return this.crc32.get(crc32WithSize);
      }
    }

    return undefined;
  }
}
