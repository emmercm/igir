import os from 'node:os';
import path from 'node:path';

import moment from 'moment';

import FsPoly from '../polyfill/fsPoly.js';
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
    moment().format('YYYYMMDD-HHmmss'),
  );

  static getTempDir(): string {
    return this.globalTempDir;
  }

  static setTempDir(globalTempDir: string): void {
    this.globalTempDir = globalTempDir;
  }
}

process.once('exit', () => {
  FsPoly.rmSync(Temp.getTempDir(), {
    force: true,
    recursive: true,
  });
});
