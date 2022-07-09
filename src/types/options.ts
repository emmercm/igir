import { Expose, plainToInstance } from 'class-transformer';
import fg from 'fast-glob';
import fs from 'fs';

export default class Options {
  @Expose({ name: 'dat' })
  private datFiles!: string[];

  @Expose({ name: 'input' })
  private inputFiles!: string[];

  private output!: string;

  static fromObject(obj: object) {
    return plainToInstance(Options, obj, {
      enableImplicitConversion: true,
    })
      .scanFileInputs()
      .validate();
  }

  private scanFileInputs(): Options {
    this.datFiles = Options.scanPath(this.datFiles);
    this.inputFiles = Options.scanPath(this.inputFiles);
    return this;
  }

  private static scanPath(inputPaths: string[]): string[] {
    return inputPaths
      .flatMap((inputPath) => {
        // Change directory to glob pattern
        if (!fs.existsSync(inputPath) || !fs.lstatSync(inputPath).isDirectory()) {
          return inputPath;
        }
        return `${inputPath}/**`;
      })
      .flatMap((inputPath) => {
        // Apply glob pattern
        if (fs.existsSync(inputPath)) {
          return inputPath;
        }
        return fg.sync(inputPath);
      })
      .filter((inputPath) => !fs.lstatSync(inputPath).isDirectory());
  }

  private validate(): Options {
    // TODO(cemmer): validate fields on the class
    return this;
  }

  getDatFiles(): string[] {
    return this.datFiles;
  }

  getInputFiles(): string[] {
    return this.inputFiles;
  }

  getOutput(): string {
    return this.output;
  }
}
