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
  if (!options.getDatFiles().length) {
    Logger.error(
      `No DAT files found! You can find DAT files at the following websites:

- No-Intro (cartridge-based systems): https://datomatic.no-intro.org/
- Redump (optical media-based systems): http://redump.org/
- TOSEC: https://www.tosecdev.org/`,
    );
    return;
  }
  const dats = await DATScanner.parse(options);
  if (!dats.length) {
    Logger.error('No valid DAT files found!');
    return;
  }

  // Set up the progress bars
  const scanProgressBarName = 'Scanning for ROMs';
  const multiBarMaxName = dats
    .map((dat) => dat.getShortName())
    .concat(scanProgressBarName)
    .reduce((max, name) => Math.max(max, name.length), 0);
  const scanProgressBar = new ProgressBar(multiBarMaxName, scanProgressBarName, '⏳', 0);
  const datProgressBars = dats.reduce((acc, dat) => {
    acc.set(dat, new ProgressBar(multiBarMaxName, dat.getShortName(), '⏳', dat.getParents().length));
    return acc;
  }, new Map<DAT, ProgressBar>());

  // Find all ROM files and pre-process them
  const romInputs = await new ROMScanner(options, scanProgressBar).scan();
  scanProgressBar
    .setSymbol('✅')
    .setProgressMessage(`${romInputs.length} ROM file${romInputs.length !== 1 ? 's' : ''} found`);

  const datsToWrittenRoms = new Map<DAT, Map<Parent, ROMFile[]>>();

  await async.eachLimit(dats, 3, async (dat, callback) => {
    const progressBar = datProgressBars.get(dat) as ProgressBar;

    // For each DAT, find all ROM candidates
    const romCandidates = await new CandidateGenerator(progressBar).generate(dat, romInputs);

    // Filter all ROM candidates
    const romOutputs = await new CandidateFilter(options, progressBar).filter(romCandidates);

    // Write the output files
    const writtenRoms = await new ROMWriter(options, progressBar).write(dat, romOutputs);

    datsToWrittenRoms.set(dat, writtenRoms);
    callback();
  });

  // Clean the output directories
  const allWrittenRomFiles = [...datsToWrittenRoms.values()]
    .flatMap((parentsToRomFiles) => [...parentsToRomFiles.values()])
    .flatMap((romFiles) => romFiles);
  await new OutputCleaner(options, [...datProgressBars.values()]).clean(allWrittenRomFiles);

  // Finish all progress bars
  datsToWrittenRoms.forEach((writtenRoms, dat) => {
    const progressBar = datProgressBars.get(dat) as ProgressBar;
    const parentsWithRomFiles = [...writtenRoms.values()]
      .filter((romFiles) => romFiles.length)
      .length;
    progressBar
      .setSymbol('✅')
      .setProgressMessage(`${parentsWithRomFiles} ROM${parentsWithRomFiles !== 1 ? 's' : ''} processed`);
  });

  ProgressBar.stop();

  // Write the output report
  new ReportGenerator(options).write(datsToWrittenRoms);
}
