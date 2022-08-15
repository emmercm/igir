import Logger, { LogLevel } from '../src/console/logger.js';

const logger = new Logger(LogLevel.OFF);

describe('header', () => {
  it('should not throw', () => {
    logger.header('');
    logger.header('foo bar');
    logger.header('🙂');
    logger.header('multiple\nlines');
  });
});
