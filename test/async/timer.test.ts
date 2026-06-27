import Timer from '../../src/async/timer.js';

describe('setTimeout', () => {
  it('should resolve', async () => {
    await expect(
      new Promise((resolve) => {
        Timer.setTimeout(resolve, 100);
      }),
    ).resolves.toBeUndefined();
  });

  it('should cancel all', () => {
    let didRun = false;
    Timer.setTimeout(() => {
      didRun = true;
    }, 1000);
    Timer.cancelAll();
    expect(didRun).toEqual(false);
  });

  it('should cancel', () => {
    let didRun = false;
    const timer = Timer.setTimeout(() => {
      didRun = true;
    }, 1000);
    timer.cancel();
    expect(didRun).toEqual(false);
  });
});
