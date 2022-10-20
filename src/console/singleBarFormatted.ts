import chalk from 'chalk';
import {
  MultiBar, Options, Params, SingleBar,
} from 'cli-progress';
import { linearRegression, linearRegressionLine } from 'simple-statistics';

import ProgressBarPayload from './progressBarPayload.js';

export default class SingleBarFormatted {
  private readonly multiBar: MultiBar;

  private readonly singleBar: SingleBar;

  private lastOutput = '';

  private valueTimeBuffer: number[][] = [];

  constructor(multiBar: MultiBar, name: string, symbol: string, initialTotal: number) {
    this.multiBar = multiBar;
    this.singleBar = this.multiBar.create(initialTotal, 0, {
      symbol,
      name,
    } as ProgressBarPayload, {
      /* eslint-disable-next-line arrow-body-style */
      format: (options, params, payload: ProgressBarPayload): string => {
        this.lastOutput = `${SingleBarFormatted.getSymbol(payload)} ${SingleBarFormatted.getName(payload)} | ${this.getProgress(options, params, payload)}`.trim();
        return this.lastOutput;
      },
    });
  }

  getSingleBar(): SingleBar {
    return this.singleBar;
  }

  getLastOutput(): string {
    return this.lastOutput;
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
        const eta = this.calculateEta(params);
        progress += ` | ETA: ${SingleBarFormatted.getEtaFormatted(eta)}`;
      }
    }
    return progress;
  }

  private calculateEta(params: Params): number {
    function clamp(val: number, min: number, max: number): number {
      return Math.min(Math.max(val, min), max);
    }
    const MAX_BUFFER_SIZE = clamp(Math.floor(params.total / 10), 25, 50);

    this.valueTimeBuffer = [
      ...this.valueTimeBuffer.slice(1 - MAX_BUFFER_SIZE),
      [params.value, Date.now()],
    ];

    const doneTime = linearRegressionLine(linearRegression(this.valueTimeBuffer))(params.total);
    if (Number.isNaN(doneTime)) {
      // Vertical line
      return -1;
    }
    const remaining = (doneTime - Date.now()) / 1000;
    if (!Number.isFinite(remaining)) {
      return -1;
    }
    return Math.max(remaining, 0);
  }

  private static getBar(options: Options, params: Params): string {
    const barSize = options.barsize || 0;
    const completeSize = Math.round(params.progress * barSize);
    const incompleteSize = barSize - completeSize;
    return (options.barCompleteString || '').slice(0, completeSize)
            + options.barGlue
            + (options.barIncompleteString || '').slice(0, incompleteSize);
  }

  private static getEtaFormatted(eta: number): string {
    if (eta < 0) {
      return 'infinity';
    }

    const etaInteger = Math.ceil(eta);
    const secondsRounded = 5 * Math.round(etaInteger / 5);
    if (secondsRounded >= 3600) {
      const minutes = Math.floor((secondsRounded % 3600) / 60);
      if (minutes > 0) {
        return `${Math.floor(secondsRounded / 3600)}h${minutes}m`;
      }
      return `${Math.floor(secondsRounded / 3600)}h`;
    } if (secondsRounded >= 60) {
      const seconds = secondsRounded % 60;
      if (seconds > 0) {
        return `${Math.floor(secondsRounded / 60)}m${seconds}s`;
      }
      return `${Math.floor(secondsRounded / 60)}m`;
    } if (etaInteger >= 10) {
      return `${secondsRounded}s`;
    }
    return `${etaInteger}s`;
  }
}
