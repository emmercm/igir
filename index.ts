#!/usr/bin/env node

import main from './src/app.js';
import Constants from './src/constants.js';
import Logger from './src/logger.js';
import ArgumentsParser from './src/modules/argumentsParser.js';

(async () => {
  Logger.header(Constants.COMMAND_NAME);

  try {
    const options = ArgumentsParser.parse(process.argv.slice(2));
    if (options.getHelp()) {
      process.exit(0);
    }

    await main(options);
  } catch (e) {
    process.exit(1);
  }
})();
