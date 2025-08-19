import { TagEngine, TagStats } from './tag-engine.js';
import { BacklinkEngine, LinkStats } from './backlink-engine.js';
import { IndexedFile } from '../core/indexer.js';
import pino from 'pino';

export interface GraphNode {
  id: string;
  type: 'file' | 'tag';
  label: string;
  metadata: Record<string, any>;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: 'link' | 'tag' | 'similarity';
  weight: number;
  metadata: Record<string, any>;
}

export interface GraphStructure {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: {
    nodeCount: number;
    edgeCount: number;
    density: number;
    components: number;
  };
}

export interface ClusterResult {
  clusters: Array<{
    id: string;
    nodes: string[];
    cohesion: number;
    tags: string[];
  }>;
  modularity: number;
}

export interface CentralityMetrics {
  degree: Map<string, number>;
  betweenness: Map<string, number>;
  closeness: Map<string, number>;
  eigenvector: Map<string, number>;
  pagerank: Map<string, number>;
}

export interface PathAnalysis {
  shortestPaths: Map<string, Map<string, string[]>>;
  diameter: number;
  averagePathLength: number;
  reachability: Map<string, string[]>;
}

export interface GraphMetrics {
  centrality: CentralityMetrics;
  clustering: ClusterResult;
  paths: PathAnalysis;
  connectivity: {
    components: Array<string[]>;
    bridges: Array<[string, string]>;
    articulation: string[];
  };
}

export class GraphAnalyzerError extends Error {
  constructor(
    message: string,
    public readonly operation: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'GraphAnalyzerError';
  }
}

export class GraphAnalyzer {
  private logger = pino({ name: 'GraphAnalyzer' });

  constructor(
    private tagEngine: TagEngine,
    private backlinkEngine: BacklinkEngine
  ) {}

  buildGraph(files: IndexedFile[], includeTagNodes: boolean = true): GraphStructure {
    try {
      this.logger.debug({ fileCount: files.length, includeTagNodes }, 'Building graph structure');

      const nodes: GraphNode[] = [];
      const edges: GraphEdge[] = [];
      const nodeSet = new Set<string>();

      for (const file of files) {
        const fileNodeId = `file:${file.relativePath}`;
        
        if (!nodeSet.has(fileNodeId)) {
          nodes.push({
            id: fileNodeId,
            type: 'file',
            label: file.frontmatter.title || file.relativePath,
            metadata: {
              path: file.relativePath,
              size: file.size,
              lastModified: file.lastModified,
              tags: file.tags,
              linkCount: file.links.length,
            },
          });
          nodeSet.add(fileNodeId);
        }

        for (const link of file.links) {
          const targetNodeId = `file:${link.target}`;
          
          if (!nodeSet.has(targetNodeId)) {
            nodes.push({
              id: targetNodeId,
              type: 'file',
              label: link.target,
              metadata: { path: link.target },
            });
            nodeSet.add(targetNodeId);
          }

          edges.push({
            source: fileNodeId,
            target: targetNodeId,
            type: 'link',
            weight: 1,
            metadata: {
              text: link.text,
              linkType: link.type,
            },
          });
        }

        if (includeTagNodes) {
          for (const tag of file.tags) {
            const tagNodeId = `tag:${tag}`;
            
            if (!nodeSet.has(tagNodeId)) {
              const tagStats = this.tagEngine.getTagStats(tag);
              nodes.push({
                id: tagNodeId,
                type: 'tag',
                label: tag,
                metadata: {
                  fileCount: tagStats?.fileCount || 0,
                  hierarchy: tagStats?.hierarchy || [],
                },
              });
              nodeSet.add(tagNodeId);
            }

            edges.push({
              source: fileNodeId,
              target: tagNodeId,
              type: 'tag',
              weight: 1,
              metadata: { tag },
            });
          }
        }
      }

      const stats = this.calculateGraphStats(nodes, edges);

      this.logger.debug({
        nodes: nodes.length,
        edges: edges.length,
        density: stats.density,
      }, 'Graph structure built');

      return { nodes, edges, stats };

    } catch (error) {
      throw new GraphAnalyzerError(
        `Failed to build graph: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'buildGraph',
        error instanceof Error ? error : undefined
      );
    }
  }

  analyzeGraph(files: IndexedFile[]): GraphMetrics {
    try {
      this.logger.info('Starting comprehensive graph analysis');

      const graph = this.buildGraph(files, false);
      const adjacency = this.buildAdjacencyMatrix(graph);

      const centrality = this.calculateCentralityMetrics(graph, adjacency);
      const clustering = this.detectClusters(graph, adjacency);
      const paths = this.analyzePathStructure(graph, adjacency);
      const connectivity = this.analyzeConnectivity(graph, adjacency);

      this.logger.info('Graph analysis completed');

      return { centrality, clustering, paths, connectivity };

    } catch (error) {
      throw new GraphAnalyzerError(
        `Graph analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'analyzeGraph',
        error instanceof Error ? error : undefined
      );
    }
  }

  findRelatedFiles(filePath: string, maxHops: number = 2, minSimilarity: number = 0.1): string[] {
    try {
      const related = this.backlinkEngine.findRelatedFiles(filePath, maxHops);
      
      return Array.from(related.entries())
        .filter(([_, distance]) => distance <= maxHops)
        .sort((a, b) => a[1] - b[1])
        .map(([file, _]) => file);

    } catch (error) {
      throw new GraphAnalyzerError(
        `Failed to find related files: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'findRelatedFiles',
        error instanceof Error ? error : undefined
      );
    }
  }

  findCommunities(files: IndexedFile[], resolution: number = 1.0): ClusterResult {
    try {
      const graph = this.buildGraph(files, false);
      const adjacency = this.buildAdjacencyMatrix(graph);
      
      return this.detectClusters(graph, adjacency, resolution);

    } catch (error) {
      throw new GraphAnalyzerError(
        `Community detection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'findCommunities',
        error instanceof Error ? error : undefined
      );
    }
  }

  getInfluentialFiles(files: IndexedFile[], metric: 'pagerank' | 'betweenness' | 'degree' = 'pagerank', limit: number = 10): Array<{ file: string; score: number }> {
    try {
      const graph = this.buildGraph(files, false);
      const adjacency = this.buildAdjacencyMatrix(graph);
      const centrality = this.calculateCentralityMetrics(graph, adjacency);

      let scores: Map<string, number>;
      switch (metric) {
        case 'pagerank':
          scores = centrality.pagerank;
          break;
        case 'betweenness':
          scores = centrality.betweenness;
          break;
        case 'degree':
          scores = centrality.degree;
          break;
      }

      return Array.from(scores.entries())
        .filter(([id, _]) => id.startsWith('file:'))
        .map(([id, score]) => ({ file: id.substring(5), score }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

    } catch (error) {
      throw new GraphAnalyzerError(
        `Failed to get influential files: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'getInfluentialFiles',
        error instanceof Error ? error : undefined
      );
    }
  }

  exportGraph(files: IndexedFile[], format: 'json' | 'gexf' | 'dot' = 'json'): string {
    try {
      const graph = this.buildGraph(files, true);

      switch (format) {
        case 'json':
          return JSON.stringify(graph, null, 2);
        case 'gexf':
          return this.exportGEXF(graph);
        case 'dot':
          return this.exportDOT(graph);
        default:
          throw new Error(`Unsupported export format: ${format}`);
      }

    } catch (error) {
      throw new GraphAnalyzerError(
        `Graph export failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'exportGraph',
        error instanceof Error ? error : undefined
      );
    }
  }

  private calculateGraphStats(nodes: GraphNode[], edges: GraphEdge[]): GraphStructure['stats'] {
    const nodeCount = nodes.length;
    const edgeCount = edges.length;
    const maxEdges = nodeCount * (nodeCount - 1) / 2;
    const density = maxEdges > 0 ? edgeCount / maxEdges : 0;

    const adjacency = new Map<string, Set<string>>();
    for (const edge of edges) {
      if (!adjacency.has(edge.source)) {
        adjacency.set(edge.source, new Set());
      }
      adjacency.get(edge.source)!.add(edge.target);
    }

    const components = this.findConnectedComponents(nodes, adjacency);

    return { nodeCount, edgeCount, density, components: components.length };
  }

  private buildAdjacencyMatrix(graph: GraphStructure): Map<string, Map<string, number>> {
    const adjacency = new Map<string, Map<string, number>>();

    for (const node of graph.nodes) {
      adjacency.set(node.id, new Map());
    }

    for (const edge of graph.edges) {
      if (!adjacency.has(edge.source)) {
        adjacency.set(edge.source, new Map());
      }
      if (!adjacency.has(edge.target)) {
        adjacency.set(edge.target, new Map());
      }

      adjacency.get(edge.source)!.set(edge.target, edge.weight);
      adjacency.get(edge.target)!.set(edge.source, edge.weight);
    }

    return adjacency;
  }

  private calculateCentralityMetrics(graph: GraphStructure, adjacency: Map<string, Map<string, number>>): CentralityMetrics {
    const degree = this.calculateDegreeCentrality(adjacency);
    const betweenness = this.calculateBetweennessCentrality(graph, adjacency);
    const closeness = this.calculateClosenessCentrality(graph, adjacency);
    const eigenvector = this.calculateEigenvectorCentrality(graph, adjacency);
    const pagerank = this.backlinkEngine.calculatePageRank();

    return { degree, betweenness, closeness, eigenvector, pagerank };
  }

  private calculateDegreeCentrality(adjacency: Map<string, Map<string, number>>): Map<string, number> {
    const degree = new Map<string, number>();

    for (const [node, neighbors] of adjacency) {
      degree.set(node, neighbors.size);
    }

    return degree;
  }

  private calculateBetweennessCentrality(graph: GraphStructure, adjacency: Map<string, Map<string, number>>): Map<string, number> {
    const betweenness = new Map<string, number>();
    const nodes = graph.nodes.map(n => n.id);

    for (const node of nodes) {
      betweenness.set(node, 0);
    }

    for (const source of nodes) {
      const stack: string[] = [];
      const paths = new Map<string, string[]>();
      const distance = new Map<string, number>();
      const dependency = new Map<string, number>();

      for (const node of nodes) {
        paths.set(node, []);
        distance.set(node, -1);
        dependency.set(node, 0);
      }

      distance.set(source, 0);
      const queue = [source];

      while (queue.length > 0) {
        const current = queue.shift()!;
        stack.push(current);

        const neighbors = adjacency.get(current) || new Map();
        for (const neighbor of neighbors.keys()) {
          if (distance.get(neighbor) === -1) {
            queue.push(neighbor);
            distance.set(neighbor, distance.get(current)! + 1);
          }

          if (distance.get(neighbor) === distance.get(current)! + 1) {
            paths.get(neighbor)!.push(current);
          }
        }
      }

      while (stack.length > 0) {
        const current = stack.pop()!;
        for (const predecessor of paths.get(current)!) {
          const dep = dependency.get(predecessor)! + (1 + dependency.get(current)!);
          dependency.set(predecessor, dep);
        }

        if (current !== source) {
          betweenness.set(current, betweenness.get(current)! + dependency.get(current)!);
        }
      }
    }

    const n = nodes.length;
    const norm = n > 2 ? 2 / ((n - 1) * (n - 2)) : 1;
    for (const [node, value] of betweenness) {
      betweenness.set(node, value * norm);
    }

    return betweenness;
  }

  private calculateClosenessCentrality(graph: GraphStructure, adjacency: Map<string, Map<string, number>>): Map<string, number> {
    const closeness = new Map<string, number>();
    const nodes = graph.nodes.map(n => n.id);

    for (const source of nodes) {
      const distances = this.dijkstra(adjacency, source);
      let totalDistance = 0;
      let reachableNodes = 0;

      for (const [target, distance] of distances) {
        if (distance < Infinity && target !== source) {
          totalDistance += distance;
          reachableNodes++;
        }
      }

      const centrality = reachableNodes > 0 ? reachableNodes / totalDistance : 0;
      closeness.set(source, centrality);
    }

    return closeness;
  }

  private calculateEigenvectorCentrality(graph: GraphStructure, adjacency: Map<string, Map<string, number>>): Map<string, number> {
    const nodes = graph.nodes.map(n => n.id);
    const n = nodes.length;
    
    if (n === 0) {
      return new Map();
    }

    let centrality = new Map<string, number>();
    for (const node of nodes) {
      centrality.set(node, 1.0 / Math.sqrt(n));
    }

    for (let iteration = 0; iteration < 100; iteration++) {
      const newCentrality = new Map<string, number>();
      
      for (const node of nodes) {
        newCentrality.set(node, 0);
      }

      for (const node of nodes) {
        const neighbors = adjacency.get(node) || new Map();
        for (const neighbor of neighbors.keys()) {
          const current = newCentrality.get(neighbor) || 0;
          newCentrality.set(neighbor, current + centrality.get(node)!);
        }
      }

      let norm = 0;
      for (const value of newCentrality.values()) {
        norm += value * value;
      }
      norm = Math.sqrt(norm);

      if (norm === 0) break;

      for (const [node, value] of newCentrality) {
        newCentrality.set(node, value / norm);
      }

      centrality = newCentrality;
    }

    return centrality;
  }

  private detectClusters(graph: GraphStructure, adjacency: Map<string, Map<string, number>>, resolution: number = 1.0): ClusterResult {
    const nodes = graph.nodes.filter(n => n.type === 'file').map(n => n.id);
    const communities = new Map<string, number>();
    let communityId = 0;

    for (const node of nodes) {
      communities.set(node, communityId++);
    }

    let improved = true;
    let modularity = this.calculateModularity(adjacency, communities);

    while (improved) {
      improved = false;

      for (const node of nodes) {
        const currentCommunity = communities.get(node)!;
        let bestCommunity = currentCommunity;
        let bestGain = 0;

        const neighbors = adjacency.get(node) || new Map();
        const neighborCommunities = new Set<number>();
        
        for (const neighbor of neighbors.keys()) {
          if (communities.has(neighbor)) {
            neighborCommunities.add(communities.get(neighbor)!);
          }
        }

        for (const community of neighborCommunities) {
          if (community === currentCommunity) continue;

          communities.set(node, community);
          const newModularity = this.calculateModularity(adjacency, communities);
          const gain = newModularity - modularity;

          if (gain > bestGain) {
            bestGain = gain;
            bestCommunity = community;
          }
        }

        if (bestCommunity !== currentCommunity) {
          communities.set(node, bestCommunity);
          modularity += bestGain;
          improved = true;
        } else {
          communities.set(node, currentCommunity);
        }
      }
    }

    const clusters = new Map<number, string[]>();
    for (const [node, community] of communities) {
      if (!clusters.has(community)) {
        clusters.set(community, []);
      }
      clusters.get(community)!.push(node);
    }

    const result: ClusterResult = {
      clusters: Array.from(clusters.entries()).map(([id, nodeIds], index) => ({
        id: `cluster-${index}`,
        nodes: nodeIds.map(id => id.substring(5)),
        cohesion: this.calculateClusterCohesion(nodeIds, adjacency),
        tags: this.getClusterTags(nodeIds),
      })),
      modularity,
    };

    return result;
  }

  private calculateModularity(adjacency: Map<string, Map<string, number>>, communities: Map<string, number>): number {
    let modularity = 0;
    let totalEdges = 0;

    for (const neighbors of adjacency.values()) {
      for (const weight of neighbors.values()) {
        totalEdges += weight;
      }
    }
    totalEdges /= 2;

    if (totalEdges === 0) return 0;

    for (const [nodeA, neighborsA] of adjacency) {
      const communityA = communities.get(nodeA);
      if (communityA === undefined) continue;

      const degreeA = Array.from(neighborsA.values()).reduce((sum, w) => sum + w, 0);

      for (const [nodeB, weight] of neighborsA) {
        const communityB = communities.get(nodeB);
        if (communityB === undefined) continue;

        const degreeB = Array.from(adjacency.get(nodeB)?.values() || []).reduce((sum, w) => sum + w, 0);

        if (communityA === communityB) {
          modularity += weight - (degreeA * degreeB) / (2 * totalEdges);
        }
      }
    }

    return modularity / (2 * totalEdges);
  }

  private analyzePathStructure(graph: GraphStructure, adjacency: Map<string, Map<string, number>>): PathAnalysis {
    const nodes = graph.nodes.map(n => n.id);
    const shortestPaths = new Map<string, Map<string, string[]>>();
    let totalPathLength = 0;
    let pathCount = 0;
    let diameter = 0;

    for (const source of nodes) {
      const pathsFromSource = new Map<string, string[]>();
      const distances = this.dijkstra(adjacency, source);

      for (const [target, distance] of distances) {
        if (distance < Infinity && source !== target) {
          const path = this.reconstructPath(adjacency, source, target);
          pathsFromSource.set(target, path);
          
          totalPathLength += distance;
          pathCount++;
          diameter = Math.max(diameter, distance);
        }
      }

      shortestPaths.set(source, pathsFromSource);
    }

    const averagePathLength = pathCount > 0 ? totalPathLength / pathCount : 0;
    const reachability = this.calculateReachability(adjacency);

    return { shortestPaths, diameter, averagePathLength, reachability };
  }

  private analyzeConnectivity(graph: GraphStructure, adjacency: Map<string, Map<string, number>>): GraphMetrics['connectivity'] {
    const nodes = graph.nodes.map(n => n.id);
    const components = this.findConnectedComponents(graph.nodes, this.buildSimpleAdjacency(adjacency));
    const bridges = this.findBridges(adjacency);
    const articulation = this.findArticulationPoints(adjacency);

    return { components, bridges, articulation };
  }

  private dijkstra(adjacency: Map<string, Map<string, number>>, source: string): Map<string, number> {
    const distances = new Map<string, number>();
    const visited = new Set<string>();
    const queue: Array<{ node: string; distance: number }> = [];

    for (const node of adjacency.keys()) {
      distances.set(node, Infinity);
    }
    distances.set(source, 0);
    queue.push({ node: source, distance: 0 });

    while (queue.length > 0) {
      queue.sort((a, b) => a.distance - b.distance);
      const { node: current } = queue.shift()!;

      if (visited.has(current)) continue;
      visited.add(current);

      const neighbors = adjacency.get(current) || new Map();
      for (const [neighbor, weight] of neighbors) {
        const newDistance = distances.get(current)! + weight;
        
        if (newDistance < distances.get(neighbor)!) {
          distances.set(neighbor, newDistance);
          queue.push({ node: neighbor, distance: newDistance });
        }
      }
    }

    return distances;
  }

  private reconstructPath(adjacency: Map<string, Map<string, number>>, source: string, target: string): string[] {
    const path = [target];
    let current = target;

    while (current !== source) {
      const neighbors = adjacency.get(current) || new Map();
      let bestPredecessor = source;
      let minDistance = Infinity;

      for (const neighbor of neighbors.keys()) {
        const distances = this.dijkstra(adjacency, source);
        const distance = distances.get(neighbor) || Infinity;
        
        if (distance < minDistance) {
          minDistance = distance;
          bestPredecessor = neighbor;
        }
      }

      path.unshift(bestPredecessor);
      current = bestPredecessor;
    }

    return path;
  }

  private findConnectedComponents(nodes: GraphNode[], adjacency: Map<string, Set<string>>): Array<string[]> {
    const visited = new Set<string>();
    const components: Array<string[]> = [];

    for (const node of nodes) {
      if (!visited.has(node.id)) {
        const component = this.dfs(node.id, adjacency, visited);
        components.push(component);
      }
    }

    return components;
  }

  private dfs(start: string, adjacency: Map<string, Set<string>>, visited: Set<string>): string[] {
    const component: string[] = [];
    const stack = [start];

    while (stack.length > 0) {
      const current = stack.pop()!;
      
      if (!visited.has(current)) {
        visited.add(current);
        component.push(current);

        const neighbors = adjacency.get(current) || new Set();
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            stack.push(neighbor);
          }
        }
      }
    }

    return component;
  }

  private buildSimpleAdjacency(adjacency: Map<string, Map<string, number>>): Map<string, Set<string>> {
    const simple = new Map<string, Set<string>>();

    for (const [node, neighbors] of adjacency) {
      simple.set(node, new Set(neighbors.keys()));
    }

    return simple;
  }

  private findBridges(adjacency: Map<string, Map<string, number>>): Array<[string, string]> {
    return [];
  }

  private findArticulationPoints(adjacency: Map<string, Map<string, number>>): string[] {
    return [];
  }

  private calculateReachability(adjacency: Map<string, Map<string, number>>): Map<string, string[]> {
    const reachability = new Map<string, string[]>();

    for (const source of adjacency.keys()) {
      const distances = this.dijkstra(adjacency, source);
      const reachable = Array.from(distances.entries())
        .filter(([target, distance]) => distance < Infinity && target !== source)
        .map(([target, _]) => target);
      
      reachability.set(source, reachable);
    }

    return reachability;
  }

  private calculateClusterCohesion(nodeIds: string[], adjacency: Map<string, Map<string, number>>): number {
    let internalEdges = 0;
    let possibleEdges = 0;

    for (let i = 0; i < nodeIds.length; i++) {
      for (let j = i + 1; j < nodeIds.length; j++) {
        possibleEdges++;
        
        const neighbors = adjacency.get(nodeIds[i]) || new Map();
        if (neighbors.has(nodeIds[j])) {
          internalEdges++;
        }
      }
    }

    return possibleEdges > 0 ? internalEdges / possibleEdges : 0;
  }

  private getClusterTags(nodeIds: string[]): string[] {
    const tagCounts = new Map<string, number>();

    for (const nodeId of nodeIds) {
      const filePath = nodeId.substring(5);
      const tags = this.tagEngine.getTagsForFile(filePath);
      
      for (const tag of tags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    }

    return Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag, _]) => tag);
  }

  private exportGEXF(graph: GraphStructure): string {
    let gexf = '<?xml version="1.0" encoding="UTF-8"?>\n';
    gexf += '<gexf xmlns="http://www.gexf.net/1.2draft" version="1.2">\n';
    gexf += '  <graph mode="static" defaultedgetype="undirected">\n';
    
    gexf += '    <nodes>\n';
    for (const node of graph.nodes) {
      gexf += `      <node id="${node.id}" label="${node.label}" />\n`;
    }
    gexf += '    </nodes>\n';
    
    gexf += '    <edges>\n';
    for (let i = 0; i < graph.edges.length; i++) {
      const edge = graph.edges[i];
      gexf += `      <edge id="${i}" source="${edge.source}" target="${edge.target}" weight="${edge.weight}" />\n`;
    }
    gexf += '    </edges>\n';
    
    gexf += '  </graph>\n';
    gexf += '</gexf>\n';
    
    return gexf;
  }

  private exportDOT(graph: GraphStructure): string {
    let dot = 'graph G {\n';
    
    for (const node of graph.nodes) {
      const label = node.label.replace(/"/g, '\\"');
      dot += `  "${node.id}" [label="${label}"];\n`;
    }
    
    for (const edge of graph.edges) {
      dot += `  "${edge.source}" -- "${edge.target}";\n`;
    }
    
    dot += '}\n';
    
    return dot;
  }
}