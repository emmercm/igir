import chalk from 'chalk';
import {
  MultiBar, Options, Params, SingleBar,
} from 'cli-progress';

import ProgressBarPayload from './progressBarPayload.js';

export default class SingleBarFormatted {
  private static readonly ETA_BUFFER_LENGTH = 100;

  private readonly multiBar: MultiBar;

  private valueBuffer: number[] = [];

  private timeBuffer: number[] = [];

  private eta: number | string = '0';

  constructor(multiBar: MultiBar) {
    this.multiBar = multiBar;
  }

  build(name: string, symbol: string, initialTotal: number): SingleBar {
    const singleBar = this.multiBar.create(initialTotal, 0, {
      symbol,
      name,
    } as ProgressBarPayload, this.buildOptions());

    singleBar.addListener('start', (total: number, start: number) => {
      // cli-progress/lib/GenericBar()
      this.valueBuffer = [start || 0];
      this.timeBuffer = [Date.now()];
      this.eta = '0';
    });
    singleBar.addListener('update', (total: number, value: number) => {
      // cli-progress/lib/ETA.update()
      this.valueBuffer.push(value);
      this.timeBuffer.push(Date.now());
      this.calculateEta(total - value);
    });

    return singleBar;
  }

  private calculateEta(remaining: number): void {
    // TODO(cemmer): find a better way to calculate rate
    // cli-progress/lib/ETA.calculate()
    const currentBufferSize = this.valueBuffer.length;
    const buffer = Math.min(SingleBarFormatted.ETA_BUFFER_LENGTH, currentBufferSize);
    const vDiff = this.valueBuffer[currentBufferSize - 1]
            - this.valueBuffer[currentBufferSize - buffer];
    const tDiff = this.timeBuffer[currentBufferSize - 1]
            - this.timeBuffer[currentBufferSize - buffer];
    const vtRate = vDiff / tDiff;
    this.valueBuffer = this.valueBuffer.slice(-SingleBarFormatted.ETA_BUFFER_LENGTH);
    this.timeBuffer = this.timeBuffer.slice(-SingleBarFormatted.ETA_BUFFER_LENGTH);
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

  private buildOptions(): Options {
    return {
      /* eslint-disable-next-line arrow-body-style */
      format: (options, params, payload: ProgressBarPayload): string => {
        return `${SingleBarFormatted.getSymbol(payload)} ${SingleBarFormatted.getName(payload)} | ${this.getProgress(options, params, payload)}`.trim();
      },
    };
  }

  private static getSymbol(payload: ProgressBarPayload): string {
    if (!payload.symbol) {
      return '';
    }
    return chalk.bold(payload.symbol);
  }

  private static getName(payload: ProgressBarPayload): string {
    if (!payload.name) {
      return '';
    }

    const maxNameLength = 30;
    const payloadName = payload.name.slice(0, maxNameLength);
    return payloadName.length > maxNameLength - 1
      ? payloadName.padEnd(maxNameLength, ' ')
      : `${payloadName} ${'·'.repeat(maxNameLength - 1 - payloadName.length)}`;
  }

  private getProgress(options: Options, params: Params, payload: ProgressBarPayload): string {
    if (payload.finishedMessage) {
      return payload.finishedMessage;
    }

    let progress = SingleBarFormatted.getBar(options, params);
    if (params.total > 0) {
      progress += ` | ${params.value.toLocaleString()}/${params.total.toLocaleString()}`;
      if (params.value > 0 && params.value < params.total) {
        progress += ` | ETA: ${this.getEtaFormatted()}`;
      }
    }
    return progress;
  }

  private static getBar(options: Options, params: Params): string {
    const barSize = options.barsize || 0;
    const completeSize = Math.round(params.progress * barSize);
    const incompleteSize = barSize - completeSize;
    return (options.barCompleteString || '').slice(0, completeSize)
            + options.barGlue
            + (options.barIncompleteString || '').slice(0, incompleteSize);
  }

  private getEtaFormatted(): string {
    const seconds = this.eta as number;
    const secondsRounded = 5 * Math.round(seconds / 5);
    if (secondsRounded >= 3600) {
      return `${Math.floor(secondsRounded / 3600)}h${Math.floor((secondsRounded % 3600) / 60)}m`;
    } if (secondsRounded >= 60) {
      return `${Math.floor(secondsRounded / 60)}m${(secondsRounded % 60)}s`;
    } if (seconds >= 10) {
      return `${secondsRounded}s`;
    }
    return `${seconds}s`;
  }
}
