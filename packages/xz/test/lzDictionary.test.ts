import LzDictionary from '../src/lzDictionary.js';

function dictionaryOf(dictionarySize: number, output: Buffer, bytes: number[]): LzDictionary {
  const dictionary = new LzDictionary(dictionarySize);
  dictionary.setOutput(output);
  for (const byte of bytes) {
    dictionary.put(byte);
  }
  return dictionary;
}

function sequence(start: number, end: number): number[] {
  return Array.from({ length: end - start }, (_value, index) => start + index);
}

describe('setOutput', () => {
  it('should write to the new output and keep the history', () => {
    const first = Buffer.alloc(2);
    const dictionary = dictionaryOf(16, first, [1, 2]);
    const second = Buffer.alloc(2);
    dictionary.setOutput(second);
    dictionary.put(3);
    expect(first).toEqual(Buffer.from([1, 2]));
    expect(second).toEqual(Buffer.from([3, 0]));
    expect(dictionary.get(1)).toEqual(2);
  });
});

describe('getOutputPosition', () => {
  it('should count the bytes written to the current output', () => {
    expect(dictionaryOf(16, Buffer.alloc(5), [1, 2, 3]).getOutputPosition()).toEqual(3);
  });
});

describe('getOutputRemaining', () => {
  it('should count the bytes left in the current output', () => {
    expect(dictionaryOf(16, Buffer.alloc(5), [1, 2]).getOutputRemaining()).toEqual(3);
  });
});

describe('reset', () => {
  it('should forget all history', () => {
    const dictionary = dictionaryOf(16, Buffer.alloc(5), [1, 2]);
    dictionary.reset();
    expect(dictionary.getTotalPosition()).toEqual(0);
    expect(dictionary.getPreviousByte()).toEqual(0);
    expect(dictionary.isDistanceValid(0)).toEqual(false);
  });
});

describe('getTotalPosition', () => {
  it('should count every byte across outputs', () => {
    const dictionary = dictionaryOf(16, Buffer.alloc(2), [1, 2]);
    dictionary.setOutput(Buffer.alloc(1));
    dictionary.put(3);
    expect(dictionary.getTotalPosition()).toEqual(3);
  });
});

describe('getPreviousByte', () => {
  it('should return 0 before any byte', () => {
    expect(dictionaryOf(16, Buffer.alloc(0), []).getPreviousByte()).toEqual(0);
  });

  it('should return the last byte', () => {
    expect(dictionaryOf(16, Buffer.alloc(2), [0x41, 0x42]).getPreviousByte()).toEqual(0x42);
  });
});

describe('get', () => {
  it('should return the byte distance + 1 back', () => {
    const dictionary = dictionaryOf(16, Buffer.alloc(3), [1, 2, 3]);
    expect([dictionary.get(0), dictionary.get(1), dictionary.get(2)]).toEqual([3, 2, 1]);
  });
});

describe('isDistanceValid', () => {
  it('should allow distances within the bytes put so far', () => {
    const dictionary = dictionaryOf(16, Buffer.alloc(3), [1, 2, 3]);
    expect([dictionary.isDistanceValid(2), dictionary.isDistanceValid(3)]).toEqual([true, false]);
  });

  it('should allow distances within the dictionary size once it is full', () => {
    const dictionary = dictionaryOf(4, Buffer.alloc(6), [1, 2, 3, 4, 5, 6]);
    expect([dictionary.isDistanceValid(3), dictionary.isDistanceValid(4)]).toEqual([true, false]);
  });
});

describe('put', () => {
  it('should wrap around once the dictionary is full', () => {
    const output = Buffer.alloc(6);
    const dictionary = dictionaryOf(4, output, [1, 2, 3, 4, 5, 6]);
    expect(output).toEqual(Buffer.from([1, 2, 3, 4, 5, 6]));
    expect([0, 1, 2, 3].map((distance) => dictionary.get(distance))).toEqual([6, 5, 4, 3]);
  });

  it('should keep history while growing past its initial capacity', () => {
    const size = 70_000;
    const bytes = Array.from({ length: size }, (_value, index) => index % 251);
    const dictionary = dictionaryOf(1024 * 1024, Buffer.alloc(size), bytes);
    expect(dictionary.get(size - 1)).toEqual(0);
    expect(dictionary.get(0)).toEqual((size - 1) % 251);
  });
});

describe('repeat', () => {
  it('should repeat a single byte', () => {
    const output = Buffer.alloc(5);
    dictionaryOf(16, output, [7]).repeat(0, 4);
    expect(output).toEqual(Buffer.from([7, 7, 7, 7, 7]));
  });

  it('should repeat overlapping bytes', () => {
    const output = Buffer.alloc(6);
    dictionaryOf(16, output, [1, 2]).repeat(1, 4);
    expect(output).toEqual(Buffer.from([1, 2, 1, 2, 1, 2]));
  });

  it('should repeat a long run of one byte', () => {
    const output = Buffer.alloc(41);
    dictionaryOf(64, output, [9]).repeat(0, 40);
    expect(output).toEqual(Buffer.alloc(41, 9));
  });

  it('should repeat a pattern shorter than the length', () => {
    const output = Buffer.alloc(43);
    dictionaryOf(64, output, [1, 2, 3]).repeat(2, 40);
    expect(output).toEqual(
      Buffer.from(Array.from({ length: 43 }, (_value, index) => (index % 3) + 1)),
    );
  });

  it('should wrap around a full dictionary in both the destination and the source', () => {
    const output = Buffer.alloc(300);
    const dictionary = dictionaryOf(128, output, sequence(0, 120));
    // The destination wraps, then the source wraps
    dictionary.repeat(79, 80);
    dictionary.repeat(99, 100);
    expect(output).toEqual(
      Buffer.from([
        ...sequence(0, 120),
        ...sequence(40, 120),
        ...sequence(100, 120),
        ...sequence(40, 120),
      ]),
    );
    expect([dictionary.get(0), dictionary.get(127)]).toEqual([119, 92]);
  });

  it('should keep history while growing past its initial capacity', () => {
    const size = 65_500;
    const bytes = Array.from({ length: size }, (_value, index) => index % 251);
    const output = Buffer.alloc(size + 1000);
    const dictionary = dictionaryOf(1024 * 1024, output, bytes);
    dictionary.repeat(999, 1000);
    expect(output).toEqual(Buffer.from([...bytes, ...bytes.slice(size - 1000)]));
    expect(dictionary.get(size + 999)).toEqual(0);
  });
});

describe('putBytes', () => {
  it('should put a range of the input', () => {
    const output = Buffer.alloc(2);
    dictionaryOf(16, output, []).putBytes(Buffer.from('aabbccdd', 'hex'), 1, 2);
    expect(output).toEqual(Buffer.from('bbcc', 'hex'));
  });

  it('should wrap around a full dictionary', () => {
    const output = Buffer.alloc(97);
    const dictionary = dictionaryOf(64, output, sequence(0, 60));
    dictionary.putBytes(Buffer.from(sequence(100, 140)), 3, 37);
    expect(output).toEqual(Buffer.from([...sequence(0, 60), ...sequence(103, 140)]));
    expect([dictionary.get(0), dictionary.get(63)]).toEqual([139, 33]);
  });
});
