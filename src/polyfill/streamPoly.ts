import { Readable, Writable } from 'node:stream';

export default {
  async autodrain(stream: Readable): Promise<void> {
    // https://github.com/sindresorhus/noop-stream/blob/1ae9ff0dce4a895064ed31f90787f53d5faf1330/index.js#L37-L42
    const noOpStream = new Writable({
      write(
        chunk: never,
        encoding: BufferEncoding,
        callback: (error?: Error | null) => void,
      ): void {
        setImmediate(callback);
      },
    });

    // https://github.com/ZJONSSON/node-unzipper/blob/ab64d6a38b5f091384334dd7aff283f0a5073878/lib/parse.js#L118-L124
    const draining = stream.pipe(noOpStream);
    return new Promise((resolve, reject) => {
      draining.on('finish', resolve);
      draining.on('error', reject);
    });
  },
};
