/* eslint-disable class-methods-use-this */

import ProgressBar from '../../src/console/progressBar.js';

export default class ProgressBarFake implements ProgressBar {
  delete(): void {
  }

  done(): Promise<void> {
    return Promise.resolve(undefined);
  }

  increment(): Promise<void> {
    return Promise.resolve(undefined);
  }

  log(): Promise<void> {
    return Promise.resolve(undefined);
  }

  logDebug(): Promise<void> {
    return Promise.resolve(undefined);
  }

  logInfo(): Promise<void> {
    return Promise.resolve(undefined);
  }

  logWarn(): Promise<void> {
    return Promise.resolve(undefined);
  }

  logError(): Promise<void> {
    return Promise.resolve(undefined);
  }

  reset(): Promise<void> {
    return Promise.resolve(undefined);
  }

  setSymbol(): Promise<void> {
    return Promise.resolve(undefined);
  }

  update(): Promise<void> {
    return Promise.resolve(undefined);
  }
}
