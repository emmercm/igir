import TimeUtil from '../../src/utils/timeUtil.js';

describe('hrtimeMillis', () => {
  test.each([[10], [100], [1000]])('should calculate the difference for %s ms', async (timeout) => {
    const before = TimeUtil.hrtimeMillis();
    await new Promise((resolve) => {
      setTimeout(resolve, timeout);
    });
    const after = TimeUtil.hrtimeMillis(before);
    expect(after).toBeGreaterThanOrEqual(timeout - 1 /* allow the event loop some wiggle room*/);
  });
});
