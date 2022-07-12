import cliProgress, { MultiBar, SingleBar } from 'cli-progress';

import Logger from '../logger.js';

interface ProgressBarPayload {
  symbol?: string,
  name?: string,
  progressMessage?: string
}

export default class ProgressBar {
  private static multiBar: MultiBar;

  private readonly singleBar: SingleBar;

  constructor(maxNameLength: number, name: string, symbol: string, total: number) {
    if (!ProgressBar.multiBar) {
      ProgressBar.multiBar = new cliProgress.MultiBar({
        format: (options, params, payload: ProgressBarPayload) => {
          const completeSize = Math.round(params.progress * (options.barsize || 0));
          const incompleteSize = (options.barsize || 0) - completeSize;
          const bar = (options.barCompleteString || '').substr(0, completeSize)
              + options.barGlue
              + (options.barIncompleteString || '').substr(0, incompleteSize);

          let line = '';
          if (payload.symbol) {
            line += `${payload.symbol} `;
          }
          if (payload.name) {
            const paddedName = payload.name.length > maxNameLength - 1
              ? payload.name.padEnd(maxNameLength, ' ')
              : `${payload.name} ${'·'.repeat(maxNameLength - 1 - payload.name.length)}`;
            line += `${paddedName} | `;
          }
          line += `${bar} | `;
          if (payload.progressMessage) {
            line += payload.progressMessage;
          } else {
            line += `${params.value}/${params.total} | ETA: {eta}`;
          }

          return line;
        },
        stream: Logger.stream,
        fps: 1,
        hideCursor: true,
      }, cliProgress.Presets.shades_grey);
    }

    this.singleBar = ProgressBar.multiBar.create(total, 0, {
      symbol,
      name,
    } as ProgressBarPayload);
  }

  reset(total: number) {
    this.singleBar.setTotal(total);
    this.singleBar.update(0);
    ProgressBar.multiBar.update(); // https://github.com/npkgz/cli-progress/issues/79
    return this;
  }

  setSymbol(symbol: string) {
    this.singleBar.update({
      symbol,
    } as ProgressBarPayload);
    ProgressBar.multiBar.update(); // https://github.com/npkgz/cli-progress/issues/79
    return this;
  }

  increment() {
    this.singleBar.increment();
    ProgressBar.multiBar.update(); // https://github.com/npkgz/cli-progress/issues/79
    return this;
  }

  done() {
    this.singleBar.update(this.singleBar.getTotal());
    ProgressBar.multiBar.update(); // https://github.com/npkgz/cli-progress/issues/79
    return this;
  }

  setProgressMessage(message: string) {
    this.singleBar.update({
      progressMessage: message,
    } as ProgressBarPayload);
    ProgressBar.multiBar.update(); // https://github.com/npkgz/cli-progress/issues/79
    return this;
  }

  update(current: number) {
    this.singleBar.update(current);
    ProgressBar.multiBar.update(); // https://github.com/npkgz/cli-progress/issues/79
    return this;
  }

  static log(message: string) {
    ProgressBar.multiBar.log(`${message}\n`);
    ProgressBar.multiBar.update(); // https://github.com/npkgz/cli-progress/issues/79
  }

  static stop() {
    this.multiBar.stop();
  }
}
