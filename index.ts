#!/usr/bin/env node

import main from './src/app.js';
import Constants from './src/constants.js';
import Logger from './src/logger.js';
import ArgumentsParser from './src/modules/argumentsParser.js';

(async () => {
  Logger.header(Constants.COMMAND_NAME);

  let options;
  try {
    options = ArgumentsParser.parse(process.argv.slice(2));
  } catch (e) {
    process.exit(1);
  }

  await main(options);
})();
