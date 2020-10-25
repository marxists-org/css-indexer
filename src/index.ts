#!/usr/bin/env node

import {program} from 'commander';
import stratifyAction from "./stratify";
import analyzeAction from "./analyze";

(function run() {
  program
    .command('analyze [path]')
    .requiredOption('--root <path>')
    .option('-o, --out-file <path>')
    .description('analyze the css dependency graph between css and html files')
    .action(analyzeAction);

  program
    .command('stratify <path>')
    .option('-o, --out-file <path>')
    .action(stratifyAction)
    .description('stratify analyze output into graph of nodes and children');

  program.parse(process.argv);
})();
