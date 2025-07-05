import type ProgressBar from '../console/progressBar.js';

/**
 * Base class for "modules," classes that have one method to perform some specific action.
 */
export default abstract class Module {
  protected readonly progressBar: ProgressBar;

  protected constructor(progressBar: ProgressBar, loggerPrefix: string) {
    this.progressBar = progressBar;
    this.progressBar.setLoggerPrefix(loggerPrefix);
  }
}
