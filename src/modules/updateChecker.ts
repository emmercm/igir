import https from 'node:https';

import semver from 'semver';

import Logger from '../console/logger.js';
import { LogLevel } from '../console/logLevel.js';
import MultiBar from '../console/multiBar.js';
import Package from '../globals/package.js';
import BufferPoly from '../polyfill/bufferPoly.js';

/**
 * Check for a newer version and log if one is found.
 */
export default class UpdateChecker {
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Check for a newer version and log if one is found.
   */
  async check(): Promise<void> {
    let npmVersion;
    try {
      npmVersion = await UpdateChecker.getVersion(Package.NAME);
    } catch {
      return;
    }

    if (npmVersion && semver.lt(Package.VERSION, npmVersion)) {
      MultiBar.log(
        this.logger.formatMessage(
          LogLevel.NOTICE,
          `An update is available for ${Package.NAME}: v${npmVersion}`,
        ),
      );
    }
  }

  private static async getVersion(packageName: string): Promise<string> {
    return new Promise((resolve, reject) => {
      https
        .get(
          `https://registry.npmjs.org/${packageName}/latest`,
          {
            timeout: 5000,
          },
          async (res) => {
            const data = await BufferPoly.fromReadable(res);
            let json;
            try {
              json = JSON.parse(data.toString()) as {
                version: string;
              };
            } catch (error) {
              if (error instanceof Error) {
                reject(error);
              } else if (typeof error === 'string') {
                reject(new Error(error));
              } else {
                reject(new Error('failed to get latest version from npmjs.org'));
              }
              return;
            }

            resolve(json.version);
          },
        )
        .on('error', reject)
        .on('timeout', reject);
    });
  }
}
