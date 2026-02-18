import TimePoly from '../../src/polyfill/timePoly.js';

describe('hrtimeMillis', () => {
  test.each([[10], [100], [1000]])('should calculate the difference for %s ms', async (timeout) => {
    const before = TimePoly.hrtimeMillis();
    await new Promise((resolve) => {
      setTimeout(resolve, timeout);
    });
    const after = TimePoly.hrtimeMillis(before);
    expect(after).toBeGreaterThanOrEqual(timeout - 1 /* allow the event loop some wiggle room*/);
  });
});
