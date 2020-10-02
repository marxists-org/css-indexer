# css-indexer

Usage: css-indexer [options] [command]

Options:
  -h, --help                 display help for command

Commands:
  analyze [options] <path>   analyze the css dependency graph between css and html files
  stratify [options] <path>  stratify analyze output into graph of nodes and children
  help [command]             display help for command

```
git clone https://github.com/marxists-org/css-indexer.git
cd css-indexer
npm install
npm link
npx css-indexer analyze --root /Volumes/marxists.org --out-file ~/experiment.json "/Volumes/marxists.org/archive/foster/**/*"
```
