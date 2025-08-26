import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { VaultManager } from '../../core/vault-manager.js';
import { SearchEngine } from '../../core/search-engine.js';
import { GraphAnalyzer } from '../../graph/graph-analyzer.js';
import { createSearchTools } from './search-tools.js';
import { createFileTools } from './file-tools.js';
import { createGraphTools } from './graph-tools.js';
import { createDiscoveryTools } from './discovery-tools.js';
import { createBulkTools } from './bulk-tools.js';

export interface ToolContext {
  vaultManager: VaultManager;
  searchEngine: SearchEngine;
  graphAnalyzer: GraphAnalyzer;
}

export function createAllTools(context: ToolContext): Tool[] {
  const tools: Tool[] = [];

  tools.push(...createSearchTools(context));
  tools.push(...createFileTools(context));
  tools.push(...createGraphTools(context));
  tools.push(...createDiscoveryTools(context));
  tools.push(...createBulkTools(context));

  return tools;
}

export { createSearchTools } from './search-tools.js';
export { createFileTools } from './file-tools.js';
export { createGraphTools } from './graph-tools.js';
export { createDiscoveryTools } from './discovery-tools.js';
export { createBulkTools } from './bulk-tools.js';