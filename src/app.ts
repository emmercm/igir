import {Options} from "./types/options";
import {DATScanner} from "./scanners/datScanner";
import {ROMScanner} from "./scanners/romScanner";
import {DAT, Game, Parent} from "./types/dat";

export async function main(options: Options) {
    /**
     * - Find all DAT files (and parents)
     * - Scan all ROMs
     * - For every possible parent, grab the ROMs
     */
    const dats = await DATScanner.parse(options);
    const roms = ROMScanner.parse(options, dats);

    dats.getDats().forEach((dat: DAT) => {
        console.log(`${dat.getName()}`);

        dat.addRomFiles(roms);

        const parents = dat.getParents().filter((parent) => {
            // True if: every game has roms with no rom files
            return parent.getGames().every((game) => {
                // True if: every rom has no rom files
                return game.getRoms().every((rom) => {
                    // True if: the rom has no rom files
                    return rom.getRomFiles().length === 0;
                })
            })
        });

        const j = 0;
    });
    const i = 0;
}
