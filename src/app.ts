import {Options} from "./types/options";
import {DATScanner} from "./services/datScanner";
import {ROMScanner} from "./services/romScanner";
import {DAT, Game, Parent} from "./types/dat";
import {ROMFile} from "./types/romFile";
import {CandidateFilter} from "./services/candidateFilter";
import {CandidateGenerator} from "./services/candidateGenerator";
import {ReleaseCandidate} from "./types/releaseCandidate";

export async function main(options: Options) {
    // Find all DAT files and parse them
    const dats: DAT[] = await DATScanner.parse(options);

    // Find all ROM files and pre-process them
    const romInputs: ROMFile[] = ROMScanner.parse(options, dats);

    // For each DAT, find all ROM candidates
    const romCandidates: Map<DAT, Map<Parent, ReleaseCandidate[]>> = CandidateGenerator.generate(options, dats, romInputs);

    // Filter all ROM candidates
    const romOutputs: Map<DAT, Map<Parent, ROMFile[]>> = CandidateFilter.filter(options, romCandidates);

    // TODO(cemmer): copy/move files

    // TODO(cemmer): write report
}
