import async from 'async';

import Logger from './console/logger.js';
import ProgressBarCLI from './console/progressBarCLI.js';
import CandidateFilter from './modules/candidateFilter.js';
import CandidateGenerator from './modules/candidateGenerator.js';
import DATScanner from './modules/datScanner.js';
import OutputCleaner from './modules/outputCleaner.js';
import ReportGenerator from './modules/reportGenerator.js';
import ROMScanner from './modules/romScanner.js';
import ROMWriter from './modules/romWriter.js';
import StatusGenerator from './modules/statusGenerator.js';
import DAT from './types/logiqx/dat.js';
import Parent from './types/logiqx/parent.js';
import Options from './types/options.js';
import ROMFile from './types/romFile.js';

export default async function main(options: Options, logger: Logger) {
  // Find all DAT files and parse them
  const datScanProgressBar = logger.addProgressBar('Scanning for DATs', '⏳');
  const dats = await new DATScanner(options, datScanProgressBar).scan();
  if (!dats.length) {
    ProgressBarCLI.stop();
    logger.error('\nNo valid DAT files found!');
    throw new Error();
  }
  await datScanProgressBar.done(`${dats.length.toLocaleString()} DAT${dats.length !== 1 ? 's' : ''} found`);

  // Find all ROM files and pre-process them
  const romScanProgressBar = logger.addProgressBar('Scanning for ROMs', '⏳');
  const romInputs = await new ROMScanner(options, romScanProgressBar).scan();
  await romScanProgressBar.done(`${romInputs.length.toLocaleString()} ROM${romInputs.length !== 1 ? 's' : ''} found`);

  const datProcessProgressBar = logger.addProgressBar('Processing DATs', '⚙️', dats.length);
  const datsToWrittenRoms = new Map<DAT, Map<Parent, ROMFile[]>>();

  await async.eachLimit(dats, 3, async (dat, callback) => {
    const progressBar = logger.addProgressBar(dat.getNameShort(), '⏳', dat.getParents().length);
    await datProcessProgressBar.increment();

    // For each DAT, find all ROM candidates
    const romCandidates = await new CandidateGenerator(progressBar).generate(dat, romInputs);

    // Filter all ROM candidates
    const romOutputs = await new CandidateFilter(options, progressBar).filter(dat, romCandidates);

    // Write the output files
    const writtenRoms = await new ROMWriter(options, progressBar).write(dat, romOutputs);

    // Write the output report
    await new StatusGenerator(options, progressBar).output(writtenRoms);

    // Progress bar cleanup
    const parentsWithRomFiles = [...writtenRoms.values()]
      .filter((romFiles) => romFiles.length)
      .length;
    if (parentsWithRomFiles === 0) {
      await progressBar.delete();
    }

    datsToWrittenRoms.set(dat, writtenRoms);
    callback();
  });

  await datProcessProgressBar.done(`${dats.length.toLocaleString()} DAT${dats.length !== 1 ? 's' : ''} processed`);

  // Generate the report
  if (options.shouldReport()) {
    const reportProgressBar = logger.addProgressBar('Generating report', '📝');
    await new ReportGenerator(options, reportProgressBar).generate(datsToWrittenRoms);
  }

  // Clean the output directories
  if (options.shouldClean()) {
    const cleanerProgressBar = logger.addProgressBar('Cleaning output', '⏳');
    const allWrittenRomFiles = [...datsToWrittenRoms.values()]
      .flatMap((parentsToRomFiles) => [...parentsToRomFiles.values()])
      .flatMap((romFiles) => romFiles);
    await new OutputCleaner(options, cleanerProgressBar).clean(allWrittenRomFiles);
  }

  ProgressBarCLI.stop();
}
