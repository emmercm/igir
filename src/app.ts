import async from 'async';

import Logger from './logger.js';
import CandidateFilter from './modules/candidateFilter.js';
import CandidateGenerator from './modules/candidateGenerator.js';
import DATScanner from './modules/datScanner.js';
import OutputCleaner from './modules/outputCleaner.js';
import ReportGenerator from './modules/reportGenerator.js';
import ROMScanner from './modules/romScanner.js';
import ROMWriter from './modules/romWriter.js';
import DAT from './types/logiqx/dat.js';
import Parent from './types/logiqx/parent.js';
import Options from './types/options.js';
import ProgressBar from './types/progressBar.js';
import ROMFile from './types/romFile.js';

export default async function main(options: Options) {
  // Find all DAT files and parse them
  // TODO(cemmer): move creation and management of progress bars to each of the modules
  const datScanProgressBar = new ProgressBar('Scanning for DATs', '⏳', 0);
  const dats = await new DATScanner(options, datScanProgressBar).parse();
  if (!dats.length) {
    Logger.error('\nNo valid DAT files found!');
    process.exit(1);
  }
  datScanProgressBar
    .setSymbol('✅')
    .setProgressMessage(`${dats.length.toLocaleString()} DAT file${dats.length !== 1 ? 's' : ''} parsed`);

  // Find all ROM files and pre-process them
  const romScanProgressBar = new ProgressBar('Scanning for ROMs', '⏳', 0);
  const romInputs = await new ROMScanner(options, romScanProgressBar).scan();
  romScanProgressBar
    .setSymbol('✅')
    .setProgressMessage(`${romInputs.length.toLocaleString()} ROM file${romInputs.length !== 1 ? 's' : ''} found`);

  const datProcessProgressBar = new ProgressBar('Processing DATs', '⚙️', dats.length);
  const datsToWrittenRoms = new Map<DAT, Map<Parent, ROMFile[]>>();

  await async.eachLimit(dats, 3, async (dat, callback) => {
    const progressBar = new ProgressBar(dat.getName(), '⏳', dat.getParents().length);
    datProcessProgressBar.increment();

    // For each DAT, find all ROM candidates
    const romCandidates = await new CandidateGenerator(progressBar).generate(dat, romInputs);

    // Filter all ROM candidates
    const romOutputs = await new CandidateFilter(options, progressBar).filter(romCandidates);

    // Write the output files
    const writtenRoms = await new ROMWriter(options, progressBar).write(dat, romOutputs);

    const parentsWithRomFiles = [...writtenRoms.values()]
      .filter((romFiles) => romFiles.length)
      .length;
    progressBar
      .setSymbol('✅')
      .setProgressMessage(`${parentsWithRomFiles.toLocaleString()} ROM${parentsWithRomFiles !== 1 ? 's' : ''} processed`);

    datsToWrittenRoms.set(dat, writtenRoms);
    progressBar.delete();
    callback();
  });

  datProcessProgressBar
    .setSymbol('✅')
    .setProgressMessage(`${dats.length.toLocaleString()} DAT${dats.length !== 1 ? 's' : ''} processed`);

  // Clean the output directories
  if (options.getClean()) {
    const cleanerProgressBar = new ProgressBar('Cleaning output', '⏳', 0);
    const allWrittenRomFiles = [...datsToWrittenRoms.values()]
      .flatMap((parentsToRomFiles) => [...parentsToRomFiles.values()])
      .flatMap((romFiles) => romFiles);
    await new OutputCleaner(options, cleanerProgressBar).clean(allWrittenRomFiles);
  }

  ProgressBar.stop();

  // Write the output report
  new ReportGenerator(options).write(datsToWrittenRoms);
}
