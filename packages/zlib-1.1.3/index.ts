import module from 'node:module';
import os from 'node:os';

const require = module.createRequire(import.meta.url);

export interface ZlibBinding {
  Deflater: new (level?: number) => DeflaterInstance;

  /**
   * Get the zlib library version
   * @returns Version string (e.g. "1.1.3")
   */
  getZlibVersion: () => string;

  // Flush mode constants
  Z_NO_FLUSH: number;
  Z_SYNC_FLUSH: number;
  Z_FULL_FLUSH: number;
  Z_FINISH: number;
}

export interface DeflaterInstance {
  /**
   * Compress a chunk of data
   * @param chunk Data buffer to compress
   * @param flush Flush mode (Z_NO_FLUSH, Z_SYNC_FLUSH, Z_FULL_FLUSH, Z_FINISH, Z_BLOCK)
   * @returns Compressed data buffer
   */
  compressChunk: (chunk: Buffer, flush?: number) => Buffer;

  /**
   * Finalize compression and return any remaining compressed data
   * @returns Final compressed data buffer
   */
  end: () => Buffer;

  /**
   * Release resources without attempting to retrieve final data
   * Use this for cleanup in error scenarios
   */
  dispose: () => void;
}

export const ZlibCompressionLevel = {
  Z_NO_COMPRESSION: 0,
  Z_BEST_SPEED: 1,
  Z_BEST_COMPRESSION: 9,
  Z_DEFAULT_COMPRESSION: -1,
} as const;
export type ZlibCompressionLevelKey = keyof typeof ZlibCompressionLevel;
export type ZlibCompressionLevelValue =
  (typeof ZlibCompressionLevel)[keyof typeof ZlibCompressionLevel];

// TODO(cemmer): this will cause compilers like Bun to include every architecture's prebuild
//  into every binary, but Parcel import attribute macros don't seem to be an option because Bun
//  seems to only bundle paths referenced in imports and not require()s
import darwinArm64 from './addon-zlib-1.1.3/prebuilds/darwin-arm64/node.node' with { type: 'file' };
import darwinX64 from './addon-zlib-1.1.3/prebuilds/darwin-x64/node.node' with { type: 'file' };
import linuxArm64 from './addon-zlib-1.1.3/prebuilds/linux-arm64/node.node' with { type: 'file' };
import linuxX64 from './addon-zlib-1.1.3/prebuilds/linux-x64/node.node' with { type: 'file' };
import win32Arm64 from './addon-zlib-1.1.3/prebuilds/win32-arm64/node.node' with { type: 'file' };
import win32X64 from './addon-zlib-1.1.3/prebuilds/win32-x64/node.node' with { type: 'file' };

const zlib = ((): ZlibBinding => {
  try {
    switch (`${os.platform()}-${os.arch()}`) {
      case 'darwin-arm64': {
        return require(darwinArm64) as ZlibBinding;
      }
      case 'darwin-x64': {
        return require(darwinX64) as ZlibBinding;
      }
      case 'linux-arm64': {
        return require(linuxArm64) as ZlibBinding;
      }
      case 'linux-x64': {
        return require(linuxX64) as ZlibBinding;
      }
      case 'win32-arm64': {
        return require(win32Arm64) as ZlibBinding;
      }
      case 'win32-x64': {
        return require(win32X64) as ZlibBinding;
      }
    }
  } catch {
    /* ignored */
  }
  return require('./addon-zlib-1.1.3/build/Release/zlib.node') as ZlibBinding;
})();
export default zlib;
