#!/usr/bin/env node

import main from './src/app.js';
import Logger from './src/console/logger.js';
import Constants from './src/constants.js';
import ArgumentsParser from './src/modules/argumentsParser.js';

(async () => {
  const logger = new Logger();
  logger.header(Constants.COMMAND_NAME);

  try {
    const options = new ArgumentsParser(logger).parse(process.argv.slice(2));
    if (options.getHelp()) {
      process.exit(0);
    }
    logger.setLogLevel(options.getLogLevel());

    await main(options, logger);
  } catch (e) {
    logger.error(`\n${e}`);
    process.exit(1);
  }
})();
