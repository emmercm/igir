import {Options} from "../types/options";
import fg from "fast-glob";

export class OptionsParser {
    static parse(options: Options): Options {
        // Parse any glob patterns that the CLI didn't
        options.dat = fg.sync(options.dat);

        return options;
    }
}
