#!/usr/bin/env node

import realFs from 'fs';
import gracefulFs from 'graceful-fs';
import semver from 'semver';

import Logger from './src/console/logger.js';
import { ProgressBarSymbol } from './src/console/progressBar.js';
import ProgressBarCLI from './src/console/progressBarCLI.js';
import Constants from './src/constants.js';
import Igir from './src/igir.js';
import ArgumentsParser from './src/modules/argumentsParser.js';
import UpdateChecker from './src/modules/updateChecker.js';

// Monkey-patch 'fs' to help prevent Windows EMFILE errors
gracefulFs.gracefulify(realFs);

/* eslint-disable-next-line @typescript-eslint/no-floating-promises */
(async (): Promise<void> => {
  const logger = new Logger();
  logger.printHeader();

  if (!semver.satisfies(process.version, Constants.ENGINES_NODE)) {
    logger.error(`${Constants.COMMAND_NAME} requires a Node.js version of ${Constants.ENGINES_NODE}`);
    process.exit(1);
  }

  process.once('SIGINT', () => {
    logger.newLine();
    logger.warn(`Exiting ${Constants.COMMAND_NAME} prematurely`);
    process.exit(0);
  });

  try {
    const options = new ArgumentsParser(logger).parse(process.argv.slice(2));
    if (options.getHelp()) {
      process.exit(0);
    }
    logger.setLogLevel(options.getLogLevel());

    const updateProgressBar = await logger.addProgressBar('Checking for updates', ProgressBarSymbol.SEARCHING, 1);
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    new UpdateChecker(updateProgressBar).check();

    await new Igir(options, logger).main();
    ProgressBarCLI.stop();
  } catch (e) {
    ProgressBarCLI.stop();
    logger.error(e);
    logger.newLine();
    process.exit(1);
  }
})();
