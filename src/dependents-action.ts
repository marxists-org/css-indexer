import DirectedGraph from './digraph';
import {Command} from 'commander';
import {readFileSync} from 'fs';

function loadAnalyzedGraph(path: string): [Map<string,Symbol>, DirectedGraph<string>] {
  const graphData = JSON.parse(readFileSync(path).toString());
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

  return [nameToKey, graph];
}

export default async function (path: string, command: Command) {
  const {cssFile, recursive} = command.opts();
  let [map, graph] = loadAnalyzedGraph(path);
  graph = graph.reverse();
  const key = map.get(cssFile)!;
  // [...graph.getEdges(key)]
  //   .map(edge => graph.getVertex(edge))
  //   .forEach(value => console.log(value));

  const collected = [];
  const queue = [key];
  while (queue.length > 0) {
    let current = queue.shift()!;
    for (let edgeKey of graph.getEdges(current)) {
      const edgeValue = graph.getVertex(edgeKey)!;
      if (edgeValue.endsWith('.css')) {
        if (recursive === true) queue.push(edgeKey);
      } else {
        collected.push(edgeValue);
      }
    }
  }
  collected.forEach(file => console.log(file));
}
