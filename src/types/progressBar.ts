import cliProgress, { MultiBar, SingleBar } from 'cli-progress';

import Logger from '../logger';

export default class ProgressBar {
  private static multiBar: MultiBar;

  private singleBar: SingleBar;

  constructor(maxNameLength: number, name: string) {
    if (!ProgressBar.multiBar) {
      ProgressBar.multiBar = new cliProgress.MultiBar({
        format: (options, params, payload) => {
          const bar = (options.barCompleteString || '').substr(0, Math.round(params.progress * (options.barsize || 0)));

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
          line += `${bar} | ${params.value}/${params.total}`;

          return line;
        },
        stream: Logger.stream,
        fps: 1,
        hideCursor: true,
      }, cliProgress.Presets.shades_grey);
    }

    this.singleBar = ProgressBar.multiBar.create(100, 0, {
      name,
    });
  }

  reset(total: number) {
    this.singleBar.setTotal(total);
    this.singleBar.update(0);
    ProgressBar.multiBar.update();
    return this;
  }

  setSymbol(symbol: string) {
    this.singleBar.update({
      symbol,
    });
    ProgressBar.multiBar.update();
    return this;
  }

  increment() {
    this.singleBar.increment();
    ProgressBar.multiBar.update();
    return this;
  }

  static stop() {
    this.multiBar.stop();
  }
}
