import { clearTimeout } from 'node:timers';

/**
 * A wrapper to centrally manage Node.js timeouts.
 */
export default class Timer {
  private static readonly TIMERS: Set<Timer> = new Set();

  private readonly timeoutId: NodeJS.Timeout;

  private constructor(timeoutId: NodeJS.Timeout) {
    this.timeoutId = timeoutId;
    Timer.TIMERS.add(this);
  }

  static setTimeout(runnable: (...args: unknown[]) => void, timeoutMillis: number): Timer {
    const timer = new Timer(
      setTimeout(() => {
        runnable();
        Timer.TIMERS.delete(timer);
      }, timeoutMillis),
    );
    return timer;
  }

  static setInterval(runnable: (...args: unknown[]) => void, timeoutMillis: number): Timer {
    const timer = new Timer(
      setInterval(() => {
        runnable();
        Timer.TIMERS.delete(timer);
      }, timeoutMillis),
    );
    return timer;
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
