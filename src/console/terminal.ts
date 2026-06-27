import tty from 'node:tty';

import stripAnsi from 'strip-ansi';

import Timer from '../async/timer.js';
import NullWritable from '../streams/nullWritable.js';

/**
 * A single leading space rendered before every live-region line, so progress bars are inset from
 * the left edge. Frozen snapshots reuse it to stay aligned with the live region.
 */
export const LIVE_REGION_PADDING = ' ';

/**
 * {@link Terminal} is the single owner of the physical output stream. It writes log lines and
 * maintains an optional "live region" (the area where progress bars are drawn) below them,
 * performing all cursor control. Both log lines and live-region frames are funneled through here so
 * the two never collide.
 *
 * The live region is only drawn when the underlying stream is a TTY; when output is redirected to a
 * file (or otherwise not a TTY), only log lines are written.
 */
export default class Terminal {
  // Throttles paints triggered by flushing queued log lines (the `schedulePaint` path), to reduce
  // flicker and formatting expense when logs arrive in bursts. Live-region *content* changes are
  // not rate-limited here: `setLiveRegion` coalesces a burst into one prompt paint so meaningful
  // status changes stay timely.
  private static readonly PAINT_MAX_FPS = 5;

  private stream: tty.WriteStream | NodeJS.WritableStream;

  private columns = 65_536;
  private rows = 65_536;

  // The logical live-region frame most recently provided (full width, un-truncated)
  private liveRegionRaw = '';
  // The physical block currently on screen (padded/truncated, ending in a newline), or '' if none
  private lastDisplayed = '';
  // Log lines waiting to be printed above the live region. Queued (rather than written immediately)
  // while a live region is on screen so they can be flushed in the same synchronized update that
  // repaints the region — otherwise the logs and the bars would be drawn as two separate frames.
  private pendingLogLines: string[] = [];
  // Whether the content most recently written above the live region ended with a blank line. Used
  // to drop the region's own leading blank-line separator so the gap is always exactly one line.
  private lastWriteEndedBlank = false;

  private cursorHidden = false;
  private sigwinchHandler?: () => void;

  private lastPaintMs = 0;
  private pendingPaint?: Timer;
  private liveRegionPaintQueued = false;

  constructor(stream: tty.WriteStream | NodeJS.WritableStream) {
    this.stream = stream;
    this.attachStream(stream);
  }

  /**
   * Whether the underlying stream is an interactive terminal (and therefore draws the live region).
   */
  isInteractive(): boolean {
    return this.stream instanceof tty.WriteStream;
  }

  /**
   * Replace the underlying output stream. Used at startup to wire up the real stream, and by tests
   * to redirect output away from the real stdout.
   */
  setStream(stream: tty.WriteStream | NodeJS.WritableStream): void {
    this.pendingPaint?.cancel();
    this.pendingPaint = undefined;
    // Flush any queued logs to the current stream before switching so they aren't lost
    this.flushPendingLogs();
    this.showCursor();
    this.detachStream();
    this.lastDisplayed = '';
    this.lastWriteEndedBlank = false;
    this.stream = stream;
    this.attachStream(stream);
  }

  private attachStream(stream: tty.WriteStream | NodeJS.WritableStream): void {
    if (stream instanceof tty.WriteStream) {
      this.columns = stream.columns;
      this.rows = stream.rows;
      this.sigwinchHandler = (): void => {
        if (!(this.stream instanceof tty.WriteStream)) {
          return;
        }
        this.columns = this.stream.columns;
        this.rows = this.stream.rows;
        if (this.liveRegionRaw === '') {
          return;
        }
        // The terminal size affects truncation, so clear and redraw the live region from scratch.
        // A resize is rare and must be reflected immediately, so paint now rather than coalescing.
        this.clearDisplayed();
        this.paint();
      };
      process.on('SIGWINCH', this.sigwinchHandler);
    } else {
      this.columns = 65_536;
      this.rows = 65_536;
    }
  }

  private detachStream(): void {
    if (this.sigwinchHandler === undefined) {
      return;
    }

    process.off('SIGWINCH', this.sigwinchHandler);
    this.sigwinchHandler = undefined;
  }

  /**
   * Write a finished line (e.g. a log message) above the live region. When no live region is on
   * screen the line is written immediately; otherwise it is queued and flushed together with the
   * region repaint in a single synchronized update (see {@link paint}), so logs and bars are never
   * drawn as separate, torn frames. Queued lines are coalesced behind the paint rate.
   */
  writeLine(text: string): void {
    if (!(this.stream instanceof tty.WriteStream)) {
      this.stream.write(`${text}\n`);
      return;
    }

    if (this.liveRegionRaw === '' && this.lastDisplayed === '') {
      // No live region to coordinate with — nothing to tear, so write immediately
      this.stream.write(`${text}\n`);
      this.lastWriteEndedBlank = Terminal.endsWithBlankLine(text);
      return;
    }

    this.pendingLogLines.push(text);
    this.schedulePaint();
  }

  /**
   * Set (or replace) the live-region frame and repaint it at the end of the current tick.
   */
  setLiveRegion(raw: string): void {
    if (raw === this.liveRegionRaw) {
      return;
    }
    // Detect the empty -> non-empty edge (the live region first appearing) before overwriting
    const regionAppeared = this.liveRegionRaw === '' && raw !== '';
    this.liveRegionRaw = raw;

    if (!(this.stream instanceof tty.WriteStream)) {
      // Progress bars are only drawn on a TTY
      return;
    }

    // Hide the cursor while the live region is on screen so it doesn't flicker between repaints
    if (regionAppeared) {
      this.hideCursor();
    }

    // We're about to paint, so drop any rate-limited paint that was deferred for queued logs
    this.pendingPaint?.cancel();
    this.pendingPaint = undefined;

    // Coalesce a synchronous burst of producer updates (e.g. `setName` then `setSymbol` at a phase
    // boundary) into a single paint. The microtask runs once the call stack empties — after the
    // burst but before any awaited I/O or the periodic render timer — so the frame still appears
    // promptly while avoiding redundant repaints and the torn intermediate frame.
    if (this.liveRegionPaintQueued) {
      return;
    }
    this.liveRegionPaintQueued = true;
    queueMicrotask(() => {
      this.liveRegionPaintQueued = false;
      this.paint();
    });
  }

  /**
   * Repaint the live region in place, but no more often than {@link Terminal.PAINT_MAX_FPS}. Bursts
   * of requests within one frame interval are coalesced into a single deferred paint.
   */
  private schedulePaint(): void {
    if (this.pendingPaint !== undefined) {
      return;
    }

    const intervalMs = 1000 / Terminal.PAINT_MAX_FPS;
    const elapsedMs = Date.now() - this.lastPaintMs;
    if (elapsedMs >= intervalMs) {
      this.paint();
      return;
    }

    this.pendingPaint = Timer.setTimeout(() => {
      this.pendingPaint = undefined;
      this.paint();
    }, intervalMs - elapsedMs);
  }

  /**
   * Flush any queued log lines and (re)draw the live region beneath them, all within one
   * synchronized update so the two are presented as a single frame. No-op when there are no queued
   * logs and the rendered frame is unchanged.
   */
  private paint(): void {
    if (!(this.stream instanceof tty.WriteStream)) {
      return;
    }

    if (this.pendingLogLines.length === 0) {
      // No queued logs, so the content above the region is unchanged: render with the current
      // blank-line state and skip the paint entirely if the frame hasn't changed.
      const displayed = this.renderFrame();
      if (displayed === this.lastDisplayed) {
        return;
      }
      this.withSynchronizedUpdate(() => {
        this.repaint(this.lastDisplayed, displayed);
      });
      this.lastDisplayed = displayed;
    } else {
      // Clear the region, print the queued logs where it was, then redraw the region fresh below.
      // The region is rendered after flushing so its leading blank-line separator reflects the
      // just-written logs.
      this.withSynchronizedUpdate(() => {
        this.clearDisplayed();
        this.flushPendingLogs();
        const displayed = this.renderFrame();
        this.repaint('', displayed);
        this.lastDisplayed = displayed;
      });
    }
    this.lastPaintMs = Date.now();
  }

  /**
   * Tear down the live region and restore the cursor.
   */
  clearLiveRegion(): void {
    this.pendingPaint?.cancel();
    this.pendingPaint = undefined;

    // A coalesced paint may still be queued; once it fires `paint()` will be a harmless no-op
    // because `liveRegionRaw` is now empty, but reset the guard so a later region can re-queue
    this.liveRegionPaintQueued = false;
    this.liveRegionRaw = '';
    if (
      this.stream instanceof tty.WriteStream &&
      (this.lastDisplayed !== '' || this.pendingLogLines.length > 0)
    ) {
      // Clear the region and flush any still-queued logs in one synchronized update before tearing
      // down, so the last batch of log lines isn't lost
      this.withSynchronizedUpdate(() => {
        if (this.lastDisplayed !== '') {
          this.clearDisplayed();
        }
        this.flushPendingLogs();
      });
    }
    this.showCursor();
  }

  /**
   * Write any queued log lines to the stream and clear the queue. Assumes the live region has
   * already been cleared from the cursor position, so the lines are written where it was.
   */
  private flushPendingLogs(): void {
    if (this.pendingLogLines.length === 0) {
      return;
    }

    this.stream.write(`${this.pendingLogLines.join('\n')}\n`);
    this.lastWriteEndedBlank = Terminal.endsWithBlankLine(this.pendingLogLines.at(-1) ?? '');
    this.pendingLogLines = [];
  }

  /**
   * Turn the logical live-region frame into the physical block to display, applying the terminal
   * row limit, per-line column truncation, and left padding.
   */
  private renderFrame(): string {
    if (this.liveRegionRaw === '') {
      return '';
    }

    // The producer prepends a blank-line separator so the region is offset from the content above
    // it. If that content already ended with a blank line, drop the separator so the gap stays
    // exactly one line rather than two.
    let raw = this.liveRegionRaw;
    if (this.lastWriteEndedBlank && raw.startsWith('\n')) {
      raw = raw.slice(1);
    }

    const outputLines = raw
      .split('\n')
      .slice(0, this.rows - 1)
      .map((line) => {
        // The visible (ANSI-stripped) length can only be shorter than the raw length, so a line
        // that already fits within the terminal needs no stripping or truncation
        if (line.length <= this.columns - 10) {
          return `${LIVE_REGION_PADDING}${line}`;
        }
        const stripChars = stripAnsi(line).length - this.columns + 10;
        if (stripChars <= 0) {
          return `${LIVE_REGION_PADDING}${line}`;
        }
        return `${LIVE_REGION_PADDING}${line.slice(0, line.length - stripChars)}…`;
      });

    return outputLines.length > 0 ? `${outputLines.join('\n')}\n` : '';
  }

  /**
   * Clear the currently-displayed live region from the screen, moving the cursor back to where it
   * started.
   */
  private clearDisplayed(): void {
    if (!(this.stream instanceof tty.WriteStream)) {
      this.lastDisplayed = '';
      return;
    }

    const rowsToMoveUp = this.lastDisplayed.split('\n').length - 1;
    if (rowsToMoveUp > 0) {
      this.stream.moveCursor(0, -rowsToMoveUp);
      this.stream.cursorTo(0);
      this.stream.clearScreenDown();
    }
    this.lastDisplayed = '';
  }

  /**
   * Repaint the live region in place: find the first changed line, move up to it, and overwrite
   * only the lines that changed.
   */
  private repaint(oldDisplayed: string, newDisplayed: string): void {
    if (!(this.stream instanceof tty.WriteStream)) {
      return;
    }

    const lastLines = oldDisplayed.split('\n');
    const newLines = newDisplayed.split('\n');

    let firstChangedRow = 0;
    while (
      firstChangedRow < lastLines.length - 1 &&
      firstChangedRow < newLines.length - 1 &&
      lastLines[firstChangedRow] === newLines[firstChangedRow]
    ) {
      firstChangedRow++;
    }

    const rowsToMoveUp = lastLines.length - 1 - firstChangedRow;
    if (rowsToMoveUp > 0) {
      this.stream.moveCursor(0, -rowsToMoveUp);
      this.stream.cursorTo(0);
    }

    const newlineCount = newLines.length - 1;
    const lastLineCount = lastLines.length - 1;

    for (let i = firstChangedRow; i < newlineCount; i++) {
      this.stream.cursorTo(0);
      this.stream.write(newLines[i]);
      this.stream.clearLine(1); // erase leftover chars if the new line is shorter
      this.stream.write('\n');
    }

    // Cursor is now at row newlineCount; ensure column 0
    this.stream.cursorTo(0);

    // Erase any extra lines from the old output by clearing them in-place, then stepping back up
    const extraOldLines = Math.max(0, lastLineCount - newlineCount);
    for (let i = 0; i < extraOldLines; i++) {
      this.stream.clearLine(0);
      if (i < extraOldLines - 1) {
        this.stream.moveCursor(0, 1);
      }
    }
    if (extraOldLines > 1) {
      this.stream.moveCursor(0, -(extraOldLines - 1));
    }
  }

  /**
   * Run a paint that emits multiple cursor moves/writes inside a DEC 2026 "synchronized update", so
   * terminals that support it present the whole frame atomically instead of revealing intermediate
   * steps (which flickers/tears). Terminals that don't support the private mode ignore the
   * sequences.
   */
  private withSynchronizedUpdate(paint: () => void): void {
    if (!(this.stream instanceof tty.WriteStream)) {
      paint();
      return;
    }

    this.stream.write('\u{1B}[?2026h');
    try {
      paint();
    } finally {
      this.stream.write('\u{1B}[?2026l');
    }
  }

  /**
   * Whether writing the given text (which is always followed by a newline) leaves a blank line at
   * the bottom — i.e. the text is empty or already ends with a newline.
   */
  private static endsWithBlankLine(text: string): boolean {
    return text === '' || text.endsWith('\n');
  }

  private hideCursor(): void {
    if (!(this.stream instanceof tty.WriteStream && !this.cursorHidden)) {
      return;
    }

    this.stream.write('\u{1B}[?25l');
    this.cursorHidden = true;
  }

  private showCursor(): void {
    if (this.cursorHidden && this.stream instanceof tty.WriteStream) {
      this.stream.write('\u{1B}[?25h');
    }
    this.cursorHidden = false;
  }
}

/**
 * The application-wide {@link Terminal}: the single owner of the output stream and the live region
 * (where progress bars are drawn). Import this to draw the live region from anywhere without
 * threading it through constructors.
 *
 * Under test runners (which set `NODE_ENV=test`) this defaults to a discard sink so that progress-bar
 * rendering can never leak to the test runner's stdout. Tests that want to assert on its output can
 * redirect it with {@link Terminal.setStream}.
 */
export const terminal = new Terminal(
  process.env.NODE_ENV === 'test' ? new NullWritable() : process.stdout,
);
