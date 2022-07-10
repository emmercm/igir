import CandidateFilter from './modules/candidateFilter.js';
import CandidateGenerator from './modules/candidateGenerator.js';
import DATScanner from './modules/datScanner.js';
import OutputCleaner from './modules/outputCleaner.js';
import ReportGenerator from './modules/reportGenerator.js';
import ROMScanner from './modules/romScanner.js';
import ROMWriter from './modules/romWriter.js';
import DAT from './types/dat/dat.js';
import Parent from './types/dat/parent.js';
import Options from './types/options.js';
import ProgressBar from './types/progressBar.js';
import ROMFile from './types/romFile.js';

export default async function main(options: Options) {
  // Find all DAT files and parse them
  const dats = await DATScanner.parse(options);

  // Set up the progress bars
  const multiBarMaxName = dats.reduce((max, dat) => Math.max(max, dat.getShortName().length), 0);
  const progressBars = dats.reduce((acc, dat) => {
    acc.set(dat, new ProgressBar(multiBarMaxName, dat.getShortName(), '⏳', dat.getParents().length));
    return acc;
  }, new Map<DAT, ProgressBar>());

  const datsToWrittenRoms = new Map<DAT, Map<Parent, ROMFile[]>>();
  await Promise.all(dats.map(async (dat) => {
    const progressBar = progressBars.get(dat) as ProgressBar;

    // Find all ROM files and pre-process them
    const romInputs = new ROMScanner(options, progressBar).parse(dat);

    // For each DAT, find all ROM candidates
    const romCandidates = new CandidateGenerator(progressBar).generate(dat, romInputs);

    // Filter all ROM candidates
    const romOutputs = new CandidateFilter(options, progressBar).filter(romCandidates);

    // Write the output files
    const writtenRoms = new ROMWriter(options, progressBar).write(dat, romOutputs);

    // Clean the output directory
    await new OutputCleaner(options, progressBar).clean(dat, writtenRoms);

    const parentsWithRomFiles = [...writtenRoms.values()]
      .filter((romFiles) => romFiles.length)
      .length;
    progressBar
      .setSymbol('✅')
      .setProgressMessage(`${parentsWithRomFiles} ROM${parentsWithRomFiles > 1 ? 's' : ''} processed`);

    datsToWrittenRoms.set(dat, writtenRoms);
  }));

  ProgressBar.stop();

  // Write the output report
  new ReportGenerator(options).write(datsToWrittenRoms);
}
