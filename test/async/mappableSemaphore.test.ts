import MappableSemaphore from '../../src/async/mappableSemaphore.js';

describe('map', () => {
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
        throw new Error('message');
      }),
    ).rejects.toThrow('message');
  });
});
