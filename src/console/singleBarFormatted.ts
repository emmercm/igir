import chalk from 'chalk';
import {
  MultiBar, Options, Params, SingleBar,
} from 'cli-progress';
import { linearRegression, linearRegressionLine } from 'simple-statistics';
import stripAnsi from 'strip-ansi';

import ProgressBarPayload from './progressBarPayload.js';

/**
 * A wrapper class for a cli-progress {@link SingleBar} that formats the output.
 */
export default class SingleBarFormatted {
  public static readonly MAX_NAME_LENGTH = 30;

  public static readonly BAR_COMPLETE_CHAR = '\u2588';

  public static readonly BAR_IN_PROGRESS_CHAR = '\u2592';

  public static readonly BAR_INCOMPLETE_CHAR = '\u2591';

  private readonly multiBar: MultiBar;

  private readonly singleBar: SingleBar;

  private lastOutput = '';

  private valueTimeBuffer: number[][] = [];

  private lastEtaTime: [number, number] = [0, 0];

  private lastEtaValue = 'infinity';

  constructor(multiBar: MultiBar, initialTotal: number, initialPayload: ProgressBarPayload) {
    this.multiBar = multiBar;
    this.singleBar = this.multiBar.create(initialTotal, 0, initialPayload, {
      format: (options, params, payload: ProgressBarPayload): string => {
        const symbolAndName = SingleBarFormatted.getSymbolAndName(payload);
        const progressWrapped = this.getProgress(options, params, payload)
          .split('\n')
          .map((line, idx) => {
            if (idx === 0) {
              return line;
            }
            return ' '.repeat(stripAnsi(symbolAndName).length + 3) + line;
          })
          .join('\n\x1b[K');

        this.lastOutput = `${symbolAndName} | ${progressWrapped}`.trim();
        return this.lastOutput
          // cli-progress doesn't handle multi-line progress bars, collapse to one line. The multi-
          // line message will get logged correctly when the progress bar is frozen & logged.
          .replace(/\n\S*\s+/g, ' ');
      },
    });
  }

  getSingleBar(): SingleBar {
    return this.singleBar;
  }

  getLastOutput(): string {
    return this.lastOutput;
  }

  private static getSymbolAndName(payload: ProgressBarPayload): string {
    const symbol = chalk.bold(payload.symbol ?? '');
    const name = payload.name ?? '';

    const namePadded = `${name} ${'·'.repeat(SingleBarFormatted.MAX_NAME_LENGTH)}`.trim();
    const symbolAndName = `${symbol} ${namePadded}`;

    const excessLength = stripAnsi(symbolAndName).trimStart().length
        - SingleBarFormatted.MAX_NAME_LENGTH;
    const nameTrimmed = namePadded.slice(
      0,
      namePadded.length - (excessLength > 0 ? excessLength : 0),
    );

    return `${symbol} ${nameTrimmed}`.trimStart();
  }

  private getProgress(options: Options, params: Params, payload: ProgressBarPayload): string {
    if (payload.finishedMessage) {
      return payload.finishedMessage;
    }

    let progress = SingleBarFormatted.getBar(options, params, payload);
    if (!params.total) {
      return progress;
    }

    progress += ` | ${params.value.toLocaleString()}/${params.total.toLocaleString()}`;

    if (params.value > 0) {
      const eta = this.calculateEta(params);
      if (eta > 0) {
        progress += ` | ETA: ${this.getEtaFormatted(eta)}`;
      }
    }

    if (payload.waitingMessage) {
      progress += ` | ${payload.waitingMessage}`;
    }

    return progress;
  }

  private calculateEta(params: Params): number {
    const clamp = (
      val: number,
      min: number,
      max: number,
    ): number => Math.min(Math.max(val, min), max);
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

  private static getBar(options: Options, params: Params, payload: ProgressBarPayload): string {
    const barSize = options.barsize ?? 0;
    if (barSize <= 0) {
      return '';
    }

    const clamp = (
      val: number | undefined,
      min: number,
      max: number,
    ): number => Math.min(Math.max(val ?? 0, min), max);
    const completeSize = Math.floor(clamp(params.progress, 0, 1) * barSize);
    const inProgressSize = params.total > 0
      ? Math.ceil((clamp(payload.inProgress, 0, params.total) / params.total) * barSize)
      : 0;
    const incompleteSize = barSize - inProgressSize - completeSize;

    return SingleBarFormatted.BAR_COMPLETE_CHAR.repeat(Math.max(completeSize, 0))
      + SingleBarFormatted.BAR_IN_PROGRESS_CHAR.repeat(Math.max(inProgressSize, 0))
      + SingleBarFormatted.BAR_INCOMPLETE_CHAR.repeat(Math.max(incompleteSize, 0));
  }

  private getEtaFormatted(etaSeconds: number): string {
    // Rate limit how often the ETA can change
    //  Update only every 5s if the ETA is >60s
    const [elapsedSec, elapsedNano] = process.hrtime(this.lastEtaTime);
    const elapsedMs = (elapsedSec * 1_000_000_000 + elapsedNano) / 1_000_000;
    if (etaSeconds > 60 && elapsedMs < 5000) {
      return this.lastEtaValue;
    }
    this.lastEtaTime = process.hrtime();

    if (etaSeconds < 0) {
      this.lastEtaValue = 'infinity';
      return this.lastEtaValue;
    }

    const etaSecondsInt = Math.ceil(etaSeconds);
    const secondsRounded = 5 * Math.round(etaSecondsInt / 5);
    if (secondsRounded >= 86_400) {
      this.lastEtaValue = SingleBarFormatted.getEtaFormattedDays(secondsRounded);
    } else if (secondsRounded >= 3600) {
      this.lastEtaValue = SingleBarFormatted.getEtaFormattedHours(secondsRounded);
    } else if (secondsRounded >= 60) {
      this.lastEtaValue = SingleBarFormatted.getEtaFormattedMinutes(secondsRounded);
    } else if (etaSecondsInt >= 10) {
      this.lastEtaValue = `${secondsRounded}s`;
    } else {
      this.lastEtaValue = `${etaSecondsInt}s`;
    }
    return this.lastEtaValue;
  }

  private static getEtaFormattedDays(secondsRounded: number): string {
    const hours = Math.floor((secondsRounded % 86_400) / 3600);
    if (hours > 0) {
      return `${Math.floor(secondsRounded / 86_400)}d${hours}h`;
    }
    return `${Math.floor(secondsRounded / 86_400)}d`;
  }

  private static getEtaFormattedHours(secondsRounded: number): string {
    const minutes = Math.floor((secondsRounded % 3600) / 60);
    if (minutes > 0) {
      return `${Math.floor(secondsRounded / 3600)}h${minutes}m`;
    }
    return `${Math.floor(secondsRounded / 3600)}h`;
  }

  private static getEtaFormattedMinutes(secondsRounded: number): string {
    const seconds = secondsRounded % 60;
    if (seconds > 0) {
      return `${Math.floor(secondsRounded / 60)}m${seconds}s`;
    }
    return `${Math.floor(secondsRounded / 60)}m`;
  }
}
