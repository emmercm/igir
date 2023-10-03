import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';

import ProgressBar, { ProgressBarSymbol } from '../console/progressBar.js';
import DAT from '../types/dats/dat.js';
import Options from '../types/options.js';
import OutputFactory from '../types/outputFactory.js';
import Module from './module.js';

/**
 * TODO(cemmer)
 */
export default class Dir2DatCreator extends Module {
  private readonly options: Options;

  constructor(options: Options, progressBar: ProgressBar) {
    super(progressBar, Dir2DatCreator.name);
    this.options = options;
  }

  /**
   * TODO(cemmer)
   */
  async create(dat: DAT): Promise<string | undefined> {
    if (!this.options.shouldDir2Dat()) {
      return undefined;
    }

    this.progressBar.logInfo(`${dat.getNameShort()}: writing dir2dat`);
    await this.progressBar.setSymbol(ProgressBarSymbol.WRITING);
    await this.progressBar.reset(1);

    const datDir = this.options.shouldWrite()
      ? OutputFactory.getDir(this.options, dat)
      : process.cwd();
    const datContents = dat.toXmlDat();
    const datPath = path.join(datDir, dat.getFilename());
    await util.promisify(fs.writeFile)(datPath, datContents);

    this.progressBar.logInfo(`${dat.getNameShort()}: done writing dir2dat`);
    return datPath;
  }
}
