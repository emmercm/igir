import ProgressBar from '../../src/console/progressBar.js';

export default class ProgressBarFake extends ProgressBar {
  delete(): void {}

  done(): void {}

  addWaitingMessage(): void {}

  removeWaitingMessage(): void {}

  incrementTotal(): void {}

  incrementProgress(): void {}

  incrementDone(): void {}

  setLoggerPrefix(): ProgressBar {
    return this;
  }

  log(): void {}

  reset(): void {}

  setName(): void {}

  setSymbol(): void {}

  freeze(): void {}

  update(): void {}
}
