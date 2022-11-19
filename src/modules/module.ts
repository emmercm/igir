import ProgressBar from '../console/progressBar.js';

export default abstract class Module {
  protected readonly progressBar: ProgressBar;

  protected constructor(progressBar: ProgressBar, loggerPrefix: string) {
    this.progressBar = progressBar.withLoggerPrefix(loggerPrefix);
  }
}
