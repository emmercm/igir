import { Command } from 'commander';
const program = new Command();

import figlet from 'figlet';
import {Options} from "./src/types/options";
import {main} from "./src/app";
import yargs from 'yargs';

console.log(figlet.textSync('IGIR', {
    font: 'Big Money-se'
}));

const argv = yargs
    .group(['dat', 'input'], 'Input and output options')
    .option('d', {
        alias: 'dat',
        description: 'Path(s) to DAT files',
        demandOption: true,
        type: 'array'
    })
    .option('i', {
        alias: 'input',
        description: 'Path(s) to ROM files',
        demandOption: true,
        type: 'array'
    })
    .version(false)
    .help(true)
    .argv;
const options = Options.fromObject(argv);
main(options).then(() => {
    process.exit(0);
});


// program
//     .name('igir')
//
//     .option('-d, --dat <files...>')
//     .option('-i, --input <paths...>')
//
//     .option('--no-bios')
//
//     .action((cmdOptions: Object) => {
//         const options = Options.fromObject(cmdOptions);
//         main(options);
//     })
//     .parse(process.argv);
