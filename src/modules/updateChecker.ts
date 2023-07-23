import https from 'https';
import semver from 'semver';

import LogLevel from '../console/logLevel.js';
import ProgressBar from '../console/progressBar.js';
import Constants from '../constants.js';
import BufferPoly from '../polyfill/bufferPoly.js';
import Module from './module.js';

export default class UpdateChecker extends Module {
  constructor(progressBar: ProgressBar) {
    super(progressBar, UpdateChecker.name);
  }

  async check(): Promise<void> {
    await this.progressBar.incrementProgress();
    await this.log();
    this.progressBar.delete();
  }

  private async log(): Promise<void> {
    let npmVersion;
    try {
      npmVersion = await UpdateChecker.getVersion(Constants.COMMAND_NAME);
    } catch (e) {
      return;
    }

    if (npmVersion && semver.lt(Constants.COMMAND_VERSION, npmVersion)) {
      await this.progressBar.log(LogLevel.NOTICE, `An update is available for ${Constants.COMMAND_NAME}: v${npmVersion}\n`);
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
