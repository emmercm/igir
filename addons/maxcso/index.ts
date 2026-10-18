import module from 'node:module';
import os from 'node:os';
import stream from 'node:stream';

import { type Context, getDefaultContext } from '@emnapi/runtime';

const require = module.createRequire(import.meta.url);

export const MaxcsoFormat = {
  CSO: 'CSO',
  ZSO: 'ZSO',
  DAX: 'DAX',
} as const;
export type MaxcsoFormat = (typeof MaxcsoFormat)[keyof typeof MaxcsoFormat];

export interface MaxcsoInfo {
  inputFile: string;
  format: MaxcsoFormat;
  uncompressedSize: number;
  blockSize: number;
}

export interface InfoOptions {
  inputFilename: string;
}

export interface OpenReaderOptions {
  inputFilename: string;
  /**
   * The `highWaterMark` of the returned stream, and so the number of bytes
   * asked of the addon per read. Omit it to take Node's own default for a
   * {@link stream.Readable}. At most 64 MiB, since every read allocates a
   * buffer of this size.
   */
  highWaterMark?: number;
}

interface NativeReader {
  read: (maxBytes: number) => Promise<Buffer | null>;
  // Resolves once the file is closed
  close: () => Promise<void>;
}

interface MaxcsoBinding {
  info: (
    inputFilename: string,
  ) => Promise<{ format: string; uncompressedSize: number; blockSize: number }>;
  openReader: (inputFilename: string) => NativeReader;
}

const bindingInstance: { binding?: MaxcsoBinding } = {};

/**
 * Load the native addon on first use, rather than at import, so that importing this
 * module's types and constants never loads a binary that may go unused.
 */
function loadBinding(): MaxcsoBinding {
  bindingInstance.binding ??= ((): MaxcsoBinding => {
    if (process.env.IGIR_ADDONS !== 'wasm') {
      try {
        // Try to load the development build
        return require('./build/Release/maxcso.node') as MaxcsoBinding;
      } catch {
        // Ignored
      }

      try {
        // Try to load the prebuild
        return require(
          `./addon-maxcso/prebuilds/${os.platform()}-${os.arch()}/node.node`,
        ) as MaxcsoBinding;
      } catch (error) {
        // The native build is required, rather than falling back to the WebAssembly build
        if (process.env.IGIR_ADDONS === 'native') {
          throw error;
        }
      }
    }

    // Load the WebAssembly build, which runs on any platform, but slower than a native build
    const wasmModule = require('./addon-maxcso/wasm/maxcso.cjs') as {
      emnapiInit: (options: { context: Context }) => MaxcsoBinding;
    };
    return wasmModule.emnapiInit({ context: getDefaultContext() });
  })();
  return bindingInstance.binding;
}

/**
 * Turn a thrown value into an {@link Error}.
 * @returns the value, or an Error describing it
 */
function toError(thrown: unknown): Error {
  return thrown instanceof Error ? thrown : new Error(String(thrown));
}

/**
 * Wrap a native maxcso reader in a {@link stream.Readable}. The stream closes the file in
 * `destroy()`, which it calls once it has ended or failed, after any read in flight finishes, and
 * emits `'close'` only once the file is closed (like Node.js fs.ReadStream).
 */
function readableFromReader(reader: NativeReader, highWaterMark?: number): stream.Readable {
  // The read in flight, which destroy() waits for before closing the reader
  let reading: ReturnType<NativeReader['read']> | undefined;
  return new stream.Readable({
    highWaterMark,
    async read(): Promise<void> {
      let chunk: Buffer | null;
      try {
        reading = reader.read(this.readableHighWaterMark);
        chunk = await reading;
      } catch (error) {
        reading = undefined;
        // Once destroyed, destroy() reports the error instead
        if (!this.destroyed) {
          this.destroy(toError(error));
        }
        return;
      }
      reading = undefined;
      // A chunk that arrives once destroyed is dropped
      if (this.destroyed) {
        return;
      }
      if (chunk === null || chunk.length === 0) {
        // eslint-disable-next-line unicorn/no-null
        this.push(null);
      } else {
        this.push(chunk);
      }
    },
    destroy(error, callback): void {
      // Reports an error closing over the one destroyed with, and that one over an error from the
      // read in flight (like Node.js fs.ReadStream)
      const pending = reading;
      void (async (): Promise<void> => {
        let result = error;
        try {
          await pending;
        } catch (readError) {
          result ??= toError(readError);
        }
        try {
          await reader.close();
        } catch (closeError) {
          result = toError(closeError);
        }
        callback(result);
      })();
    },
  });
}

export default {
  /**
   * Return header information about a CSO, ZSO, or DAX file. The file is opened, and its header
   * checked, on a worker thread. Its blocks aren't read, so a file that fails to decompress can
   * still return information.
   */
  async info(options: InfoOptions): Promise<MaxcsoInfo> {
    const raw = await loadBinding().info(options.inputFilename);
    const format = Object.values(MaxcsoFormat).find((value) => value === raw.format);
    if (format === undefined) {
      throw new Error(`unexpected maxcso container format: ${raw.format}`);
    }
    return {
      inputFile: options.inputFilename,
      format,
      uncompressedSize: raw.uncompressedSize,
      blockSize: raw.blockSize,
    };
  },

  /**
   * Open a {@link stream.Readable} over the full decompressed ISO byte range.
   */
  openReader(options: OpenReaderOptions): stream.Readable {
    const reader = loadBinding().openReader(options.inputFilename);
    return readableFromReader(reader, options.highWaterMark);
  },
};
