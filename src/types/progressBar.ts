import cliProgress, { MultiBar, SingleBar } from 'cli-progress';

import Logger from '../logger.js';

interface ProgressBarPayload {
  symbol?: string,
  name?: string,
  progressMessage?: string
}

export default class ProgressBar {
  private static readonly etaBufferLength = 100;

  private static multiBar: MultiBar;

  private static progressBars: ProgressBar[] = [];

  private readonly name: string;

  private readonly singleBar: SingleBar;

  private valueBuffer: number[] = [];

  private timeBuffer: number[] = [];

  private eta: number | string = '0';

  constructor(name: string, symbol: string, initialTotal: number) {
    if (!ProgressBar.multiBar) {
      ProgressBar.multiBar = new cliProgress.MultiBar({
        stream: Logger.stream,
        fps: 1,
        hideCursor: true,
      }, cliProgress.Presets.shades_grey);
    }

    this.name = name;
    this.singleBar = ProgressBar.multiBar.create(
      initialTotal,
      0,
      {
        symbol,
        name,
      } as ProgressBarPayload,
      {
        format: (options, params, payload: ProgressBarPayload) => {
          const barSize = options.barsize || 0;
          const completeSize = (params.total > 0 || params.value > params.total)
            ? Math.round(params.progress * barSize)
            : 0;
          const incompleteSize = barSize - completeSize;
          const bar = (options.barCompleteString || '').substr(0, completeSize)
            + options.barGlue
            + (options.barIncompleteString || '').substr(0, incompleteSize);

          let line = '';

          if (payload.symbol) {
            line += `${payload.symbol} `;
          }

          if (payload.name) {
            const maxNameLength = ProgressBar.progressBars
              .reduce((max, progressBar) => Math.max(max, progressBar.getName().length), 0);
            const paddedName = payload.name.length > maxNameLength - 1
              ? payload.name.padEnd(maxNameLength, ' ')
              : `${payload.name} ${'·'.repeat(maxNameLength - 1 - payload.name.length)}`;
            line += `${paddedName} | `;
          }

          line += `${bar}`;

          if (payload.progressMessage) {
            line += ` | ${payload.progressMessage}`;
          } else if (params.total > 0) {
            line += ` | ${params.value.toLocaleString()}/${params.total.toLocaleString()}`;
            if (params.value > 0 && params.value < params.total) {
              line += ` | ETA: ${this.getEtaFormatted()}`;
            }
          }

          return line;
        },
      },
    );

    this.singleBar.addListener('start', (total: number, start: number) => {
      // cli-progress/lib/GenericBar()
      this.valueBuffer = [start || 0];
      this.timeBuffer = [Date.now()];
      this.eta = '0';
    });
    this.singleBar.addListener('update', (total: number, value: number) => {
      // cli-progress/lib/ETA.update()
      this.valueBuffer.push(value);
      this.timeBuffer.push(Date.now());
      this.calculateEta(total - value);
    });

    ProgressBar.progressBars.push(this);
    ProgressBar.render();
  }

  static log(message: string) {
    ProgressBar.multiBar.log(`${message}\n`);
    this.render();
  }

  static logWarn(message: string) {
    ProgressBar.multiBar.log(`${Logger.warnFormatter(message)}\n`);
    this.render();
  }

  static logError(message: string) {
    ProgressBar.multiBar.log(`${Logger.errorFormatter(message)}\n`);
    this.render();
  }

  static stop() {
    this.multiBar.stop();
  }

  private calculateEta(remaining: number) {
    // cli-progress/lib/ETA.calculate()
    const currentBufferSize = this.valueBuffer.length;
    const buffer = Math.min(ProgressBar.etaBufferLength, currentBufferSize);
    const vDiff = this.valueBuffer[currentBufferSize - 1]
        - this.valueBuffer[currentBufferSize - buffer];
    const tDiff = this.timeBuffer[currentBufferSize - 1]
        - this.timeBuffer[currentBufferSize - buffer];
    const vtRate = vDiff / tDiff;
    this.valueBuffer = this.valueBuffer.slice(-ProgressBar.etaBufferLength);
    this.timeBuffer = this.timeBuffer.slice(-ProgressBar.etaBufferLength);
    const eta = Math.ceil(remaining / vtRate / 1000);
    if (Number.isNaN(eta)) {
      this.eta = 'NULL';
    } else if (!Number.isFinite(eta)) {
      this.eta = 'INF';
    } else if (eta > 1e7) {
      this.eta = 'INF';
    } else if (eta < 0) {
      this.eta = 0;
    } else {
      this.eta = eta;
    }
  }

  private getEtaFormatted(): string {
    // cli-progress/lib/formatTime()
    const round = (input: number): number => 5 * Math.round(input / 5);
    const t = this.eta as number;
    if (t >= 3600) {
      return `${Math.floor(t / 3600)}h${round((t % 3600) / 60)}m`;
    } if (t >= 60) {
      return `${Math.floor(t / 60)}m${round((t % 60))}s`;
    } if (t >= 10) {
      return `${round(t)}s`;
    }
    return `${t}s`;
  }

  /**
   * @see https://github.com/npkgz/cli-progress/issues/79
   */
  static render() {
    ProgressBar.multiBar.update();
  }

  getName(): string {
    return this.name;
  }

  reset(total: number): ProgressBar {
    this.singleBar.setTotal(total);
    this.singleBar.update(0);
    ProgressBar.render(); return this;
  }

  setSymbol(symbol: string): ProgressBar {
    this.singleBar.update({
      symbol,
    } as ProgressBarPayload);
    ProgressBar.render(); return this;
  }

  increment(): ProgressBar {
    this.singleBar.increment();
    ProgressBar.render(); return this;
  }

  done(): ProgressBar {
    if (this.singleBar.getTotal() > 0) {
      this.singleBar.update(this.singleBar.getTotal());
    } else {
      this.singleBar.update(this.singleBar.getTotal() + 1);
    }
    ProgressBar.multiBar.update(); // https://github.com/npkgz/cli-progress/issues/79
    return this;
  }

  setProgressMessage(message: string): ProgressBar {
    this.singleBar.update({
      progressMessage: message,
    } as ProgressBarPayload);
    ProgressBar.render(); return this;
  }

  update(current: number): ProgressBar {
    this.singleBar.update(current);
    ProgressBar.render(); return this;
  }

  delete() {
    ProgressBar.multiBar.remove(this.singleBar);
    ProgressBar.progressBars = ProgressBar.progressBars
      .filter((progressBar) => progressBar !== this);
  }
}
