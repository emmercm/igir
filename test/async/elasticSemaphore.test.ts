import ElasticSemaphore from '../../src/async/elasticSemaphore.js';

describe('runExclusive', () => {
  test.each([-1, 0, 1, 10, 1_000_000])('should accept any weight: %s', async (weight) => {
    const semaphore = new ElasticSemaphore(5);

    const message = 'success!';
    const result = await semaphore.runExclusive(() => message, weight);
    expect(result).toEqual(message);
  });
});
