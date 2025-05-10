import ProgressBar from '../../src/console/progressBar.js';

export default class ProgressBarFake extends ProgressBar {
  delete(): void {
    // @typescript-eslint/no-empty-function
  }

  finish(): void {
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

  incrementInProgress(): void {
    // @typescript-eslint/no-empty-function
  }

  incrementCompleted(): void {
    // @typescript-eslint/no-empty-function
  }

  setLoggerPrefix(): ProgressBar {
    return this;
  }

  log(): void {
    // @typescript-eslint/no-empty-function
  }

  resetProgress(): void {
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

  setCompleted(): void {
    // @typescript-eslint/no-empty-function
  }
}
