import async, { AsyncResultCallback } from 'async';

import Logger from './logger';
import CandidateFilter from './services/candidateFilter';
import CandidateGenerator from './services/candidateGenerator';
import DATScanner from './services/datScanner';
import ReportGenerator from './services/reportGenerator';
import ROMWriter from './services/romOutput';
import ROMScanner from './services/romScanner';
import DAT from './types/dat/dat';
import Parent from './types/dat/parent';
import Options from './types/options';
import ProgressBar from './types/progressBar';
import ROMFile from './types/romFile';

export default async function main(options: Options) {
  // Find all DAT files and parse them
  const dats = await DATScanner.parse(options);

  const multiBarMaxName = dats.reduce((max, dat) => Math.max(max, dat.getShortName().length), 0);

  async.mapLimit(
    dats,
    100,
    (dat, callback: AsyncResultCallback<[DAT, Map<Parent, ROMFile[]>], Error>) => {
      const progressBar = new ProgressBar(multiBarMaxName, dat.getShortName());

      // Find all ROM files and pre-process them
      const romInputs = ROMScanner.parse(options, progressBar, dat);

      // For each DAT, find all ROM candidates
      const romCandidates = CandidateGenerator.generate(options, progressBar, dat, romInputs);

      // Filter all ROM candidates
      const romOutputs = CandidateFilter.filter(options, progressBar, romCandidates);

      // Write the output files
      const writtenRoms = ROMWriter.write(options, progressBar, dat, romOutputs);

      progressBar.setSymbol('✅');
      callback(null, [dat, writtenRoms]);
    },
    (err, results) => {
      ProgressBar.stop();

      if (err) {
        Logger.error(err);
        process.exit(1);
      }

      // Write the output report
      ReportGenerator.write(options, new Map(results as [DAT, Map<Parent, ROMFile[]>][]));
    },
  );
}
