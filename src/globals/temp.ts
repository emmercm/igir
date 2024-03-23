import os from 'node:os';
import path from 'node:path';

import moment from 'moment';

import FsPoly from '../polyfill/fsPoly.js';
import Package from './package.js';

const DATE_TIME = moment().format('YYYYMMDD-HHmmss');

/**
 * A static class of constants for temp directories, to be used widely.
 */
export default class Temp {
  private static globalTempDir = path.join(os.tmpdir(), Package.NAME);

  public static getTempDir(): string {
    return path.join(this.globalTempDir, DATE_TIME);
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
