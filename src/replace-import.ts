import iconv from 'iconv-lite';
import sniffEncoding from './sniff-encoding';
import {Command} from 'commander';
import {dirname, join, relative, resolve} from 'path';
import {promisify} from 'util';
import {readFile, writeFile} from 'fs';
import {Presets, SingleBar} from 'cli-progress';

const readFileAsync = promisify(readFile);
const writeFileAsync = promisify(writeFile);

const stylesheetPathPattern = new RegExp(/<link.*href=(?:"|')(.*\.css)(?:"|')[^>]*>/,'gi');
// const cssImportPattern = new RegExp(/(?:@import )(?:url\()*(?:'|")(.*)(?:"|'|")(?:\))*/g);

export default async function (path: string, command: Command) {
  const {cssSource, cssReplacement, root} = command.opts();
  const source = join(root, cssSource);
  const replacement = join(root, cssReplacement);
  const filePaths = command.args;

  const bar = new SingleBar({}, Presets.shades_classic);
  bar.start(filePaths.length, 0);

  for (let path of filePaths) {
    const filepath = join(root, path);
    const dir = dirname(filepath);
    const relativeSource = relative(dir, source);
    const relativeReplacement = relative(dir, replacement);
    try {
      const buffer = await readFileAsync(filepath);
      const encoding = sniffEncoding(buffer);
      if (encoding == null) {
        throw new Error(`Could not detect file encoding for ${filepath}`);
      } else {
        let content = iconv.decode(buffer, encoding);
        content = content.replace(stylesheetPathPattern, (statement: string, value: string) => {
          const resolvedValue = join(root, resolve(value));
          const relativeValue = relative(dir, resolvedValue);
          if (relativeValue === relativeSource) return statement.replace(value, relativeReplacement);
          throw new Error(`value (${value}) did not equal relativeSource (${relativeSource})`);
          return statement;
        });
        const output = iconv.encode(content.replace(/\r\n/g, '\n'), encoding);
        await writeFileAsync(filepath, output);
        console.log(filepath + " DONE");
      }
    } catch (e) {
      console.error(e);
      console.log(filepath + " ERROR");
    }
    bar.increment();
  }
  bar.stop();
}
