import { v4 as uuidv4 } from 'uuid';

export default class DirectedGraph<T> {
  #adjacency: Map<Symbol, Set<Symbol>> = new Map();
  #data: Map<Symbol, T> = new Map();

  get size(): number {
    return this.#adjacency.size;
  }

  setVertex(keyOrValue: Symbol|T, valueOrNull: T|null = null): Symbol {
    if (!((typeof keyOrValue === "symbol" && valueOrNull !== null)
        || (typeof keyOrValue !== "symbol" && valueOrNull === null))) {
      throw new Error();
    }
    const { key, value } = (typeof keyOrValue === "symbol" && valueOrNull !== null)
      ? { key: keyOrValue as Symbol, value: valueOrNull as T }
      : { key: Symbol(), value: keyOrValue as T};
    if (!this.#adjacency.has(key)) {
      this.#adjacency.set(key, new Set());
    }
    this.#data.set(key, value);
    return key;
  }

  addVertex(value: T): Symbol {
    const key = Symbol();
    if (!this.#adjacency.has(key)) {
      this.#adjacency.set(key, new Set());
    }
    this.#data.set(key, value);
    return key;
  }

  getVertex(key: Symbol): T|undefined {
    return this.#data.get(key);
  }

  addEdge(from: Symbol, to: Symbol) {
    if (!this.#adjacency.has(from) || !this.#adjacency.has(from)) throw new Error();
    const adjacency = this.#adjacency.get(from);
    if (adjacency == null) throw new Error('inconsistency');
    if (adjacency.has(to)) return;
    adjacency.add(to);
  }

  has(key: Symbol): boolean {
    return this.#adjacency.has(key);
  }

  toArray(): {vertex: {key: Symbol, value:T}, edges: Symbol[]}[] {
    return Array.from(this.#adjacency.entries())
      .map(([vertex, edges]) => {
        return {
          vertex: {
            key: vertex,
            value: this.#data.get(vertex) as T,
          },
          edges: Array.from(edges.values())
        };
      });
  }

  reverse(): DirectedGraph<T> {
    return Array.from(this.#adjacency.entries()).reduce((graph, [from, adjacency]) => {
      if (!graph.has(from)) {
        graph.setVertex(from, (this.getVertex(from) as T));
      }
      adjacency.forEach(to => {
        if (!graph.has(to)) {
          graph.setVertex(to, (this.getVertex(to) as T));
        }
        graph.addEdge(to, from);
      });
      return graph;
    }, new DirectedGraph<T>());
  }

  vertices(): IterableIterator<[Symbol, T]> {
    return this.#data.entries();
  }

  edges(): IterableIterator<[Symbol, Set<Symbol>]> {
    return this.#adjacency.entries();
  }

  getEdges(key: Symbol): IterableIterator<Symbol> {
    return this.#adjacency.has(key)
      ? this.#adjacency.get(key)!.values()
      : [][Symbol.iterator]()
  }

  postorder(vertex: Symbol): IterableIterator<Symbol> {
    const visited: Set<Symbol> = new Set();
    const collected: Array<Symbol> = []
    this.postorder_(vertex, visited, collected);
    return collected[Symbol.iterator]();
  }

  private postorder_(vertex: Symbol, visited: Set<Symbol>, collected: Array<Symbol>) {
    visited.add(vertex);
    const neighbors = this.#adjacency.get(vertex);
    if (neighbors == null) throw new Error();

    for (let neighbor of neighbors.values()) {
      if (!visited.has(neighbor)) {
        this.postorder_(neighbor, visited, collected);
      }
    }

    collected.push(vertex);
  }

  forEach(from: Symbol, visitor: (node: T, key: Symbol)=>void) {
    const visited = new Set();
    const adjacency = this.#adjacency;
    const data = this.#data;

    function traverse(next: Symbol) {
      if (!visited.has(next)) {
        const datum = data.get(next);
        if (datum == null) throw new Error();
        visitor(datum, next);
        visited.add(next);
      }
      Array.from(adjacency.get(next) || []).forEach(to => traverse(to));
    }

    traverse(from);
  }

  transform<U>(
      mapper: (
        graph: DirectedGraph<U>,
        node: T,
        key: Symbol,
        adjacency: Symbol[],
        g: this)=>void): DirectedGraph<U> {
    return Array.from(this.#adjacency.entries()).reduce((graph, [from, adjacency]) => {
      mapper(graph, this.getVertex(from) as T, from, Array.from(adjacency.values()), this);
      return graph;
    }, new DirectedGraph<U>());
  }

  map<U>(mapper: (node: T, key: Symbol, graph: this) => U ): DirectedGraph<U> {
    return Array.from(this.#adjacency.entries()).reduce((graph, [from, adjacency]) => {
      if (!graph.has(from)) {
        graph.setVertex(from, mapper(this.getVertex(from) as T, from, this));
      }
      adjacency.forEach(to => {
        if (!graph.has(to)) {
          graph.setVertex(to, mapper(this.getVertex(to) as T, to, this));
        }
        graph.addEdge(from, to);
      });
      return graph;
    }, new DirectedGraph<U>());
  }

  toObject(): {[key:string] : {data: T, edges: string[]}} {
    const keyToId = new Map<Symbol, string>();
    return Array.from(this.#adjacency.entries()).reduce((dict, [key, edgeKeys]) => {
      const data = this.#data.get(key);
      if (data == null) throw new Error();

      if (!keyToId.has(key)) keyToId.set(key, uuidv4());
      const id = keyToId.get(key) as string;
      const edges = Array.from(edgeKeys).map(key => {
        if (!keyToId.has(key)) keyToId.set(key, uuidv4());
        return keyToId.get(key) as string;
      });

      dict[id] = {data, edges};
      return dict;
    }, {} as {[key:string] : {data: T, edges: string[]}});
  }

  toMap(): Map<Symbol, [T, Symbol[]]> {
    return Array.from(this.#adjacency.entries()).reduce((map, [vertex, edges]) => {
      const vertexData = this.#data.get(vertex);
      map.set(vertex, [vertexData, ...edges]);
      return map;
    }, new Map());
  }

}
