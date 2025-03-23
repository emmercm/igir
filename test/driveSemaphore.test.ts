import DriveSemaphore from '../src/driveSemaphore.js';

describe('map', () => {
  it('should handle thrown errors', async () => {
    await expect(
      new DriveSemaphore(1).map(['file'], () => {
        throw new Error('error');
      }),
    ).rejects.toThrow('error');
  });

  it('should handle thrown literals', async () => {
    await expect(
      new DriveSemaphore(1).map(['file'], () => {
        throw new Error('message');
      }),
    ).rejects.toThrow('message');
  });
});
