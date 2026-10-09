import MappableSemaphore from '../../src/async/mappableSemaphore.js';

describe('map', () => {
  it('should return mapped results', async () => {
    const result = await new MappableSemaphore(2).map([1, 2, 3, 4, 5], (value) => value * 2);
    expect(result).toEqual([2, 4, 6, 8, 10]);
  });

  it('should return mapped results in order', async () => {
    const values = Array.from({ length: 10 }, (_, idx) => idx);
    const result = await new MappableSemaphore(2).map(values, async (value) => {
      await new Promise((resolve) => {
        setTimeout(resolve, (10 - value) % 3);
      });
      return value * 2;
    });
    expect(result).toEqual(values.map((value) => value * 2));
  });

  it('should not queue more than the max number of threads', async () => {
    const semaphore = new MappableSemaphore(2);
    const runExclusiveSpy = vi.spyOn(semaphore, 'runExclusive');
    let startedCallbacks = 0;
    let maxOutstandingCalls = 0;

    await semaphore.map([1, 2, 3, 4, 5, 6], () => {
      maxOutstandingCalls = Math.max(
        maxOutstandingCalls,
        runExclusiveSpy.mock.calls.length - startedCallbacks,
      );
      startedCallbacks += 1;
    });

    expect(runExclusiveSpy).toHaveBeenCalledTimes(6);
    expect(maxOutstandingCalls).toBeLessThanOrEqual(2);
  });

  it('should not call the callback after an error', async () => {
    const callbackValues: number[] = [];
    await expect(
      new MappableSemaphore(2).map([1, 2, 3, 4, 5, 6, 7, 8, 9], (value) => {
        callbackValues.push(value);
        if (value === 2) {
          throw new Error(`error ${value}`);
        }
        return value;
      }),
    ).rejects.toThrow('error 2');
    expect(callbackValues).toEqual([1, 2]);
  });

  it('should not affect other callers sharing the semaphore after an error', async () => {
    const semaphore = new MappableSemaphore(2);
    const values = Array.from({ length: 10 }, (_, idx) => idx);

    const [failedResult, succeededResult] = await Promise.allSettled([
      semaphore.map(values, (value) => {
        if (value === 1) {
          throw new Error(`error ${value}`);
        }
        return value;
      }),
      semaphore.map(values, async (value) => {
        await new Promise((resolve) => {
          setTimeout(resolve, 1);
        });
        return value * 2;
      }),
    ]);

    expect(failedResult).toEqual({ status: 'rejected', reason: new Error('error 1') });
    expect(succeededResult).toEqual({
      status: 'fulfilled',
      value: values.map((value) => value * 2),
    });
  });

  it('should handle thrown errors', async () => {
    await expect(
      new MappableSemaphore(1).map(['file'], () => {
        throw new Error('error');
      }),
    ).rejects.toThrow('error');
  });

  it('should handle thrown literals', async () => {
    await expect(
      new MappableSemaphore(1).map(['file'], () => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'message';
      }),
    ).rejects.toThrow('message');
  });

  it('should throw the first error when sequential callbacks fail', async () => {
    const callbackValues: number[] = [];
    await expect(
      new MappableSemaphore(3).map([1, 2, 3, 4, 5], (value) => {
        callbackValues.push(value);
        throw new Error(`error ${value}`);
      }),
    ).rejects.toThrow('error 1');
    // Values 1-3 start immediately (3 threads), but 4 and 5 should be skipped
    expect(callbackValues).not.toContain(4);
    expect(callbackValues).not.toContain(5);
  });

  it('should throw the first error when concurrent callbacks fail', async () => {
    const callbackValues: number[] = [];
    await expect(
      new MappableSemaphore(3).map([1, 2, 3, 4, 5], async (value) => {
        callbackValues.push(value);
        // Value 2 fails fastest, so it should be the first error thrown
        await new Promise((resolve) => {
          setTimeout(resolve, value === 2 ? 25 : 50);
        });
        throw new Error(`error ${value}`);
      }),
    ).rejects.toThrow('error 2');
    // Values 1-3 start immediately (3 threads), but 4 and 5 should be skipped
    expect(callbackValues).not.toContain(4);
    expect(callbackValues).not.toContain(5);
  });
});
