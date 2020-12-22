# css-indexer

```
Usage: css-indexer [options] [command]

Options:
  -h, --help                                 display help for command

Commands:
  analyze [options] [path]                   analyze the css dependency graph between css and html files and generate a dataset
  dependents [options] <path>                list dependents of a css file given an analysis dataset
  stratify [options] <path>                  stratify analyze dataset into graph of nodes and children
  selectors <path>                           list the selectors of a given css file
  compare-selectors [options] [comparisons]  compare the selectors of a base and series of css files
  replace-import [options] [path]            replaces the css import of one file with another across given html files
  help [command]                             display help for command
```

```
git clone https://github.com/marxists-org/css-indexer.git
cd css-indexer
npm install
npm link
npx css-indexer analyze --root /Volumes/marxists.org --out-file ~/experiment.json "/Volumes/marxists.org/archive/foster/**/*"
```
