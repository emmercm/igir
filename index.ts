#!/usr/bin/env node

import os from 'node:os';

import semver from 'semver';

import Logger from './src/console/logger.js';
import { LogLevel } from './src/console/logLevel.js';
import MultiBar from './src/console/multiBar.js';
import Package from './src/globals/package.js';
import Igir from './src/igir.js';
import ArgumentsParser from './src/modules/argumentsParser.js';
import EndOfLifeChecker from './src/modules/endOfLifeChecker.js';
import UpdateChecker from './src/modules/updateChecker.js';
import IgirException from './src/types/exceptions/igirException.js';
import type Options from './src/types/options.js';

// Double the number of frames tracked in a stack trace
Error.stackTraceLimit = Math.max(Error.stackTraceLimit, 25);

const logger = new Logger(LogLevel.WARN, process.stdout);
logger.printHeader();

if (!semver.satisfies(process.version, Package.ENGINES_NODE)) {
  logger.error(`${Package.NAME} requires a Node.js version of ${Package.ENGINES_NODE}`);
  process.exit(1);
}

process.once('SIGINT', () => {
  MultiBar.stop();
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
      return `"${arg.replaceAll('"', '\\"')}"`;
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

if (options.getDebugLog()) {
  logger.trace(`process: ${process.platform} ${process.arch}`);
  logger.trace(`process.execPath: ${process.execPath}`);
  logger.trace(`process.versions: ${JSON.stringify(process.versions)}`);
  logger.trace(`os.release: ${os.release()}`);
  logger.trace(`os.userInfo: ${JSON.stringify(os.userInfo())}`);
  logger.trace(`package.json: ${JSON.stringify(Package.JSON)}`);
}

// Start the main process
try {
  new EndOfLifeChecker(logger).check(process.version);
  void new UpdateChecker(logger).check();

  await new Igir(options, logger).main();
  MultiBar.stop();
} catch (error) {
  const needNewline = MultiBar.isActive();
  MultiBar.stop();
  if (needNewline) {
    logger.newLine();
  }

  if (error instanceof IgirException) {
    logger.error(error);
  } else if (error instanceof Error && error.stack) {
    // Log the stack trace to help with bug reports
    logger.error(error.stack);
  } else {
    logger.error(error);
  }
  process.exit(1);
}
