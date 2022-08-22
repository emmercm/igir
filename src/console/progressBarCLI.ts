import { E_CANCELED, Mutex } from 'async-mutex';
import cliProgress, { MultiBar, SingleBar } from 'cli-progress';
import { PassThrough } from 'stream';

import Logger, { LogLevel } from './logger.js';
import ProgressBar from './progressBar.js';

interface ProgressBarPayload {
  symbol?: string,
  name?: string,
  finishedMessage?: string
}

/* eslint-disable class-methods-use-this */
export default class ProgressBarCLI implements ProgressBar {
  private static readonly fps = 4;

  private static readonly etaBufferLength = 100;

  private static readonly renderMutex = new Mutex();

  private static multiBar: MultiBar;

  private static lastRedraw = process.hrtime();

  private readonly logger: Logger;

  private readonly singleBar: SingleBar;

  private valueBuffer: number[] = [];

  private timeBuffer: number[] = [];

  private eta: number | string = '0';

  constructor(logger: Logger, name: string, symbol: string, initialTotal = 0) {
    this.logger = logger;

    if (!ProgressBarCLI.multiBar) {
      ProgressBarCLI.multiBar = new cliProgress.MultiBar({
        stream: logger.getLogLevel() < LogLevel.OFF ? Logger.stream : new PassThrough(),
        barsize: 25,
        fps: ProgressBarCLI.fps,
        emptyOnZero: true,
        hideCursor: true,
      }, cliProgress.Presets.shades_grey);
    }

    this.singleBar = ProgressBarCLI.multiBar.create(
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
  }

  static stop() {
    this.multiBar.stop();
    // Forcing a render shouldn't be necessary
  }

  private calculateEta(remaining: number) {
    // cli-progress/lib/ETA.calculate()
    const currentBufferSize = this.valueBuffer.length;
    const buffer = Math.min(ProgressBarCLI.etaBufferLength, currentBufferSize);
    const vDiff = this.valueBuffer[currentBufferSize - 1]
        - this.valueBuffer[currentBufferSize - buffer];
    const tDiff = this.timeBuffer[currentBufferSize - 1]
        - this.timeBuffer[currentBufferSize - buffer];
    const vtRate = vDiff / tDiff;
    this.valueBuffer = this.valueBuffer.slice(-ProgressBarCLI.etaBufferLength);
    this.timeBuffer = this.timeBuffer.slice(-ProgressBarCLI.etaBufferLength);
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
    const seconds = this.eta as number;
    const secondsRounded = 5 * Math.round(seconds / 5);
    if (secondsRounded >= 3600) {
      return `${Math.floor(secondsRounded / 3600)}h${(secondsRounded % 3600) / 60}m`;
    } if (secondsRounded >= 60) {
      return `${Math.floor(secondsRounded / 60)}m${(secondsRounded % 60)}s`;
    } if (seconds >= 10) {
      return `${secondsRounded}s`;
    }
    return `${seconds}s`;
  }

  /**
   * Applications that are too synchronous or have a high concurrency (e.g. with async.js, p-limit,
   * p-map, etc.) keep cli-progress from redrawing with its setTimeout(), so it might be necessary
   * to force it. This function needs to be safe to be called concurrently because of the way
   * cli-progress clears previous output.
   *
   * @see https://github.com/npkgz/cli-progress/issues/79
   */
  private static async render(): Promise<void> {
    try {
      await this.renderMutex.runExclusive(() => {
        const elapsed = process.hrtime(this.lastRedraw);
        const elapsedMs = (elapsed[0] * 1000000000 + elapsed[1]) / 1000000;
        if (elapsedMs >= (1000 / ProgressBarCLI.fps)) {
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
    await ProgressBarCLI.render();
  }

  async setSymbol(symbol: string) {
    this.singleBar.update({
      symbol,
    } as ProgressBarPayload);
    await ProgressBarCLI.render();
  }

  async increment() {
    this.singleBar.increment();
    await ProgressBarCLI.render();
  }

  async update(current: number) {
    this.singleBar.update(current);
    await ProgressBarCLI.render();
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

    await ProgressBarCLI.render();
  }

  async logDebug(message: string) {
    if (this.logger.getLogLevel() <= LogLevel.DEBUG) {
      ProgressBarCLI.multiBar.log(`${Logger.debugFormatter(message)}\n`);
      await ProgressBarCLI.render();
    }
  }

  async logInfo(message: string) {
    if (this.logger.getLogLevel() <= LogLevel.INFO) {
      ProgressBarCLI.multiBar.log(`${Logger.infoFormatter(message)}\n`);
      await ProgressBarCLI.render();
    }
  }

  async logWarn(message: string) {
    if (this.logger.getLogLevel() <= LogLevel.WARN) {
      ProgressBarCLI.multiBar.log(`${Logger.warnFormatter(message)}\n`);
      await ProgressBarCLI.render();
    }
  }

  async logError(message: string) {
    if (this.logger.getLogLevel() <= LogLevel.ERROR) {
      ProgressBarCLI.multiBar.log(`${Logger.errorFormatter(message)}\n`);
      await ProgressBarCLI.render();
    }
  }

  /**
   * When the number of progress bars exceeds the height of the console, cli-progress fails to be
   * able to clear them all reliably. It's recommended you don't have too many active progress bars
   * at once.
   */
  delete() {
    ProgressBarCLI.multiBar.remove(this.singleBar);
    // Forcing a render shouldn't be necessary
  }
}
