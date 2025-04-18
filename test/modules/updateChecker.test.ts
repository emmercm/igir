import { PassThrough } from 'node:stream';

import Logger from '../../src/console/logger.js';
import { LogLevel } from '../../src/console/logLevel.js';
import UpdateChecker from '../../src/modules/updateChecker.js';

const logger = new Logger(LogLevel.ALWAYS, new PassThrough());

it('should not throw', async () => {
  expect.assertions(1);
  await expect(new UpdateChecker(logger).check()).resolves.toBeUndefined();
});
