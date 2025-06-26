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
    let ran = false;
    Timer.setTimeout(() => {
      ran = true;
    }, 1000);
    Timer.cancelAll();
    expect(ran).toEqual(false);
  });

  it('should cancel', () => {
    let ran = false;
    const timer = Timer.setTimeout(() => {
      ran = true;
    }, 1000);
    timer.cancel();
    expect(ran).toEqual(false);
  });
});
