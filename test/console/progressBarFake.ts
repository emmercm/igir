import ProgressBar from '../../src/console/progressBar.js';

export default class ProgressBarFake extends ProgressBar {
  addChildBar(): ProgressBar {
    return this;
  }

  setSymbol(): void {
    // @typescript-eslint/no-empty-function
  }

  setName(): void {
    // @typescript-eslint/no-empty-function
  }

  resetProgress(): void {
    // @typescript-eslint/no-empty-function
  }

  incrementCompleted(): void {
    // @typescript-eslint/no-empty-function
  }

  setCompleted(): void {
    // @typescript-eslint/no-empty-function
  }

  incrementInProgress(): void {
    // @typescript-eslint/no-empty-function
  }

  setInProgress(): void {
    // @typescript-eslint/no-empty-function
  }

  incrementTotal(): void {
    // @typescript-eslint/no-empty-function
  }

  setTotal(): void {
    // @typescript-eslint/no-empty-function
  }

  finish(): void {
    // @typescript-eslint/no-empty-function
  }

  setLoggerPrefix(): void {
    // @typescript-eslint/no-empty-function
  }

  log(): void {
    // @typescript-eslint/no-empty-function
  }

  freeze(): void {
    // @typescript-eslint/no-empty-function
  }

  delete(): void {
    // @typescript-eslint/no-empty-function
  }

  format(): string {
    return '';
  }
}
