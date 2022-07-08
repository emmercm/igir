import {Options} from "../types/options";
import {DAT, Parent} from "../types/dat";
import {ROMFile} from "../types/romFile";
import path from "path";
import {ReleaseCandidate} from "../types/releaseCandidate";

export class CandidateFilter {
    static filter(options: Options, candidates: Map<DAT, Map<Parent, ReleaseCandidate[]>>): Map<DAT, Map<Parent, ROMFile[]>> {
        const output = new Map<DAT, Map<Parent, ROMFile[]>>;

        candidates.forEach((parentToCandidates: Map<Parent, ReleaseCandidate[]>, dat: DAT) => {
            const datName = dat.getName()
                .replace(' (Parent-Clone)', '');
            const outputDir = path.join(options.getOutput(), datName);

            // Pre-filter
            // Sort
            // Post-filter?
        });

        return output;
    }
}
