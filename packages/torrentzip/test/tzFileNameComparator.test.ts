import tzFileNameComparator from '../src/tzFileNameComparator.js';

describe('tzFileNameComparator', () => {
  test.each([
    ['a.bin', 'b.bin'],
    ['A.bin', 'b.bin'],
    ['a.bin', 'B.bin'],
    // ')' (0x29) precedes ',' (0x2C)
    ['Game (Europe).bin', 'Game (Europe, Australia).bcn'],
    // ' ' (0x20) precedes '.' (0x2E)
    ['Game (USA).bcn', 'Game.nds'],
    // '-' (0x2D) precedes '.' (0x2E)
    ['Game-1.bin', 'Game.nds'],
    // '!' (0x21) precedes '0' (0x30) precedes 'a' (0x61)
    ['!.bin', '0.bin'],
    ['0.bin', 'a.bin'],
    // Prefixes sort first
    ['Game', 'Game.nds'],
  ])('should sort before: %s, %s', (fileNameA: string, fileNameB: string) => {
    expect(tzFileNameComparator(fileNameA, fileNameB)).toEqual(-1);
    expect(tzFileNameComparator(fileNameB, fileNameA)).toEqual(1);
  });

  test.each([
    ['a.bin', 'a.bin'],
    ['A.bin', 'a.bin'],
    ['Game (USA).nds', 'GAME (usa).NDS'],
  ])('should sort equally: %s, %s', (fileNameA: string, fileNameB: string) => {
    expect(tzFileNameComparator(fileNameA, fileNameB)).toEqual(0);
    expect(tzFileNameComparator(fileNameB, fileNameA)).toEqual(0);
  });

  test('should not order by locale-aware collation', () => {
    // These are the filenames from https://github.com/emmercm/igir/issues/2411
    const fileNames = [
      'Mystery Case Files - MillionHeir (USA, Europe, Australia) (Demo) (Australia).bin',
      'Mystery Case Files - MillionHeir (USA, Europe, Australia) (Demo) (Europe).bin',
      'Mystery Case Files - MillionHeir (USA, Europe, Australia) (Demo) (Europe, Australia).bcn',
      'Mystery Case Files - MillionHeir (USA, Europe, Australia) (Demo) (USA).bcn',
      'Mystery Case Files - MillionHeir (USA, Europe, Australia) (Demo).nds',
    ];

    // The list is already in TorrentZip order
    expect(fileNames.toSorted(tzFileNameComparator)).toEqual(fileNames);

    // ...but locale-aware collation disagrees, which is exactly the bug
    expect(
      fileNames.toSorted((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())),
    ).not.toEqual(fileNames);
  });
});
