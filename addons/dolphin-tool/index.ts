import module from 'node:module';
import os from 'node:os';
import stream from 'node:stream';

import { type Context, getDefaultContext } from '@emnapi/runtime';

const require = module.createRequire(import.meta.url);

export const ContainerFormat = {
  GCZ: 'GCZ',
  WIA: 'WIA',
  RVZ: 'RVZ',
} as const;
export type ContainerFormat = (typeof ContainerFormat)[keyof typeof ContainerFormat];

export interface DolphinInfo {
  inputFile: string;
  format: ContainerFormat;
  decompressedSize: number;
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
  // Resolves once the blob is closed
  close: () => Promise<void>;
}

interface DolphinBinding {
  info: (inputFilename: string) => Promise<Omit<DolphinInfo, 'format'> & { format: string }>;
  openReader: (inputFilename: string) => NativeReader;
}

const bindingInstance: { binding?: DolphinBinding } = {};

/**
 * Load the native addon on first use, rather than at import, so that importing this
 * module's types and constants never loads a binary that may go unused.
 */
function loadBinding(): DolphinBinding {
  bindingInstance.binding ??= ((): DolphinBinding => {
    if (process.env.IGIR_ADDONS !== 'wasm') {
      try {
        // Try to load the development build
        return require('./build/Release/dolphin-tool.node') as DolphinBinding;
      } catch {
        // Ignored
      }

      try {
        // Try to load the prebuild
        return require(
          `./addon-dolphin-tool/prebuilds/${os.platform()}-${os.arch()}/node.node`,
        ) as DolphinBinding;
      } catch (error) {
        // The native build is required, rather than falling back to the WebAssembly build
        if (process.env.IGIR_ADDONS === 'native') {
          throw error;
        }
      }
    }

    // Load the WebAssembly build, which runs on any platform, but slower than a native build
    const wasmModule = require('./addon-dolphin-tool/wasm/dolphin-tool.cjs') as {
      emnapiInit: (options: { context: Context }) => DolphinBinding;
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
 * Wrap a native Dolphin reader in a {@link stream.Readable}. The stream closes the blob in
 * `destroy()`, which it calls once it has ended or failed, after any read in flight finishes, and
 * emits `'close'` only once the blob is closed (like Node.js fs.ReadStream).
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
   * Return structured header information about a Dolphin disc image without decompressing.
   */
  async info(options: InfoOptions): Promise<DolphinInfo> {
    const raw = await loadBinding().info(options.inputFilename);
    const format = Object.values(ContainerFormat).find((value) => value === raw.format);
    if (format === undefined) {
      throw new Error(`unexpected Dolphin container format: ${raw.format}`);
    }
    return { ...raw, format };
  },

  /**
   * Open a {@link stream.Readable} over the full decompressed ISO byte range.
   */
  openReader(options: OpenReaderOptions): stream.Readable {
    const reader = loadBinding().openReader(options.inputFilename);
    return readableFromReader(reader, options.highWaterMark);
  },
};
