import os from 'node:os';

/**
 * Get the relative native addon prebuild path.
 */
export function getPrebuildPath(): string {
  return `./addon-zlib-1.1.3/prebuilds/${os.platform()}-${os.arch()}/node.node`;
}
