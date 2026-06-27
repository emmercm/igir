import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

import DateUtil from '../utils/dateUtil.js';
import FsUtil from '../utils/fsUtil.js';
import Package from './package.js';

/**
 * A static class of constants for temp directories, to be used widely.
 */
export default class Temp {
  // Note: this default path is explicitly not created immediately in case it gets changed by CLI
  // options
  private static globalTempDir = path.join(
    os.tmpdir(),
    Package.NAME,
    DateUtil.format('YYYYMMDD-HHmmss') +
      (process.env.NODE_ENV === 'test'
        ? `.${crypto.randomBytes(4).readUInt32LE().toString(36)}`
        : ''),
  );

  static getTempDir(): string {
    return this.globalTempDir;
  }

  static setTempDir(globalTempDir: string): void {
    this.globalTempDir = globalTempDir;
  }
}

// eslint-disable-next-line unicorn/no-top-level-side-effects
process.once('exit', () => {
  FsUtil.rmSync(Temp.getTempDir(), {
    force: true,
    recursive: true,
  });
});
