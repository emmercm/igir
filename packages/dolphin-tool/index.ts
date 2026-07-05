import fs from 'node:fs';
import module from 'node:module';
import os from 'node:os';
import path from 'node:path';
import stream from 'node:stream';

import Defaults from '../../src/globals/defaults.js';

const require = module.createRequire(import.meta.url);

// TEMPORARY DIAGNOSTIC (revert before merge): isolate where the compiled Bun
// Windows binary hard-crashes when reading a Dolphin disc image. A synchronous
// write straight to fd 2 (stderr) reaches the OS before a subsequent native
// access violation can occur, unlike Bun's buffered stdout, whose contents are
// lost when the process dies. Marker lines are grep-friendly ("DOLPHIN-DIAG").
const diag = (message: string): void => {
  try {
    fs.writeSync(2, `DOLPHIN-DIAG ${message}\n`);
  } catch {
    /* ignored */
  }
};

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
    // NOTE: keep this an inline template literal — scripts/compile.ts's
    // require-rewriter only bundles `require('...node')` string/template calls.
    const prebuild = require(
      `./addon-dolphin-tool/prebuilds/${os.platform()}-${os.arch()}/node.node`,
    ) as DolphinBinding;
    diag(`binding: loaded prebuild for ${os.platform()}-${os.arch()}`);
    return prebuild;
  } catch (error) {
    diag(
      `binding: prebuild load failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const fallback =
    require('./addon-dolphin-tool/build/Release/dolphin-tool.node') as DolphinBinding;
  diag('binding: loaded build/Release fallback');
  return fallback;
})();

/**
 * Wrap a native Dolphin reader in a {@link stream.Readable}. The reader is closed
 * when the stream ends, errors, or is destroyed.
 */
function readableFromReader(reader: NativeReader, inputFilename: string): stream.Readable {
  const label = path.basename(inputFilename);
  let readIndex = 0;
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
      const currentRead = readIndex;
      readIndex += 1;
      diag(`read: ${label} #${currentRead} enter`);
      try {
        const chunk = await reader.read(Defaults.FILE_READING_CHUNK_SIZE);
        diag(`read: ${label} #${currentRead} returned ${chunk === null ? 'null' : chunk.length}`);
        if (chunk === null || chunk.length === 0) {
          closeOnce();
          // eslint-disable-next-line unicorn/no-null
          this.push(null);
        } else {
          this.push(chunk);
        }
      } catch (error) {
        diag(
          `read: ${label} #${currentRead} threw ${error instanceof Error ? error.message : String(error)}`,
        );
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
    diag(`info: enter ${path.basename(options.inputFilename)}`);
    const raw = await binding.info(options.inputFilename);
    diag(`info: native returned ${path.basename(options.inputFilename)} format=${raw.format}`);
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
    diag(`openReader: enter ${path.basename(options.inputFilename)}`);
    const reader = binding.openReader(options.inputFilename);
    diag(`openReader: native ctor returned ${path.basename(options.inputFilename)}`);
    return await Promise.resolve(readableFromReader(reader, options.inputFilename));
  },
};
