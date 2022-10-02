#!/usr/bin/env node

import Logger from './src/console/logger.js';
import Constants from './src/constants.js';
import Igir from './src/igir.js';
import ArgumentsParser from './src/modules/argumentsParser.js';

/* eslint-disable-next-line @typescript-eslint/no-floating-promises */
(async (): Promise<void> => {
  const logger = new Logger();
  logger.printHeader();

  // Warning: this is registered here so it's after synchronous cleanup handlers elsewhere!
  process.once('SIGINT', () => {
    logger.info(`Exiting ${Constants.COMMAND_NAME}`);
    process.exit(0);
  });

  try {
    const options = new ArgumentsParser(logger).parse(process.argv.slice(2));
    if (options.getHelp()) {
      process.exit(0);
    }
    logger.setLogLevel(options.getLogLevel());

    await new Igir(options, logger).main();
  } catch (e) {
    logger.newLine();
    logger.error(e);
    process.exit(1);
  }
})();
