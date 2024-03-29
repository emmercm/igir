/* eslint-disable class-methods-use-this */

import ProgressBar from '../../src/console/progressBar.js';

export default class ProgressBarFake extends ProgressBar {
  delete(): void {}

  async done(): Promise<void> {
    return Promise.resolve();
  }

  addWaitingMessage(): void {}

  async removeWaitingMessage(): Promise<void> {
    return Promise.resolve();
  }

  async incrementTotal(): Promise<void> {
    return Promise.resolve();
  }

  async incrementProgress(): Promise<void> {
    return Promise.resolve();
  }

  async incrementDone(): Promise<void> {
    return Promise.resolve();
  }

  withLoggerPrefix(): ProgressBar {
    return this;
  }

  log(): void {}

  async reset(): Promise<void> {
    return Promise.resolve();
  }

  async setName(): Promise<void> {
    return Promise.resolve();
  }

  async setSymbol(): Promise<void> {
    return Promise.resolve();
  }

  async freeze(): Promise<void> {
    return Promise.resolve();
  }

  async update(): Promise<void> {
    return Promise.resolve();
  }
}
