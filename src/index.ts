#!/usr/bin/env node

import {Presets, SingleBar} from 'cli-progress';
import * as fs from 'fs';
import {Glob} from 'glob';
import * as path from 'path';
import {program, Command} from 'commander';
import { Observable, merge } from 'rxjs';
import DirectedGraph from './digraph';

const stylesheetPathPattern = new RegExp(/<link.*href=(?:"|')(.*\.css)(?:"|')[^>]*>/,'gi');
const cssImportPattern = new RegExp(/(?:@import )(?:url\()*(?:'|")(.*)(?:"|'|")(?:\))*/g);

const glob = (pattern: string[]|string): Observable<string> => {
  const patterns = Array.isArray(pattern) ? pattern : [pattern];
  return merge(...patterns.map(pattern =>
    new Observable<string>(function(subscriber: any) {
      const g = new Glob(pattern);
      g.on('match', (file: string) => subscriber.next(file));
      g.on('error', () => subscriber.error());
      g.on('end', () => subscriber.complete());
    })
  ));
};

const subscribe = <T>(observable: Observable<T>) => (next_: (each: T, all: T[])=>void):Promise<T[]> => {
  const results: T[] = [];

  let resolve: (val: T[]) => void;
  let reject: (err: any) => void;
  const promise: Promise<T[]> = new Promise((resolve_, reject_) => {
    resolve = resolve_;
    reject = reject_;
  });

  const complete = () => resolve(results);

  const next = (result: T) => {
    results.push(result);
    next_(result, results);
  };
  observable.subscribe({next, complete});

  return promise;
}

async function analyze(pathPattern: string, command: Command) {
  const {root, outFile} = command.opts();

  const bar = new SingleBar({}, Presets.shades_classic);
  bar.start(0, 0);
  const filesObservable = glob(command.args.map(pattern => `${pattern}@(.htm|.html|.css)`));
  const files = await subscribe(filesObservable)((_, results) => bar.setTotal(results.length));
  const filesSet = new Set(files);

  const directedGraph = new DirectedGraph();
  filesSet.forEach((file: any) => {
    try {
      const fileContents = fs.readFileSync(file, {encoding: 'utf8'});
      const pattern = file.match(".htm(l)*$") != null
        ? stylesheetPathPattern
        : file.match(".css$")
          ? cssImportPattern
          : null;
      if (pattern == null) throw new Error('Unsupported file extension');
      let dependencies = [...fileContents.matchAll(pattern)]
        .flatMap((result: RegExpMatchArray) => {
           const dependency = result[1];
          const absolute = path.resolve(file, "../", dependency);
          if (!filesSet.has(absolute)) {
            filesSet.add(absolute);
            bar.setTotal(filesSet.size);
          }
          return absolute.indexOf(root) == 0 ? absolute.substr(root.length) : absolute
        });
      bar.increment();
      file = file.indexOf(root) == 0 ? file.substr(root.length) : file;
      dependencies.forEach(to => directedGraph.addEdge(file, to));
    } catch (e) {
      console.error(e);
    }
  });
  //const graph = directedGraph.toObject();
  const graph = directedGraph.toArray();
  bar.stop();

  const serialized = JSON.stringify(graph, null, 4);

  if (outFile != null) {
    fs.writeFile(outFile, serialized, (err) => {
      if (err) {
        console.log(err);
      } else {
        console.log(`Output written to ${outFile}`);
      }
    });
  } else {
    console.log(serialized);
  }
}

const globObserver = (bar: SingleBar) => {
  let count = 0;
  return {
    next: (x: string) => bar.setTotal(count++),
    error: (err: string) => console.error('Observer got an error: ' + err),
  };
};

async function hierarchyAction(path: string, command: Command) {
  const {outFile} = command.opts();
  const graphData = JSON.parse(fs.readFileSync(path).toString());
  const graph = DirectedGraph.fromObject(graphData).reverse();
  let cssFiles = [...graph.vertices].filter(vertex => vertex.endsWith('.css'));

  function dfs(graph: DirectedGraph, vertex: string):Array<any> {
    const neighbors = graph.getEdges(vertex);
    return neighbors.map(neighbor => ({
      name: neighbor,
      children: dfs(graph, neighbor),
    }));
  }

  const output = {
    name: "files",
    children: cssFiles.map(file => ({
      name: file,
      children: dfs(graph, file),
    }))
  };

  const serialized = JSON.stringify(output, null, 4);

  if (outFile != null) {
    fs.writeFile(outFile, serialized, (err) => {
      if (err) {
        console.log(err);
      } else {
        console.log(`Output written to ${outFile}`);
      }
    });
  } else {
    console.log(serialized);
  }
}

async function stratifyAction(path: string, command: Command) {
  const {outFile} = command.opts();
  const graphData = JSON.parse(fs.readFileSync(path).toString());
  const graph = DirectedGraph.fromObject(graphData);
  const inverted = graph.reverse();
  const output = inverted.toArray().map(({vertex, edges}) => {
    const type = vertex.endsWith('.css')
          ? "CSS"
          : (vertex.endsWith('.html') || vertex.endsWith('.htm'))
              ? "HTML"
              : null;
    if (type == null) throw new Error();
    const name = vertex;
    const dependants = edges;
    const imports = graph.getEdges(vertex);
    // const archiveMatch = firstMatch(name.match(/archive\/([^/]*)\//))
    // const historyMatch = firstMatch(name.match(/history\/([^/]*)\//))
    // const archive = (archiveMatch !== null)
    //   ? `archive/${archiveMatch}`
    //   : (historyMatch !== null)
    //     ? `history/${historyMatch}`
    //     : null;

    const id = uuid();
    return {dependants, id, imports, name, type};
  });

  const serialized = JSON.stringify(output, null, 4);

  if (outFile != null) {
    fs.writeFile(outFile, serialized, (err) => {
      if (err) {
        console.log(err);
      } else {
        console.log(`Output written to ${outFile}`);
      }
    });
  } else {
    console.log(serialized);
  }
}

function uuid(): string {
    var dt = new Date().getTime();
    var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c: string) {
        var r = (dt + Math.random()*16)%16 | 0;
        dt = Math.floor(dt/16);
        return (c === 'x' ? r :(r & 0x3 | 0x8)).toString(16);
    });
    return uuid;
}

function firstMatch(match: null|string[]): null|string {
  return match == null ? null : match[1];
}

function addArchive(root: any) {
  const queue: any[] = [];
  queue.push(root);
  while (queue.length > 0) {
    const parent = queue.shift();
    if (parent == null) break;

    let i = 0;
    let newArchiveNodes: {[key:string]: any[]} = {};
    while (i <= parent.children.length) {
      if (i === parent.children.length) {
        const newEntries = [...Object.entries(newArchiveNodes)];
        if (newEntries.length === 0) {
          break;
        }
        newEntries.forEach(([name, children]) => {
          // console.log(parent, {name, children});
          parent.children.push({name, children});
        });
        newArchiveNodes = {};
        continue;
      }
      const child = parent.children[i];

      const parentHistory = firstMatch(parent.name.match(/history\/([^/]*)\//));
      const childHistory = firstMatch(child.name.match(/history\/([^/]*)\//));
      const parentArchive = firstMatch(parent.name.match(/archive\/([^/]*)\//));
      const childArchive = firstMatch(child.name.match(/archive\/([^/]*)\//));
      const childIsHtml = child.name.endsWith('.htm') || child.name.endsWith('.html');

      if (childIsHtml && childHistory !== null && childHistory !== parentHistory) {
        const key = `/history/${childHistory}/`;
        if (newArchiveNodes[key] == null) {
          newArchiveNodes[key] = [];
        }
        newArchiveNodes[key].push(child);
        parent.children.splice(i, 1);
        continue;
      }

      if (childIsHtml && childArchive !== null && childArchive !== parentArchive) {
        const key = `/archive/${childArchive}/`;
        if (newArchiveNodes[key] == null) {
          newArchiveNodes[key] = [];
        }
        newArchiveNodes[key].push(child);
        parent.children.splice(i, 1);
        continue;
      }

      queue.push(child);
      i++;
    }

  }

  return root;
}

(function run() {
  program
    .command('analyze [path]')
    .requiredOption('--root <path>')
    .option('-o, --out-file <path>')
    .description('analyze the css dependency graph between css and html files')
    .action(analyze);

  program
    .command('hierarchy <path>')
    .option('-o, --out-file <path>')
    .action(hierarchyAction)
    .description('stratify analyze output into graph of nodes and children');

  program
    .command('stratify <path>')
    .option('-o, --out-file <path>')
    .action(stratifyAction)
    .description('stratify analyze output into graph of nodes and children');

  program.parse(process.argv);
})();
