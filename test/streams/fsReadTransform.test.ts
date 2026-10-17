import stream from 'node:stream';

import FsReadTransform from '../../src/streams/fsReadTransform.js';
import StreamUtil from '../../src/utils/streamUtil.js';

/**
 * @returns the chunks {@link chunks} come out of a {@link FsReadTransform} as, and every progress
 *   it reported
 */
async function run(chunks: Buffer[]): Promise<{ output: Buffer[]; progress: number[] }> {
  const progress: number[] = [];
  const output = await StreamUtil.pipelineSafe(
    stream.Readable.from(chunks),
    new FsReadTransform((bytesRead) => {
      progress.push(bytesRead);
    }),
    async (readable) => {
      // Collect 'data' events rather than async-iterating, because Node.js v22's async iterator
      // reads every buffered chunk at once, merging them into one
      const outputChunks: Buffer[] = [];
      readable.on('data', (chunk: unknown) => {
        if (!Buffer.isBuffer(chunk)) {
          readable.destroy(new TypeError('expected a Buffer chunk'));
          return;
        }
        outputChunks.push(chunk);
      });
      await stream.promises.finished(readable);
      return outputChunks;
    },
  );
  return { output, progress };
}

describe('_transform', () => {
  it('should pass every chunk through without copying it', async () => {
    const chunks = [Buffer.from('hello'), Buffer.from(' world')];
    const { output } = await run(chunks);
    expect(output).toHaveLength(chunks.length);
    for (const [index, chunk] of output.entries()) {
      expect(chunk).toBe(chunks[index]);
    }
  });

  it('should report the total bytes read after every chunk', async () => {
    await expect(
      run([Buffer.from('hello'), Buffer.from(' world'), Buffer.from('!')]),
    ).resolves.toEqual({
      output: [Buffer.from('hello'), Buffer.from(' world'), Buffer.from('!')],
      progress: [5, 11, 12],
    });
  });

  it('should report no progress for an empty stream', async () => {
    await expect(run([])).resolves.toEqual({ output: [], progress: [] });
  });
});
