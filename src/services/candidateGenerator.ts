import {Options} from "../types/options";
import {ROMFile} from "../types/romFile";
import {DAT, Game, Parent, Release, ROM} from "../types/dat";
import {ReleaseCandidate} from "../types/releaseCandidate";

export class CandidateGenerator {
    static generate(options: Options, dats: DAT[], inputRomFiles: ROMFile[]): Map<DAT, Map<Parent, ReleaseCandidate[]>> {
        // Index the ROMFiles by CRC
        const crcToInputRomFiles = inputRomFiles.reduce((acc: Map<string, ROMFile>, val: ROMFile) => {
            acc.set(val.getCrc(), val);
            return acc;
        }, new Map<string, ROMFile>());

        const datsToParents: Map<DAT, Map<Parent, ReleaseCandidate[]>> = new Map<DAT, Map<Parent, ReleaseCandidate[]>>();

        // For each DAT
        dats.forEach((dat: DAT) => {
            const parentsToCandidates = new Map<Parent, ReleaseCandidate[]>();

            // For each parent, try to generate a parent candidate
            dat.getParents().forEach((parent: Parent) => {
                const releaseCandidates: ReleaseCandidate[] = [];

                // For every game
                parent.getGames().flatMap((game: Game) => {

                    // For every release (ensuring at least one), find all release candidates
                    const releases = game.getReleases().length ? game.getReleases() : [null];
                    return releases.forEach((release: Release | null) => {
                        // For each Game's ROM, find the matching ROMFile
                        const romFiles: ROMFile[] = game.getRoms()
                            .map((rom: ROM) => {
                                return crcToInputRomFiles.get(rom.getCrc());
                            })
                            .filter((romFile: ROMFile | undefined) => romFile) as ROMFile[];

                        // Ignore the Game if not every ROMFile is present
                        if (romFiles.length !== game.getRoms().length) {
                            return null;
                        }

                        releaseCandidates.push(new ReleaseCandidate(game, release, game.getRoms(), romFiles));
                    });
                });

                parentsToCandidates.set(parent, releaseCandidates);
            });

            datsToParents.set(dat, parentsToCandidates);
        });

        return datsToParents;
    }
}
