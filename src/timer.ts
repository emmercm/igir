import { clearTimeout } from 'node:timers';

/**
 * A wrapper to centrally manage Node.js timeouts.
 */
export default class Timer {
  private static readonly TIMERS: Set<Timer> = new Set();

  private readonly timeoutId: NodeJS.Timeout;

  private constructor(
    runnable: (...args: unknown[]) => void,
    timeoutMillis: number,
  ) {
    this.timeoutId = setTimeout(() => {
      runnable();
      Timer.TIMERS.delete(this);
    }, timeoutMillis);
    Timer.TIMERS.add(this);
  }

  static setTimeout(
    runnable: (...args: unknown[]) => void,
    timeoutMillis: number,
  ): Timer {
    return new Timer(runnable, timeoutMillis);
  }

  /**
   * Cancel all pending timeouts.
   */
  static cancelAll(): void {
    Timer.TIMERS.forEach((timer) => timer.cancel());
  }

  /**
   * Cancel this timeout.
   */
  cancel(): void {
    clearTimeout(this.timeoutId);
    Timer.TIMERS.delete(this);
  }
}
