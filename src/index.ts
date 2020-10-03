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
  const graph = directedGraph.toObject();
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

async function stratifyAction(path: string, command: Command) {
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

(function run() {
  program
    .command('analyze [path]')
    .requiredOption('--root <path>')
    .option('-o, --out-file <path>')
    .description('analyze the css dependency graph between css and html files')
    .action(analyze);

  program
    .command('stratify <path>')
    .option('-o, --out-file <path>')
    .action(stratifyAction)
    .description('stratify analyze output into graph of nodes and children');

  program.parse(process.argv);
})();
