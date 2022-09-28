/* eslint-disable class-methods-use-this */

import ProgressBar from '../../src/console/progressBar.js';

export default class ProgressBarFake extends ProgressBar {
  delete(): void {
  }

  done(): Promise<void> {
    return Promise.resolve();
  }

  increment(): Promise<void> {
    return Promise.resolve();
  }

  log(): Promise<void> {
    return Promise.resolve();
  }

  reset(): Promise<void> {
    return Promise.resolve();
  }

  setSymbol(): Promise<void> {
    return Promise.resolve();
  }

  update(): Promise<void> {
    return Promise.resolve();
  }
}
