import { Command } from 'commander';
const program = new Command();

import figlet from 'figlet';
import {DATParser} from "./parsers/dat";
import {OptionsParser} from "./parsers/options";

console.log(figlet.textSync('IGIR', {
    font: 'Big Money-se'
}));

program
    .name('igir')
    .option('-d, --dat <files...>')
    .action((cmdOptions) => {
        const options = OptionsParser.parse(cmdOptions);
        DATParser.parse(options);
    })
    .parse(process.argv);
