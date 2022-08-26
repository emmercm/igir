#!/usr/bin/env node

import Logger from './src/console/logger.js';
import Igir from './src/igir.js';
import ArgumentsParser from './src/modules/argumentsParser.js';

(async () => {
  const logger = new Logger();
  logger.printHeader();

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
