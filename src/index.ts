#!/usr/bin/env node

import {Presets, SingleBar} from 'cli-progress';
import * as fs from 'fs';
import {Glob} from 'glob';
import * as path from 'path';
import {program, Command} from 'commander';
import { Observable, merge } from 'rxjs';
import DirectedGraph from './digraph';
import DirectedGraph2 from './digraphtwo';
import { v4 as uuidv4 } from 'uuid';

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

  const nameToGraphKey = new Map<string, Symbol>();
  // const directedGraph = new DirectedGraph();
  const directedGraph = new DirectedGraph2<string>();
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
      // dependencies.forEach(to => directedGraph.addEdge(file, to));

      if (!nameToGraphKey.has(file)) {
        const key = directedGraph.addVertex(file)
        nameToGraphKey.set(file, key);
      }
      const fileKey = nameToGraphKey.get(file) as Symbol;

      dependencies.forEach(dependency => {
        if (!nameToGraphKey.has(dependency)) {
          const key = directedGraph.addVertex(dependency);
          nameToGraphKey.set(dependency, key);
        }
        const dependencyKey = nameToGraphKey.get(dependency) as Symbol;
        directedGraph.addEdge(fileKey, dependencyKey)
      });
    } catch (e) {
      console.error(e);
    }
  });

  const keyToName = new Map(
    Array.from(nameToGraphKey.entries())
      .map(([from, to]) => ([to, from])));

  const graph = directedGraph.toArray().map(({vertex, edges}) => {
    return [keyToName.get(vertex.key), edges.map(key => keyToName.get(key))];
  });

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
  // 1. load the data
  const graphData = JSON.parse(fs.readFileSync(path).toString());
  const graph = new DirectedGraph2<string>();
  const nameToKey = new Map<string, Symbol>();
  for (let [vertex,  edges] of graphData) {
    if (!nameToKey.has(vertex)) nameToKey.set(vertex, Symbol());
    let key = nameToKey.get(vertex) as Symbol;

    if (!graph.has(key)) graph.setVertex(key, vertex);
    (edges as string[]).forEach(edge => {
      if (!nameToKey.has(edge)) nameToKey.set(edge, Symbol());
      let edgeKey = nameToKey.get(edge) as Symbol;
      if (!graph.has(edgeKey)) graph.setVertex(edgeKey, edge);
      graph.addEdge(key, edgeKey);
    });
  }

  // 2. invert the graph
  const inverted = graph.reverse();

  // 3. add ALL_CSS node
  const allCssKey = inverted.addVertex('ALL_CSS');
  Array.from(inverted.vertices())
    .filter(([_, filename]) => filename.endsWith('.css'))
    .forEach(([cssFile, _]) => inverted.addEdge(allCssKey, cssFile));

  // 4. postorder reduce build nameToDepsCount map
  const keyToDepsCount = Array.from(inverted.postorder(allCssKey))
    .reduce((map, key) => {
      const value = inverted.getVertex(key);
      if (value == null) throw new Error();

      if (value.endsWith('.htm') || value.endsWith('.html')) {
        map.set(key, 1);
        return map;
      }

      let dependents = Array.from(inverted.getEdges(key));
      let count = dependents.reduce((prev, key) => prev + (map.get(key) || 0), 0)
        + dependents.length;
      map.set(key, count);

      return map;
    }, new Map<Symbol, number>());

  // 5. make a new graph with calculated properties
  type DependentsCount = {
      direct: number,
      indrect: number,
      total: number,
  };
  type MappedData = {
    dependentsCount: DependentsCount,
    imports: Symbol[],
    name: string,
    type: "CSS"|"HTML"|"ROOT"|"ARCHIVE",
  };
  const output: DirectedGraph2<MappedData> = inverted.map((name, key) => {
    const type = name.endsWith('.css')
          ? "CSS"
          : (name.endsWith('.html') || name.endsWith('.htm'))
              ? "HTML"
              : "ROOT";
    if (type == null) throw new Error();
    const dependents = Array.from(inverted.getEdges(key));
    const dependentsCount = {
      total: keyToDepsCount.get(key) || 0,
      direct: dependents.length,
      indrect: (keyToDepsCount.get(key) || 0) - dependents.length,
    };
    const imports = Array.from(graph.getEdges(key));
    return {imports, dependentsCount, name, type};
  });

  type SerializedEntry = {
    dependentsCount: DependentsCount,
    dependents: string[],
    id: string,
    imports: string[],
    name: string,
    type: "CSS"|"HTML"|"ROOT"|"ARCHIVE",
  };
  const keyToId = new Map<Symbol, string>();
  const serializable = Array.from(output.edges())
    .reduce((dict, [key, edgeKeys]) => {
      const data = output.getVertex(key);
      if (data == null) throw new Error('line 274');

      if (!keyToId.has(key)) keyToId.set(key, uuidv4());
      const id = keyToId.get(key) as string;
      const dependents = Array.from(edgeKeys).map(key => {
        if (!keyToId.has(key)) keyToId.set(key, uuidv4());
        return keyToId.get(key) as string;
      });
      const imports = data.imports.map(key => {
        if (!keyToId.has(key)) keyToId.set(key, uuidv4());
        return keyToId.get(key) as string;
      });

      dict[id] = {...data, dependents, id, imports};
      return dict;
    }, {} as {[key:string] : SerializedEntry});

  // 6. serialize
  // const serialized = JSON.stringify(output.toObject(), null, 4);
  const serialized = JSON.stringify(serializable, null, 4);

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
    .command('stratify <path>')
    .option('-o, --out-file <path>')
    .action(stratifyAction)
    .description('stratify analyze output into graph of nodes and children');

  program.parse(process.argv);
})();
