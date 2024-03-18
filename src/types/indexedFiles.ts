import { Memoize } from 'typescript-memoize';

import ArrayPoly from '../polyfill/arrayPoly.js';
import File from '../types/files/file.js';
import ROM from './dats/rom.js';

export type ChecksumsToFiles = Map<string, File[]>;

export interface AllChecksums {
  crc32: ChecksumsToFiles,
  md5: ChecksumsToFiles,
  sha1: ChecksumsToFiles,
}

/**
 * TODO
 */
export default class IndexedFiles {
  private readonly crc32: ChecksumsToFiles;

  private readonly md5: ChecksumsToFiles;

  private readonly sha1: ChecksumsToFiles;

  private constructor(crc32: ChecksumsToFiles, md5: ChecksumsToFiles, sha1: ChecksumsToFiles) {
    this.crc32 = crc32;
    this.md5 = md5;
    this.sha1 = sha1;
  }

  /**
   * TODO
   */
  static fromFiles(files: File[]): IndexedFiles {
    const crc32RawMap = new Map<string, File[]>();
    const crc32WithoutHeaderMap = new Map<string, File[]>();
    const md5RawMap = new Map<string, File[]>();
    const md5WithoutHeaderMap = new Map<string, File[]>();
    const sha1RawMap = new Map<string, File[]>();
    const sha1WithoutHeaderMap = new Map<string, File[]>();

    // Build the maps
    files.forEach((file) => {
      const crc32WithSize = `${file.getCrc32()}|${file.getSize()}`;
      crc32RawMap.set(crc32WithSize, [file, ...(crc32RawMap.get(crc32WithSize) ?? [])]);

      const md5 = file.getMd5();
      if (md5) {
        md5RawMap.set(md5, [file, ...(crc32RawMap.get(md5) ?? [])]);
      }

      const sha1 = file.getSha1();
      if (sha1) {
        sha1RawMap.set(sha1, [file, ...(crc32RawMap.get(sha1) ?? [])]);
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
      }
    });

    const crc32Map = this.combineMaps(crc32RawMap, crc32WithoutHeaderMap);
    const md5Map = this.combineMaps(md5RawMap, md5WithoutHeaderMap);
    const sha1Map = this.combineMaps(sha1RawMap, sha1WithoutHeaderMap);
    return new IndexedFiles(crc32Map, md5Map, sha1Map);
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
    ]
      .flat()
      .filter(ArrayPoly.filterUniqueMapped((file) => file.toString()));
  }

  getSize(): number {
    return this.getFiles().length;
  }

  /**
   * TODO
   */
  findFiles(file: File | ROM): File[] | undefined {
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
