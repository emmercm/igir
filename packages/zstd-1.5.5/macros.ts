import os from 'node:os';

/**
 * Get the relative native addon prebuild path.
 */
export function getPrebuildPath(): string {
  return `./addon-zstd-1.5.5/prebuilds/${os.platform()}-${os.arch()}/node.node`;
}
