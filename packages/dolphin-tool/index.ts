import module from 'node:module';
import os from 'node:os';
import stream from 'node:stream';

import Defaults from '../../src/globals/defaults.js';

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
}

interface NativeReader {
  read: (maxBytes: number) => Promise<Buffer | null>;
  close: () => void;
}

interface DolphinBinding {
  info: (inputFilename: string) => Promise<Omit<DolphinInfo, 'format'> & { format: string }>;
  openReader: (inputFilename: string) => NativeReader;
}

const binding = ((): DolphinBinding => {
  try {
    return require(
      `./addon-dolphin-tool/prebuilds/${os.platform()}-${os.arch()}/node.node`,
    ) as DolphinBinding;
  } catch {
    /* ignored */
  }
  return require('./addon-dolphin-tool/build/Release/dolphin-tool.node') as DolphinBinding;
})();

/**
 * Wrap a native Dolphin reader in a {@link stream.Readable}. The reader is closed
 * when the stream ends, errors, or is destroyed.
 */
function readableFromReader(reader: NativeReader): stream.Readable {
  let isClosed = false;
  const closeOnce = (): void => {
    if (isClosed) {
      return;
    }
    isClosed = true;
    reader.close();
  };
  return new stream.Readable({
    highWaterMark: Defaults.FILE_READING_CHUNK_SIZE,
    async read(): Promise<void> {
      try {
        const chunk = await reader.read(Defaults.FILE_READING_CHUNK_SIZE);
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
   * Return structured header information about a Dolphin disc image without decompressing.
   */
  async info(options: InfoOptions): Promise<DolphinInfo> {
    const raw = await binding.info(options.inputFilename);
    const format = Object.values(ContainerFormat).find((value) => value === raw.format);
    if (format === undefined) {
      throw new Error(`unexpected Dolphin container format: ${raw.format}`);
    }
    return { ...raw, format };
  },

  /**
   * Open a {@link stream.Readable} over the full decompressed ISO byte range.
   */
  async openReader(options: OpenReaderOptions): Promise<stream.Readable> {
    const reader = binding.openReader(options.inputFilename);
    return await Promise.resolve(readableFromReader(reader));
  },
};
