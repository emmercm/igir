import fs from 'node:fs';
import module from 'node:module';
import os from 'node:os';
import path from 'node:path';

const require = module.createRequire(import.meta.url);

export const CHDType = {
  CD_ROM: 'CD_ROM',
  DVD_ROM: 'DVD_ROM',
  GD_ROM: 'GD_ROM',
  HARD_DISK: 'HARD_DISK',
  RAW: 'RAW',
} as const;
export type CHDType = (typeof CHDType)[keyof typeof CHDType];

export interface CHDInfo {
  inputFile: string;
  type: CHDType;
  fileVersion: number;
  logicalSize: number;
  hunkSize: number;
  totalHunks: number;
  unitSize: number;
  totalUnits: number;
  compression: string[];
  chdSize: number;
  sha1: string | undefined;
  dataSha1: string | undefined;
}

export interface InfoOptions {
  inputFilename: string;
}

export interface ExtractRawOptions {
  inputFilename: string;
  outputFilename: string;
}

export interface ExtractCdOptions {
  inputFilename: string;
  outputFilename: string;
  outputBinFilename?: string;
  splitBin?: boolean;
}

interface ChdmanBinding {
  version: () => string;
  info: (inputFilename: string) => Promise<Omit<CHDInfo, 'type'> & { type: string }>;
  extractRaw: (inputFilename: string, outputFilename: string) => Promise<void>;
  extractCd: (
    inputFilename: string,
    outputFilename: string,
    splitBin: boolean,
    outputBinFilename: string,
  ) => Promise<void>;
}

const binding = ((): ChdmanBinding => {
  try {
    return require(
      `./addon-chdman/prebuilds/${os.platform()}-${os.arch()}/node.node`,
    ) as ChdmanBinding;
  } catch {
    /* fall through to local build */
  }
  return require('./build/Release/chdman.node') as ChdmanBinding;
})();

const exported = {
  /**
   * Return structured information about a CHD file's header.
   */
  async info(options: InfoOptions): Promise<CHDInfo> {
    const raw = await binding.info(options.inputFilename);
    const type = Object.values(CHDType).find((value) => value === raw.type);
    if (type === undefined) {
      throw new Error(`unexpected CHD type: ${raw.type}`);
    }
    return { ...raw, type };
  },

  /**
   * Extract the raw data from a CHD file to a single output file.
   */
  async extractRaw(options: ExtractRawOptions): Promise<void> {
    await binding.extractRaw(options.inputFilename, options.outputFilename);
  },

  /**
   * Extract the raw data from a hard disk CHD file to a single output file.
   */
  async extractHd(options: ExtractRawOptions): Promise<void> {
    await binding.extractRaw(options.inputFilename, options.outputFilename);
  },

  /**
   * Extract the raw data from a DVD CHD file to a single output file.
   */
  async extractDvd(options: ExtractRawOptions): Promise<void> {
    await binding.extractRaw(options.inputFilename, options.outputFilename);
  },

  /**
   * Extract a CD-ROM CHD file to a cue/toc file plus one or more binary track
   * files, and return the absolute paths of every file produced.
   *
   * The output file must reside in a directory dedicated to this extraction:
   * every file in that directory is returned, so the directory must not contain
   * any unrelated files.
   */
  async extractCd(options: ExtractCdOptions): Promise<string[]> {
    await binding.extractCd(
      options.inputFilename,
      options.outputFilename,
      options.splitBin ?? false,
      options.outputBinFilename ?? '',
    );
    // The native layer returns void; discover the produced files by listing the
    // output directory (igir passes a fresh temp dir, so this is exactly the new files).
    const directory = path.dirname(options.outputFilename);
    const names = await fs.promises.readdir(directory);
    return names.map((name) => path.join(directory, name));
  },
};
export default exported;
