import child_process from 'node:child_process';
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import util from 'node:util';

import chalk from 'chalk';
import semver from 'semver';
import terminalLink from 'terminal-link';
import which from 'which';

import type Logger from '../console/logger.js';
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
      let message = `An update is available, get v${npmVersion}`;
      const color = chalk.white;
      if (await UpdateChecker.isHomebrew()) {
        message += ` via Homebrew: ${color(`brew upgrade ${Package.NAME}`)}`;
      } else if (process.versions.bun) {
        const gitHubUrl = `https://github.com/emmercm/${Package.NAME}/releases/latest`;
        message += ` on GitHub: ${color(terminalLink(gitHubUrl, gitHubUrl))}`;
      } else if (process.env.npm_command === 'exec') {
        message += ` via npx: ${color(`npx ${Package.NAME}@latest`)}`;
      } else {
        message += ` via npm: ${color(`npm update ${Package.NAME}`)}`;
      }
      MultiBar.log(this.logger.formatMessage(LogLevel.NOTICE, message));
    }
  }

  private static async getVersion(packageName: string): Promise<string> {
    return await new Promise((resolve, reject) => {
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

  private static async isHomebrew(): Promise<boolean> {
    const brew = await which('brew', { nothrow: true });
    if (brew === null) {
      return false;
    }

    try {
      const brewPrefixOutput = await util.promisify(child_process.execFile)(brew, ['--prefix']);
      const brewPrefix = brewPrefixOutput.stdout.trim();
      const execPath = await fs.promises.realpath(process.execPath);
      return execPath.startsWith(path.join(brewPrefix, 'bin'));
    } catch {
      return false;
    }
  }
}
