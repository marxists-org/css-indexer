export default class DirectedGraph {
  #adjacency: Map<string, Set<string>> = new Map();

  static fromObject(dictionary: {[key:string]: string[]}): DirectedGraph {
    const graph = new DirectedGraph();
    Object.entries(dictionary).forEach(entry => {
      const vertex: string = entry[0];
      const neighbors: string[] = entry[1];
      graph.addVertex(vertex);
      neighbors.forEach(neighbor => graph.addEdge(vertex, neighbor));
    });
    return graph;
  }

  static fromArray(list: {vertex: string, edges: string[]}[]): DirectedGraph {
    const graph = new DirectedGraph();
    list.forEach(node => {
      graph.addVertex(node.vertex);
      node.edges.forEach(neighbor => graph.addEdge(node.vertex, neighbor));
    });
    return graph;
  }

  get vertices(): IterableIterator<string> {
    return this.#adjacency.keys();
  }

  getEdges(vertex: string): Array<string> {
    let setOrUndefined = this.#adjacency.get(vertex);
    return setOrUndefined == null
      ? []
      : [...setOrUndefined.values()];
  }

  addVertex(name: string) {
    if (this.#adjacency.has(name)) return;
    this.#adjacency.set(name, new Set());
  }

  addEdge(from: string, to: string) {
    this.addVertex(from);
    this.addVertex(to);
    const adjacency = this.#adjacency.get(from);
    if (adjacency == null) throw new Error('inconsistency');
    if (adjacency.has(to)) return;
    adjacency.add(to);
  }

  reverse(): DirectedGraph {
    return Array.from(this.#adjacency.entries()).reduce((graph, [from, adjacency]) => {
      adjacency.forEach(to => {
        graph.addEdge(to, from);
      });
      return graph;
    }, new DirectedGraph());
  }

  // walk(vertex: string, visiter: (vertex: string) => void) {
  //   this.dfs(vertex, new Set(), visiter);
  // }

  // forEach(visiter: (vertex: string) => void) {
  //   const vertices = Array.from(this.#adjacency.keys());
  //   const visited: Set<string> = new Set();
  //   vertices.forEach(vertex => this.dfs(vertex, visited, visiter));
  // }

  private dfs(vertex: string, visited: Set<string>, visitor: (vertex: string) => void) {
    if (visited.has(vertex)) return
    visited.add(vertex);
    visitor(vertex);
    const neighbors = this.#adjacency.get(vertex);
    if (neighbors == null) throw new Error();
    Array.from(neighbors.values()).forEach(neighbor => this.dfs(neighbor, visited, visitor));
  }


  topological(vertex: string, cb:(vertex: string)=>void) {
    this.reverse().postorder(vertex, cb);
  }

  postorder(vertex: string, cb:(vertex: string)=>void) {
    const visited: Set<string> = new Set();
    this.postorder_(vertex, visited, cb);
  }

  private postorder_(vertex: string, visited: Set<string>, cb:(vertex:string)=>void) {
    visited.add(vertex);
    const neighbors = this.#adjacency.get(vertex);
    if (neighbors == null) throw new Error();
    Array.from(neighbors.values()).forEach(neighbor => {
      if (!visited.has(neighbor)) {
        this.postorder_(neighbor, visited, cb);
      }
    });
    cb(vertex);
  }

  toObject(): {[key:string]: string[]} {
    return Array.from(this.#adjacency.entries()).reduce((dictionary, [vertex, neighbors]) => {
      dictionary[vertex] = Array.from(neighbors.values());
      return dictionary; 
    }, {} as {[key:string]: string[]});
  }

  toArray(): {vertex: string, edges: string[]}[] {
    return Array.from(this.#adjacency.entries())
      .map(([vertex, edges]) => ({vertex, edges: Array.from(edges.values())}));
  }
}

// const g = new DirectedGraph();
// g.addEdge("file.html", "works-red.css");
// g.addEdge("works-red.css", "works.css");
// g.addEdge("print.css", "works.css");
// g.addEdge("file.html", "print.css");
// g.addEdge("file2.html", "works.css");
// g.addEdge("file3.html", "print.css");

//             file.html
//             /       \
//    works-red.css    print.css <-- file3.html
//            \         /
//             works.css  <-- file2.html
// console.log('---dfs (file.html)---');
// console.log(Array.from(g.topological('file.html')));
// console.log(Array.from(g.reverse().topological('works.css')));

// const example = new DirectedGraph();
// example.addVertex('a')
// example.addVertex('b')
// example.addVertex('c')
// example.addVertex('e')
// example.addVertex('t')
// example.addEdge('a', 't');
// example.addEdge('a', 'b');
// example.addEdge('a', 'c');
// example.addEdge('t', 'b');
// example.addEdge('c', 'b');
// example.addEdge('c', 'e');
// example.addEdge('e', 'd');
// example.addEdge('b', 'e');

// console.log('dfs');
// example.forEach(console.log);
// console.log('postoder');
// console.log(Array.from(example.postorder('a')));
//
// console.log('reversed graph postoder');
// console.log(Array.from(example.reverse().postorder('e')));


