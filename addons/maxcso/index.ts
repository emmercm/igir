import module from 'node:module';
import os from 'node:os';
import stream from 'node:stream';

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
  close: () => void;
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
    try {
      // Try to load the development build
      return require('./build/Release/maxcso.node') as MaxcsoBinding;
    } catch {
      try {
        // Try to load the prebuild
        return require(
          `./addon-maxcso/prebuilds/${os.platform()}-${os.arch()}/node.node`,
        ) as MaxcsoBinding;
      } catch {
        // Try to load the postinstall build
        return require('./addon-maxcso/build/Release/maxcso.node') as MaxcsoBinding;
      }
    }
  })();
  return bindingInstance.binding;
}

/**
 * Wrap a native maxcso reader in a {@link stream.Readable}. The reader is closed
 * when the stream ends, errors, or is destroyed.
 */
function readableFromReader(reader: NativeReader, highWaterMark?: number): stream.Readable {
  let isClosed = false;
  const closeOnce = (): void => {
    if (isClosed) {
      return;
    }
    isClosed = true;
    reader.close();
  };
  return new stream.Readable({
    highWaterMark,
    async read(): Promise<void> {
      try {
        const chunk = await reader.read(this.readableHighWaterMark);
        if (chunk === null || chunk.length === 0) {
          closeOnce();
          // eslint-disable-next-line unicorn/no-null
          this.push(null);
        } else {
          this.push(chunk);
        }
      } catch (error) {
        closeOnce();
        this.destroy(error instanceof Error ? error : new Error(String(error)));
      }
    },
    destroy(error, callback): void {
      closeOnce();
      callback(error);
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
