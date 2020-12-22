#!/usr/bin/env node

import analyzeAction from './analyze';
import compareSelectorsAction from './compare-selectors';
import dependentsAction from './dependents-action';
import replaceImportAction from './replace-import';
import selectorAction from './selectors';
import stratifyAction from './stratify';
import {program} from 'commander';

(function run() {
  program
    .command('analyze [path]')
    .requiredOption('--root <path>')
    .option('-o, --out-file <path>')
    .description('analyze the css dependency graph between css and html files and generate a dataset')
    .action(analyzeAction);

  program
    .command('dependents <path>')
    .requiredOption('--css-file <css-file>')
    .option('-r, --recursive')
    .action(dependentsAction)
    .description('list dependents of a css file given an analysis dataset');

  program
    .command('stratify <path>')
    .option('-o, --out-file <path>')
    .action(stratifyAction)
    .description('stratify analyze dataset into graph of nodes and children');

  program
    .command('selectors <path>')
    .action(selectorAction)
    .description('list the selectors of a given css file');

  program
    .command('compare-selectors [comparisons]')
    .option('--diff')
    .requiredOption('--base <path>')
    .action(compareSelectorsAction)
    .description('compare the selectors of a base and series of css files');

  program
    .command('replace-import [path]')
    .requiredOption('--root <path>')
    .requiredOption('--css-source <path>')
    .requiredOption('--css-replacement <path>')
    .action(replaceImportAction)
    .description('replaces the css import of one file with another across given html files');

  program.parse(process.argv);
})();
