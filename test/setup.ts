// Compare Buffers with Buffer.equals(), rather than Vitest's default byte-by-byte comparison that
// allocates hundreds of bytes of heap for every byte compared
expect.addEqualityTesters([
  (actual: unknown, expected: unknown): boolean | undefined =>
    Buffer.isBuffer(actual) && Buffer.isBuffer(expected) ? actual.equals(expected) : undefined,
]);
