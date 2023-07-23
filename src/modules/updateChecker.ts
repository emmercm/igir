import https from 'https';
import semver from 'semver';

import Logger from '../console/logger.js';
import LogLevel from '../console/logLevel.js';
import ProgressBarCLI from '../console/progressBarCLI.js';
import Constants from '../constants.js';
import BufferPoly from '../polyfill/bufferPoly.js';

export default class UpdateChecker {
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async check(): Promise<void> {
    await this.log();
  }

  private async log(): Promise<void> {
    let npmVersion;
    try {
      npmVersion = await UpdateChecker.getVersion(Constants.COMMAND_NAME);
    } catch (e) {
      return;
    }

    if (npmVersion && semver.lt(Constants.COMMAND_VERSION, npmVersion)) {
      ProgressBarCLI.log(this.logger, LogLevel.NOTICE, `An update is available for ${Constants.COMMAND_NAME}: v${npmVersion}\n`);
    }
  }

  private static async getVersion(packageName: string): Promise<string> {
    return new Promise((resolve, reject) => {
      https.get(`https://registry.npmjs.org/${packageName}/latest`, {
        timeout: 5_000,
      }, async (res) => {
        const data = await BufferPoly.fromReadable(res);
        let json;
        try {
          json = JSON.parse(data.toString()) || {};
        } catch (e) {
          reject(e);
          return;
        }

        resolve(json.version);
      })
        .on('error', reject)
        .on('timeout', reject);
    });
  }
}
