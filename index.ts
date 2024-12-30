#!/usr/bin/env node

import realFs from 'node:fs';

import gracefulFs from 'graceful-fs';
import semver from 'semver';

import Logger from './src/console/logger.js';
import ProgressBarCLI from './src/console/progressBarCli.js';
import Package from './src/globals/package.js';
import Igir from './src/igir.js';
import ArgumentsParser from './src/modules/argumentsParser.js';
import EndOfLifeChecker from './src/modules/endOfLifeChecker.js';
import UpdateChecker from './src/modules/updateChecker.js';
import ExpectedError from './src/types/expectedError.js';
import Options from './src/types/options.js';

// Monkey-patch 'fs' to help prevent Windows EMFILE errors
gracefulFs.gracefulify(realFs);

const logger = new Logger();
logger.printHeader();

if (!semver.satisfies(process.version, Package.ENGINES_NODE)) {
  logger.error(`${Package.NAME} requires a Node.js version of ${Package.ENGINES_NODE}`);
  process.exit(1);
}

process.once('SIGINT', () => {
  ProgressBarCLI.stop();
  logger.newLine();
  logger.notice(`Exiting ${Package.NAME} early`);
  process.exit(0);
});

// Parse CLI arguments
let options: Options;
try {
  const argv = process.argv.slice(2);
  options = new ArgumentsParser(logger).parse(argv);
  logger.setLogLevel(options.getLogLevel());

  const argvString = argv
    .map((arg) => {
      if (!arg.includes(' ')) {
        return arg;
      }
      return `"${arg.replace(/"/g, '\\"')}"`;
    })
    .join(' ');
  logger.trace(`Parsing CLI arguments: ${argvString}`);
  logger.trace(`Parsed CLI options: ${options.toString()}`);

  if (options.getHelp()) {
    process.exit(0);
  }
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
  ProgressBarCLI.stop();
} catch (error) {
  ProgressBarCLI.stop();
  if (error instanceof ExpectedError) {
    logger.error(error);
  } else if (error instanceof Error && error.stack) {
    // Log the stack trace to help with bug reports
    logger.error(error.stack);
  } else {
    logger.error(error);
  }
  logger.newLine();
  process.exit(1);
}
