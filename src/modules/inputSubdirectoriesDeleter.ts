import fs from 'node:fs';

import ProgressBar, { ProgressBarSymbol } from '../console/progressBar.js';
import FsPoly from '../polyfill/fsPoly.js';
import File from '../types/files/file.js';
import Options from '../types/options.js';
import Module from './module.js';

/**
 *
 */
export default class InputSubdirectoriesDeleter extends Module {
  private readonly options: Options;

  constructor(options: Options, progressBar: ProgressBar) {
    super(progressBar, InputSubdirectoriesDeleter.name);
    this.options = options;
  }

  /**
   *
   */
  async delete(movedRoms: File[]): Promise<string[]> {
    if (!this.options.shouldMove()) {
      // We shouldn't do anything
      return [];
    }

    if (movedRoms.length === 0) {
      return [];
    }

    this.progressBar.logTrace('deleting empty input subdirectories');
    this.progressBar.setSymbol(ProgressBarSymbol.DAT_FILTERING);
    this.progressBar.resetProgress(movedRoms.length);

    return [];
  }

  private async walkEmptyDirs(movedFiles: File[]): Promise<string[]> {
    for (const inputPath of this.options.getInputPaths()) {
      const entries = await fs.promises.readdir(inputPath, { withFileTypes: true });
      const isEmptyDir = entries.every(
        (entry) => !(entry.isFile() || (entry.isSymbolicLink() && FsPoly.isFile(entry.path))),
      );
    }
  }
}
