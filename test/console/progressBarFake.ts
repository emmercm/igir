import ProgressBar from '../../src/console/progressBar.js';

export default class ProgressBarFake extends ProgressBar {
  delete(): void {
    // @typescript-eslint/no-empty-function
  }

  done(): void {
    // @typescript-eslint/no-empty-function
  }

  addWaitingMessage(): void {
    // @typescript-eslint/no-empty-function
  }

  removeWaitingMessage(): void {
    // @typescript-eslint/no-empty-function
  }

  incrementTotal(): void {
    // @typescript-eslint/no-empty-function
  }

  incrementProgress(): void {
    // @typescript-eslint/no-empty-function
  }

  incrementDone(): void {
    // @typescript-eslint/no-empty-function
  }

  setLoggerPrefix(): ProgressBar {
    return this;
  }

  log(): void {
    // @typescript-eslint/no-empty-function
  }

  reset(): void {
    // @typescript-eslint/no-empty-function
  }

  setName(): void {
    // @typescript-eslint/no-empty-function
  }

  setSymbol(): void {
    // @typescript-eslint/no-empty-function
  }

  freeze(): void {
    // @typescript-eslint/no-empty-function
  }

  update(): void {
    // @typescript-eslint/no-empty-function
  }
}
