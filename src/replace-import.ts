import iconv from 'iconv-lite';
import sniffEncoding from './sniff-encoding';
import {Command} from 'commander';
import {dirname, join, relative, resolve} from 'path';
import {promisify} from 'util';
import {readFile, writeFile} from 'fs';
import {Presets, SingleBar} from 'cli-progress';

const readFileAsync = promisify(readFile);
const writeFileAsync = promisify(writeFile);

const stylesheetPathPattern = new RegExp(/<link(?:.|\n)+?(?=href)href=(?:.|\n)*?(?:"|')(.*\.css)(?:"|')[^>]*>/,'gi');
const cssImportPattern = new RegExp(/(?:@import )(?:url\()*(?:'|")(.*)(?:"|'|")(?:\))*/g);

export default async function (path: string, command: Command) {
  const {cssSource, cssReplacement, root} = command.opts();
  const source = join(root, cssSource);
  const replacement = join(root, cssReplacement);
  const filePaths = command.args;

  // const bar = new SingleBar({}, Presets.shades_classic);
  // bar.start(filePaths.length, 0);

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
        const pattern = filepath.match(".htm(l)*$") != null
          ? stylesheetPathPattern
          : filepath.match(".css$")
            ? cssImportPattern
            : null;
        if (pattern == null) throw new Error('file did not match html nor css pattern');
        content = content.replace(pattern, (statement: string, foundSource: string) => {
          const resolvedFoundSource = resolve(dir, foundSource);
          const processedFoundSource = join(root, resolvedFoundSource);
          const relativeFoundSource = relative(dir, resolvedFoundSource);
          if (relativeFoundSource === relativeSource) return statement.replace(foundSource, relativeReplacement);
          throw new Error(`relativeFoundSource (${resolvedFoundSource}) did not equal relativeSource (${relativeFoundSource})`);
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
    // bar.increment();
  }
  // bar.stop();
}
