import CandidateFilter from './services/candidateFilter';
import CandidateGenerator from './services/candidateGenerator';
import DATScanner from './services/datScanner';
import ROMScanner from './services/romScanner';
import Options from './types/options';

export default async function main(options: Options) {
  // Find all DAT files and parse them
  const dats = await DATScanner.parse(options);

  // Find all ROM files and pre-process them
  const romInputs = ROMScanner.parse(options, dats);

  // For each DAT, find all ROM candidates
  const romCandidates = CandidateGenerator.generate(options, dats, romInputs);

  // Filter all ROM candidates
  const romOutputs = CandidateFilter.filter(options, romCandidates);

  // TODO(cemmer): copy/move files
  console.log(romOutputs);

  // TODO(cemmer): write report
}
