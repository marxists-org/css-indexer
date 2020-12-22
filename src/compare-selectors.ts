import * as fs from 'fs';
import * as cssparser from 'cssparser/lib/cssparser';
import {Command} from 'commander';

function sourceToSelectors(source:string): string[] {
  const parser = new cssparser.Parser();
  const ast = parser.parse(source);
  return ast.toJSON('simple').value
    .filter((v: {type: string}) => v.type === 'rule')
    .flatMap((v: {selectors: string[]}) => v.selectors)
    .map((selector:string) => {
      let sanitized = selector;
      const match = selector[0].match(/^[a-zA-Z]+(?![a-zA-Z])/);
      if (match !== null) {
        const tagName = match[0].toLowerCase();
        const rest = selector.split("").splice(tagName.length).join("");
        sanitized = tagName + rest;
      }
      return sanitized;
    })
    .sort();
}

function compare(a: string[], b: string[]): number {
  const set = new Set(a);
  return b.reduce((count, next) => {
    return set.has(next) ? count + 1 : count;
  }, 0);
}

function delta(a: string[], b: string[]): string[] {
  const set = new Set(a);
  return b.filter(selector => !set.has(selector));
}

type RenderProps = {
  contains: number|null,
  missing: string[],
  total: number|null,
  percent: number|null,
  error: Error|null,
  path: string,
}

export default async function (_: string, command: Command) {
  const {base, diff} = command.opts();
  const baseSelectors =
      sourceToSelectors(fs.readFileSync(base).toString());
  const comparison = command.args
    .map(path => ({path, source: fs.readFileSync(path).toString()}))
    .map(({path, source}) => {
      let selectors, error = null;
      try {
        selectors = sourceToSelectors(source);
      } catch (e) {
        error = e;
      }
      return {selectors, error, path};
    })
    .map(({selectors, path, error}): RenderProps => {
      let contains, total, percent = null;
      let missing: string[] = [];
      if (error == null && selectors !== null) {
        contains = compare(baseSelectors, selectors!);
        missing = delta(baseSelectors, selectors!);
        total = selectors!.length;
        percent = ((contains / total) * 100).toFixed(2);
      }
      return {missing, contains, total, percent, error, path} as RenderProps;
    })
    .sort((a: RenderProps, b: RenderProps) => {
      if ((a.percent || 0) > (b.percent || 0)) return -1;
      if ((a.percent || 0) < (b.percent || 0)) return 1;
      if ((a.total || 0) > (b.total || 0)) return -1;
      if ((a.total || 0) < (b.total || 0)) return 1;
      return 0;
    })
    .map(({missing, contains, total, percent, error, path}) => {
      if (error != null) {
        return `ERROR ${path}`;
      }
      let description = `${percent}% (${contains}/${total}) ${path}`;
      if (diff) {
        description += "\n";
        missing.forEach(selector => description += (selector + "\n"));
      }
      return description;
    });
    console.log("          (" + baseSelectors.length + ") " + base);
    comparison.forEach(description => console.log(description));
}
