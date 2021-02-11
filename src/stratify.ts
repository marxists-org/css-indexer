import * as fs from 'fs';
import DirectedGraph from './digraph';
import {Presets, SingleBar} from 'cli-progress';
import {Command} from 'commander';
import {v4 as uuidv4} from 'uuid';

type DependentsCount = {
  direct: number,
  indirect: number,
};

type MappedData = {
  dependentsCount: DependentsCount,
  name: string,
  path: string,
  type: "CSS"|"HTML"|"ROOT"|"DIRECTORY",
};

interface File {
  key: Symbol,
  value: MappedData,
}

interface Directory {
  name: string,
  path: string,
  directories: DirectoryCollection,
  files: File[]
}

interface DirectoryCollection {[key: string]: Directory};

type SerializedEntry = {
  dependentsCount: DependentsCount,
  dependents: string[],
  id: string,
  name: string,
  path: string,
  type: "CSS"|"HTML"|"ROOT"|"DIRECTORY",
};

function loadAnalyzedGraph(path: string): DirectedGraph<string> {
  const graphData = JSON.parse(fs.readFileSync(path).toString());
  const graph = new DirectedGraph<string>();
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

  return graph;
}

function mapFilepathToData(name: string, key:Symbol, graph: DirectedGraph<string>):MappedData {
  const type = name.endsWith('.css')
        ? "CSS"
        : (name.endsWith('.html') || name.endsWith('.htm'))
            ? "HTML"
            : "ROOT";
  if (type == null) throw new Error();
  const path = name;
  return {dependentsCount: {direct:0, indirect:0}, name, path, type} as MappedData;
}

function addDependencyCount(rootNodeKey: Symbol, graph: DirectedGraph<MappedData>, forEach: ()=>void) {
  Array.from(graph.postorder(rootNodeKey))
    .map(key => ({key, value: graph.getVertex(key) as MappedData}))
    .forEach(({key, value}) => {
      switch (value.type) {
        case "HTML": {
          // TODO: Remove dependentsCount from type == "HTML"
          const dependentsCount = {direct: 1, indirect: 0};
          graph.setVertex(key, {...value, dependentsCount});
          break;
        }
        case "CSS":
        case "DIRECTORY":
        case "ROOT": {
          let dependents: Array<{key: Symbol, edge: MappedData}> =
            Array.from(graph.getEdges(key))
            .map(key => ({key, edge: graph.getVertex(key) as MappedData}));

          const dependentsCount: DependentsCount = dependents.reduce((prev, {key, edge}) => {
            switch (edge.type) {
              case "HTML": {
                return {
                  indirect: prev.indirect,
                  direct: prev.direct + 1,
                };
              }
              case "CSS":
                return {
                  indirect: prev.indirect + edge.dependentsCount.indirect + edge.dependentsCount.direct,
                  direct: prev.direct,
                };
              case "DIRECTORY":
              case "ROOT": {
                return {
                  indirect: prev.indirect + edge.dependentsCount.indirect,
                  direct: prev.direct + edge.dependentsCount.direct,
                };
              }
            }
          }, {direct: 0, indirect: 0});
          graph.setVertex(key, {...value, dependentsCount});
          break;
        }
      }
      forEach();
    });
}

function serializeGraph(graph: DirectedGraph<MappedData>, keyToId = new Map<Symbol, string>()): string {
  const serializable = Array.from(graph.edges())
    .reduce((dict, [key, edgeKeys]) => {
      const data = graph.getVertex(key);
      if (data == null) throw new Error();

      // TODO: if name is "ALL_CSS" then don't give it a uuid id?
      if (!keyToId.has(key)) keyToId.set(key, uuidv4());
      const id = keyToId.get(key) as string;
      const dependents = Array.from(edgeKeys).map(key => {
        if (!keyToId.has(key)) keyToId.set(key, uuidv4());
        return keyToId.get(key) as string;
      });
      dict[id] = {...data, dependents, id};
      return dict;
    }, {} as {[key:string] : SerializedEntry});

  return JSON.stringify(serializable, null, 2);
}

export default async function(path: string, command: Command) {
  const {outFile} = command.opts();

  // 1. load the data
  const graph = loadAnalyzedGraph(path);

  // 2. add ALL_CSS node
  const allCssKey = graph.addVertex('ALL_CSS');
  Array.from(graph.vertices())
    .filter(([_, filename]) => filename.endsWith('.css'))
    .forEach(([cssFile, _]) => graph.addEdge(cssFile, allCssKey));

  const bar = new SingleBar({}, Presets.shades_classic);
  bar.start(graph.size + 1, 0);

  // 5. make a new graph with calculated properties
  const output: DirectedGraph<MappedData> = graph
    .reverse()
    .map(mapFilepathToData)
    .transform((
        graph: DirectedGraph<MappedData>,
        node: MappedData,
        parentKey: Symbol,
        edges: Symbol[],
        g:DirectedGraph<MappedData>) => {
      // 5.5 add directories
      if (graph.getVertex(parentKey) == null) {
        // FIXME: Does this ever happen lol?
        graph.setVertex(parentKey, node);
      }

      const directoriesRollup: Directory = edges
        .map(key => ({key, value: g.getVertex(key) as MappedData}))
        .reduce(fileToFilesystemReducer, {name:"", path:"", directories:{}, files:[]} as Directory);
      const dependentsCount = Array.from(Object.values(directoriesRollup.directories))
        .map(childDirectory => consume(graph, parentKey, childDirectory))
        .reduce(reduceDependentsCount, {indirect: 0, direct:0});

      bar.increment();
    });

  addDependencyCount(allCssKey, output, () => bar.increment());

  bar.stop();

  const keyToId = new Map<Symbol, string>();
  keyToId.set(allCssKey, "ALL_CSS");
  const serialized = serializeGraph(output, keyToId);

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

/**
 * Reducer for use with Array<{key:Symbol, value: MappedData}>.prototype.reduce.
 *
 * This function takes a collection of nodes and their keys in a graph and
 * returns a data structure containing a new series of intermediate nodes
 * between the root and the file based on the MappedData's name parsed as a
 * filesystem path.
 *
 * For example:
 *
 * With the input of:
 * ```
 * [
 *   {key: Symbol, value: {name: "/archive/marx/capital/ch01.html"}
 *   {key: Symbol, value: {name: "/archive/marx/manifesto.html"}
 * ]
 * ```
 *
 * the output would look like:
 *
 * ```
 * {
 *  name: "/"
 *  path: "/"
 *  files: [],
 *  directories:{
 *    archive: {
 *      name: "archive",
 *      path: "/archive",
 *      files: [],
 *      directories: {
 *        marx: {
 *          name: "marx",
 *          path: "/archive/marx",
 *          files: [{key: Symbol, name: "manifesto.html", path: "/archive/marx/manifesto.html"}
 *          directories: {
 *            capital: {
 *              name: "capital",
 *              path: "/archive/marx/capital",
 *              files: [{key: Symbol, name: "ch01.html", path: "/archive/marx/capital/ch01.html"}
 *              directories: [],
 *            }
 *          }
 *        }
 *      }
 *    }
 *  }
 * }
 * ```
 */
function fileToFilesystemReducer(
    collected: Directory,
    {key, value}: {key:Symbol, value:MappedData}): Directory {

  let directory: Directory|null = null;

  // "archive/marx/capital/ch01.html" => ["archive", "marx", "capital", "ch01.html"]
  const nameParts = value.name.substr(1).split('/');

  for (let i = 0; i < nameParts.length; i++) {
    const part = nameParts[i];
    if (directory == null) directory = collected;

    if (part.endsWith('.html') || part.endsWith('.htm') || part.endsWith('.css')) {
      directory.files.push({
        key,
        value: {
          ...value,
          name: part,
          path: "/" + nameParts.slice(0,i+1).join("/")
        }
      });
    } else {
      const tmpDir: Directory|null = directory.directories[part];
      if (tmpDir == null) {
        directory.directories[part] = {
          name: part,
          path: "/" + nameParts.slice(0,i+1).join("/"),
          directories: {},
          files: [],
        };
        directory = directory.directories[part];
      } else {
        directory = tmpDir;
      }
    }
  }

  return collected;
}

function consume(
    graph: DirectedGraph<MappedData>,
    parent: Symbol,
    directory: Directory): DependentsCount {

  const directoryData: MappedData = {
    dependentsCount: {direct: 0, indirect: 0},
    name: directory.name,
    path: directory.path,
    type: "DIRECTORY",
  };

  const directoryKey = graph.addVertex(directoryData);
  graph.addEdge(parent, directoryKey);

  directory.files.forEach(({key, value}) => {
    graph.setVertex(key, value);
    graph.addEdge(directoryKey, key);
  });

  const dependentsCount = Array.from(Object.values(directory.directories))
    .map(childDirectory => consume(graph, directoryKey, childDirectory))
    .reduce(reduceDependentsCount, {indirect: 0, direct:0});

  directoryData.dependentsCount = dependentsCount;
  graph.setVertex(directoryKey, directoryData);

  // FIXME: This doesn't handle the count correctly.
  //
  // It actually needs to reduce the directory itself, because directory could
  // have directories.
  //
  // Like, what are we doing with the above directoryData.dependentsCount?

  const count = directory.files
    .map(file => file.value)
    .reduce(reduceFileDependentsCount, {indirect: 0, direct:0});
  return count;
}

function reduceFileDependentsCount(
    prev: DependentsCount,
    next: MappedData): DependentsCount {
  if (next.type === "CSS") {
    const indirect = prev.indirect + next.dependentsCount.indirect + next.dependentsCount.direct;
    const direct = prev.direct;
    return {indirect, direct};
  } else {
    const indirect = prev.indirect + next.dependentsCount.indirect;
    const direct = prev.direct + next.dependentsCount.direct;
    return {indirect, direct};
  }
}

function reduceDependentsCount(
    prev: DependentsCount,
    next: DependentsCount): DependentsCount {
  const indirect = prev.indirect + next.indirect;
  const direct = prev.direct + next.direct;
  return {indirect, direct};
}

