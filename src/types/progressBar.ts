import { E_CANCELED, Mutex } from 'async-mutex';
import cliProgress, { MultiBar, SingleBar } from 'cli-progress';

import Logger from '../logger.js';

interface ProgressBarPayload {
  symbol?: string,
  name?: string,
  finishedMessage?: string
}

/* eslint-disable class-methods-use-this */
export default class ProgressBar {
  private static readonly etaBufferLength = 100;

  private static readonly renderMutex = new Mutex();

  private static multiBar: MultiBar;

  private static progressBars: ProgressBar[] = [];

  private static lastRedraw = process.hrtime();

  private readonly singleBar: SingleBar;

  private valueBuffer: number[] = [];

  private timeBuffer: number[] = [];

  private eta: number | string = '0';

  constructor(name: string, symbol: string, initialTotal = 0) {
    if (!ProgressBar.multiBar) {
      ProgressBar.multiBar = new cliProgress.MultiBar({
        stream: Logger.stream,
        barsize: 25,
        emptyOnZero: true,
        hideCursor: true,
      }, cliProgress.Presets.shades_grey);
    }

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
          const completeSize = Math.round(params.progress * barSize);
          const incompleteSize = barSize - completeSize;
          const bar = (options.barCompleteString || '').slice(0, completeSize)
            + options.barGlue
            + (options.barIncompleteString || '').slice(0, incompleteSize);

          let line = '';

          if (payload.symbol) {
            line += `${payload.symbol} `;
          }

          if (payload.name) {
            const maxNameLength = 30;
            const payloadName = payload.name.slice(0, maxNameLength);
            const paddedName = payloadName.length > maxNameLength - 1
              ? payloadName.padEnd(maxNameLength, ' ')
              : `${payloadName} ${'·'.repeat(maxNameLength - 1 - payloadName.length)}`;
            line += paddedName;
          }

          if (payload.finishedMessage) {
            line += ` | ${payload.finishedMessage}`;
          } else {
            line += ` | ${bar}`;
            if (params.total > 0) {
              line += ` | ${params.value.toLocaleString()}/${params.total.toLocaleString()}`;
              if (params.value > 0 && params.value < params.total) {
                line += ` | ETA: ${this.getEtaFormatted()}`;
              }
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
  }

  static async stop() {
    this.multiBar.stop();
    await ProgressBar.render();
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
   * Applications that are too synchronous or have a high concurrency (e.g. with async.js, p-limit,
   * p-map, etc.) keep cli-progress from redrawing with its setTimeout(), so it might be necessary
   * to force it. This function needs to be safe to be called concurrently because of the way
   * cli-progress clears previous output.
   *
   * @see https://github.com/npkgz/cli-progress/issues/79
   */
  private static async render() {
    try {
      await this.renderMutex.runExclusive(() => {
        // Limit to 200ms = 5 FPS
        const elapsed = process.hrtime(this.lastRedraw);
        const elapsedMs = (elapsed[0] * 1000000000 + elapsed[1]) / 1000000;
        if (elapsedMs >= 200) {
          this.multiBar.update();
          this.lastRedraw = process.hrtime();
          this.renderMutex.cancel(); // cancel all waiting locks, we just redrew
        }
      });
    } catch (e) {
      if (e !== E_CANCELED) {
        throw e;
      }
    }
  }

  async reset(total: number) {
    this.singleBar.setTotal(total);
    this.singleBar.update(0);
    await ProgressBar.render();
  }

  async setSymbol(symbol: string) {
    this.singleBar.update({
      symbol,
    } as ProgressBarPayload);
    await ProgressBar.render();
  }

  async increment() {
    this.singleBar.increment();
    await ProgressBar.render();
  }

  async update(current: number) {
    this.singleBar.update(current);
    await ProgressBar.render();
  }

  async done(finishedMessage?: string) {
    await this.setSymbol('✅');

    if (this.singleBar.getTotal() > 0) {
      this.singleBar.update(this.singleBar.getTotal());
    } else {
      this.singleBar.update(this.singleBar.getTotal() + 1);
    }

    if (finishedMessage) {
      this.singleBar.update({
        finishedMessage,
      } as ProgressBarPayload);
    }

    await ProgressBar.render();
  }

  async log(message: string) {
    ProgressBar.multiBar.log(`${message}\n`);
    await ProgressBar.render();
  }

  async logWarn(message: string) {
    ProgressBar.multiBar.log(`${Logger.warnFormatter(message)}\n`);
    await ProgressBar.render();
  }

  async logError(message: string) {
    ProgressBar.multiBar.log(`${Logger.errorFormatter(message)}\n`);
    await ProgressBar.render();
  }

  /**
   * When the number of progress bars exceeds the height of the console, cli-progress fails to be
   * able to clear them all reliably. It's recommended you don't have too many active progress bars
   * at once.
   */
  async delete() {
    ProgressBar.multiBar.remove(this.singleBar);
    ProgressBar.progressBars = ProgressBar.progressBars
      .filter((progressBar) => progressBar !== this);
    await ProgressBar.render();
  }
}
