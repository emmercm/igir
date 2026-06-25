import UpdateChecker from '../../src/modules/updateChecker.js';

it('should not throw', async () => {
  expect.assertions(1);
  await expect(new UpdateChecker().check()).resolves.toBeUndefined();
});
