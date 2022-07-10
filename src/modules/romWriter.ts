import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';

import DAT from '../types/dat/dat.js';
import Parent from '../types/dat/parent.js';
import ROM from '../types/dat/rom.js';
import Options from '../types/options.js';
import ProgressBar from '../types/progressBar.js';
import ReleaseCandidate from '../types/releaseCandidate.js';
import ROMFile from '../types/romFile.js';

export default class ROMWriter {
  private readonly options: Options;

  private readonly progressBar: ProgressBar;

  constructor(options: Options, progressBar: ProgressBar) {
    this.options = options;
    this.progressBar = progressBar;
  }

  write(
    dat: DAT,
    parentsToCandidates: Map<Parent, ReleaseCandidate[]>,
  ): Map<Parent, ROMFile[]> {
    const output = new Map<Parent, ROMFile[]>();

    this.progressBar.reset(parentsToCandidates.size).setSymbol(this.options.getZip() ? '🗜️' : '📂');

    parentsToCandidates.forEach((releaseCandidates, parent) => {
      this.progressBar.increment();

      const outputRomFiles = releaseCandidates.flatMap((releaseCandidate) => {
        const crcToRoms = releaseCandidate.getRomsByCrc();

        const inputToOutput = releaseCandidate.getRomFiles().reduce((acc, inputRomFile) => {
          const rom = crcToRoms.get(inputRomFile.getCrc()) as ROM;

          let outputFilePath = this.options.getOutput(dat, rom.getName());
          let entryPath;

          if (this.options.getZip()) {
            outputFilePath = this.options.getOutput(dat, `${releaseCandidate.getName()}.zip`);
            entryPath = rom.getName();
          }

          const outputRomFile = new ROMFile(outputFilePath, entryPath, inputRomFile.getCrc());
          acc.set(inputRomFile, outputRomFile);
          return acc;
        }, new Map<ROMFile, ROMFile>());

        // Stop early if there is nothing to write
        if ([...inputToOutput.entries()].every((entry) => entry[0].equals(entry[1]))) {
          return [...inputToOutput.values()];
        }

        if (this.options.getZip()) {
          this.writeZip(inputToOutput);
        } else {
          this.writeRaw(inputToOutput);
        }

        return [...inputToOutput.values()];
      });

      output.set(parent, outputRomFiles);
    });

    return output;
  }

  private static getFileBuffer(romFile: ROMFile): Buffer {
    if (path.extname(romFile.getFilePath()) === '.zip') {
      const zip = new AdmZip(romFile.getFilePath());
      return zip.getEntry(romFile.getEntryPath() as string)?.getData() as Buffer;
    }

    return fs.readFileSync(romFile.getFilePath());
  }

  private writeZip(inputToOutput: Map<ROMFile, ROMFile>) {
    // There is only one output file
    const outputZipPath = [...inputToOutput.values()][0].getFilePath();
    let outputZip = new AdmZip();
    if (fs.existsSync(outputZipPath)) {
      outputZip = new AdmZip(outputZipPath);
    }

    let outputNeedsCleaning = outputZip.getEntryCount() > 0;
    let outputNeedsWriting = false;

    inputToOutput.forEach((outputRomFile, inputRomFile) => {
      if (outputRomFile.equals(inputRomFile)) {
        return;
      }

      if (this.options.getMove()) {
        // TODO(cemmer)
        return;
      }

      // If the file in the output zip already exists and has the same CRC then do nothing
      const existingOutputEntry = outputZip.getEntry(outputRomFile.getEntryPath() as string);
      if (existingOutputEntry
          && existingOutputEntry.header.crc === parseInt(outputRomFile.getCrc(), 16)) {
        return;
      }

      // We need to write to the zip file, delete its contents if the zip file didn't start empty
      if (outputNeedsCleaning) {
        outputZip.getEntries().forEach((entry) => outputZip.deleteFile(entry));
        outputNeedsCleaning = false;
      }

      // Write the entry
      outputZip.addFile(
        outputRomFile.getEntryPath() as string,
        ROMWriter.getFileBuffer(inputRomFile),
      );
      outputNeedsWriting = true;
    });

    // Write the zip file if needed
    if (outputNeedsWriting) {
      outputZip.writeZip(outputZipPath);
    }

    // If "moving", delete the input files
    if (this.options.getMove()) {
      [...inputToOutput.keys()]
        .map((romFile) => romFile.getFilePath())
        .filter((filePath) => filePath !== outputZipPath)
        .filter((romFile, idx, romFiles) => romFiles.indexOf(romFile) === idx)
        .forEach((filePath) => fs.rmSync(filePath));
    }
  }

  private writeRaw(inputToOutput: Map<ROMFile, ROMFile>) {
    inputToOutput.forEach((outputRomFile, inputRomFile) => {
      if (outputRomFile.equals(inputRomFile)) {
        return;
      }

      if (this.options.getMove()) {
        if (outputRomFile.getFilePath() !== inputRomFile.getFilePath()) {
          fs.renameSync(inputRomFile.getFilePath(), outputRomFile.getFilePath());
        }
      } else {
        fs.writeFileSync(outputRomFile.getFilePath(), ROMWriter.getFileBuffer(inputRomFile));
      }
    });
  }
}
