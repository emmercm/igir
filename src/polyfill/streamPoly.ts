import stream from 'node:stream';

export default {
  concat(...readables: stream.Readable[]): stream.Readable {
    const out = new stream.PassThrough();
    let current = 0;
    let activeStream: stream.Readable | undefined = undefined;
    let destroyed = false;

    /**
     * Pipe the next input stream to the output stream.
     */
    function pipeNext(): void {
      if (destroyed) {
        return;
      }

      if (current >= readables.length) {
        out.end();
        return;
      }

      activeStream = readables[current++];
      activeStream.pipe(out, { end: false });
      activeStream.once('error', (err) => {
        out.emit('error', err);
      });
      activeStream.once('end', pipeNext);
    }

    // Allow the passthrough to be destroyed
    out._destroy = (err: Error | null, callback: (error?: Error | null) => void): void => {
      destroyed = true;
      if (typeof activeStream?.destroy === 'function') {
        activeStream.destroy(err ?? undefined);
      }

      for (let i = current; i < readables.length; i++) {
        const readable = readables[i];
        if (typeof readable.destroy === 'function') {
          readable.destroy();
        }
      }

      callback(err);
    };

    pipeNext();
    return out;
  },
};
