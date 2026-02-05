import semver from 'semver';

import type Logger from '../console/logger.js';
import { LogLevel } from '../console/logLevel.js';
import MultiBar from '../console/multiBar.js';

/**
 * Check if the current Node.js version has reached EOL and log if it has.
 */
export default class EndOfLifeChecker {
  private static readonly END_OF_SECURITY_SUPPORT_DATES = [
    [4, new Date('2018-04-30')],
    [5, new Date('2016-06-30')],
    [6, new Date('2019-04-30')],
    [7, new Date('2017-06-30')],
    [8, new Date('2019-01-31')],
    [9, new Date('2018-06-30')],
    [10, new Date('2021-04-30')],
    [11, new Date('2019-06-30')],
    [12, new Date('2022-04-30')],
    [13, new Date('2020-06-01')],
    [14, new Date('2023-04-30')],
    [15, new Date('2021-06-01')],
    [16, new Date('2023-09-11')],
    [17, new Date('2022-06-01')],
    [18, new Date('2025-04-30')],
    [19, new Date('2023-06-01')],
    [20, new Date('2026-04-30')],
    [21, new Date('2024-06-01')],
    [22, new Date('2027-04-30')],
    [23, new Date('2025-06-01')],
    [24, new Date('2028-04-30')],
    [25, new Date('2026-06-01')],
  ] satisfies [number, Date][];

  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Check the current Node.js version.
   */
  check(nodejsVersion: string, now = new Date()): void {
    for (const [majorVersion, endOfLifeDate] of EndOfLifeChecker.END_OF_SECURITY_SUPPORT_DATES) {
      if (semver.satisfies(nodejsVersion, `^${majorVersion}`)) {
        if (now > endOfLifeDate) {
          // We are past the EOL of a known version, warn and return
          MultiBar.log(
            this.logger.formatMessage(
              LogLevel.WARN,
              `Node.js v${majorVersion} reached end-of-life on ${endOfLifeDate.toDateString()}, you should update to an actively maintained LTS version`,
            ),
          );
          return;
        }

        if (majorVersion % 2 === 1) {
          // We are within the support period of a non-LTS version, warn and return
          MultiBar.log(
            this.logger.formatMessage(
              LogLevel.WARN,
              `Node.js v${majorVersion} has a very short support window (ending on ${endOfLifeDate.toDateString()}), you should consider using an LTS version`,
            ),
          );
          return;
        }

        break;
      }
    }

    const coercedVersion = semver.coerce(nodejsVersion);
    if (coercedVersion && coercedVersion.major % 2 === 1) {
      // We are on an unknown non-LTS version, warn and return
      MultiBar.log(
        this.logger.formatMessage(
          LogLevel.WARN,
          `Node.js v${coercedVersion.major} has a very short support window, you should consider using an LTS version`,
        ),
      );
    }
  }
}
