/**
 * Compare two zip entry filenames the way the TorrentZip specification requires: case-insensitively,
 * and then by code unit.
 */
export default function tzFileNameComparator(fileNameA: string, fileNameB: string): number {
  const fileNameLowerA = fileNameA.toLowerCase();
  const fileNameLowerB = fileNameB.toLowerCase();
  if (fileNameLowerA < fileNameLowerB) {
    return -1;
  }
  if (fileNameLowerA > fileNameLowerB) {
    return 1;
  }
  return 0;
}
