import DriveSemaphore from '../src/driveSemaphore.js';

describe('map', () => {
  it('should handle thrown errors', async () => {
    await expect(
      new DriveSemaphore().map(
        ['file'],
        () => { throw new Error('error'); },
      ),
    ).rejects.toThrow('error');
  });

  it('should handle thrown literals', async () => {
    await expect(
      new DriveSemaphore().map(
        ['file'],
        // eslint-disable-next-line @typescript-eslint/no-throw-literal
        () => { throw 'message'; },
      ),
    ).rejects.toThrow('message');
  });
});
