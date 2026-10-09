import MappableSemaphore from '../../src/async/mappableSemaphore.js';

describe('map', () => {
  it('should return mapped results', async () => {
    const result = await new MappableSemaphore(2).map([1, 2, 3, 4, 5], (value) => value * 2);
    expect(result).toEqual([2, 4, 6, 8, 10]);
  });

  it('should return mapped results in order across chunks', async () => {
    const values = Array.from({ length: 10 }, (_, idx) => idx);
    const result = await new MappableSemaphore(2, 3).map(values, async (value) => {
      await new Promise((resolve) => {
        setTimeout(resolve, (10 - value) % 3);
      });
      return value * 2;
    });
    expect(result).toEqual(values.map((value) => value * 2));
  });

  it('should not start later chunks after an error', async () => {
    const callbackValues: number[] = [];
    await expect(
      new MappableSemaphore(2, 3).map([1, 2, 3, 4, 5, 6, 7, 8, 9], (value) => {
        callbackValues.push(value);
        if (value === 2) {
          throw new Error(`error ${value}`);
        }
        return value;
      }),
    ).rejects.toThrow('error 2');
    expect(callbackValues).not.toContain(4);
    expect(callbackValues).not.toContain(7);
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
    // Values 1-3 start immediately (3 threads), but 4 and 5 should be canceled
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
    // Values 1-3 start immediately (3 threads), but 4 and 5 should be canceled
    expect(callbackValues).not.toContain(4);
    expect(callbackValues).not.toContain(5);
  });
});
