import * as fs from 'fs';
import * as cssparser from 'cssparser/lib/cssparser';
import {Command} from 'commander';

export default async function (path: string, command: Command) {
  const source = fs.readFileSync(path).toString()
  const parser = new cssparser.Parser();
  const ast = parser.parse(source);
  const selectors = ast.toJSON('simple').value
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
    .sort()
    .forEach((selector:string) => console.log(selector));
}
