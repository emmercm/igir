import os from 'node:os';
import path from 'node:path';

import moment from 'moment';

import FsPoly from '../polyfill/fsPoly.js';
import Package from './package.js';

/**
 * A static class of constants for temp directories, to be used widely.
 */
export default class Temp {
  private static globalTempDir = path.join(os.tmpdir(), Package.NAME, moment().format('YYYYMMDD-HHmmss'));

  public static getTempDir(): string {
    return this.globalTempDir;
  }

  public static setTempDir(globalTempDir: string): void {
    this.globalTempDir = globalTempDir;
  }
}

process.once('beforeExit', async () => {
  // WARN: Jest won't call this: https://github.com/jestjs/jest/issues/10927
  await FsPoly.rm(Temp.getTempDir(), {
    force: true,
    recursive: true,
  });
});
