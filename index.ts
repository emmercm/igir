#!/usr/bin/env node

import realFs from 'node:fs';

import gracefulFs from 'graceful-fs';
import semver from 'semver';

import Logger from './src/console/logger.js';
import ProgressBarCLI from './src/console/progressBarCli.js';
import Constants from './src/constants.js';
import Igir from './src/igir.js';
import ArgumentsParser from './src/modules/argumentsParser.js';
import EndOfLifeChecker from './src/modules/endOfLifeChecker.js';
import UpdateChecker from './src/modules/updateChecker.js';
import Options from './src/types/options.js';

// Monkey-patch 'fs' to help prevent Windows EMFILE errors
gracefulFs.gracefulify(realFs);

(async (): Promise<void> => {
  const logger = new Logger();
  logger.printHeader();

  if (!semver.satisfies(process.version, Constants.ENGINES_NODE)) {
    logger.error(`${Constants.COMMAND_NAME} requires a Node.js version of ${Constants.ENGINES_NODE}`);
    process.exit(1);
  }

  process.once('SIGINT', async () => {
    logger.newLine();
    logger.notice(`Exiting ${Constants.COMMAND_NAME} early`);
    await ProgressBarCLI.stop();
    process.exit(0);
    // TODO(cemmer): does exit here cause cleanup not to happen?
  });

  // Parse CLI arguments
  let options: Options;
  try {
    options = new ArgumentsParser(logger).parse(process.argv.slice(2));
    if (options.getHelp()) {
      process.exit(0);
    }
    logger.setLogLevel(options.getLogLevel());
  } catch (error) {
    // Explicitly do not log the stack trace, for readability
    logger.error(error);
    logger.newLine();
    process.exit(1);
  }

  // Start the main process
  try {
    new EndOfLifeChecker(logger).check(process.version);
    new UpdateChecker(logger).check();

    await new Igir(options, logger).main();
    await ProgressBarCLI.stop();
  } catch (error) {
    await ProgressBarCLI.stop();
    if (error instanceof Error && error.stack) {
      // Log the stack trace to help with bug reports
      logger.error(error.stack);
    } else {
      logger.error(error);
    }
    logger.newLine();
    process.exit(1);
  }
})();
