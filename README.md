# MCP Mycelium

[![Tests](https://img.shields.io/github/actions/workflow/status/lukehollenback/mcp-mycelium/test.yml?branch=main&label=tests&logo=github)](https://github.com/lukehollenback/mcp-mycelium/actions/workflows/test.yml)
[![NPM Publish](https://img.shields.io/github/actions/workflow/status/lukehollenback/mcp-mycelium/publish.yml?label=npm%20publish&logo=npm)](https://github.com/lukehollenback/mcp-mycelium/actions/workflows/publish.yml)
[![NPM Version](https://img.shields.io/npm/v/mcp-mycelium?logo=npm)](https://www.npmjs.com/package/mcp-mycelium)
[![Node Version](https://img.shields.io/node/v/mcp-mycelium)](https://nodejs.org/)
[![Coverage](https://img.shields.io/codecov/c/github/lukehollenback/mcp-mycelium?logo=codecov)](https://codecov.io/gh/lukehollenback/mcp-mycelium)
[![License](https://img.shields.io/npm/l/mcp-mycelium)](LICENSE)
[![Downloads](https://img.shields.io/npm/dm/mcp-mycelium)](https://www.npmjs.com/package/mcp-mycelium)

A sophisticated Model Context Protocol (MCP) server for managing markdown-based knowledge bases with intelligent indexing, graph relationships, and AI-friendly operations.

## Overview

MCP Mycelium transforms your markdown files into an intelligent knowledge graph that AI assistants can navigate, search, and analyze. It provides semantic search, relationship mapping, content validation, and comprehensive graph analytics—all while working directly with your existing markdown files.

## Key Features

### 🔍 **Intelligent Search**
- **Hybrid Search**: Combines semantic similarity with text matching and metadata relevance
- **Semantic Understanding**: Uses embeddings to find conceptually related content
- **Advanced Filtering**: Search by tags, paths, date ranges, and custom criteria
- **Configurable Ranking**: Adjust weights for different relevance signals

### 🌐 **Knowledge Graph**
- **Automatic Link Detection**: Supports WikiLinks `[[Note]]` and markdown links
- **Tag Relationships**: Hierarchical tags with co-occurrence tracking
- **Graph Analytics**: PageRank, community detection, and centrality metrics
- **Path Analysis**: Find connections between any two pieces of content

### 📝 **Content Management**
- **Multi-Vault Support**: Manage multiple knowledge bases simultaneously
- **Template System**: Automatic content scaffolding based on file paths
- **Validation Rules**: Ensure content quality with built-in and custom rules
- **Real-time Sync**: Automatic indexing as you edit files

### 🤖 **AI Integration**
- **25+ MCP Tools**: Comprehensive interface for AI assistants
- **Structured Responses**: Consistent, machine-readable outputs
- **Bulk Operations**: Efficient batch processing for large tasks
- **Error Handling**: Clear, actionable error messages

## Installation

### Global Installation
```bash
npm install -g mcp-mycelium
```

### Local Usage
```bash
npx mcp-mycelium ./my-vault
```

## Quick Start

### 1. Initialize a New Vault
```bash
mcp-mycelium init ./my-knowledge-base
cd my-knowledge-base
```

### 2. Start the MCP Server
```bash
mcp-mycelium ./my-knowledge-base
```

### 3. Configure Your AI Client
Add to your MCP client configuration:
```json
{
  "mcpServers": {
    "knowledge-base": {
      "command": "mcp-mycelium",
      "args": ["./my-knowledge-base"]
    }
  }
}
```

## Usage Examples

### Basic Operations
```bash
# Multiple vaults
mcp-mycelium ./work-notes ./personal-notes

# Custom configuration
mcp-mycelium --config ./config ./vault1 ./vault2

# Validation and maintenance
mcp-mycelium validate ./my-vault --fix
mcp-mycelium reindex ./my-vault --embeddings
```

### MCP Tools
Once connected, AI assistants can use tools like:
- `search_content` - Find relevant content across your knowledge base
- `get_backlinks` - Discover connections between notes
- `analyze_communities` - Find clusters of related content
- `suggest_tags` - Get AI-powered tag recommendations
- `validate_file` - Check content quality and consistency

## Configuration

### Global Settings (`config/settings.yaml`)
```yaml
server:
  embeddings:
    provider: "openai"
    model: "text-embedding-3-small"
    api_key: "${OPENAI_API_KEY}"
  search:
    ranking_weights:
      semantic: 0.4
      tags: 0.3
      recency: 0.2
      backlinks: 0.1
```

### Vault-Specific Config (`config/vaults/my-vault.yaml`)
```yaml
name: "My Knowledge Base"
templates:
  - pattern: "^daily/\\d{4}-\\d{2}-\\d{2}\\.md$"
    frontmatter:
      required: ["date", "mood"]
    content_template: |
      ## Today's Focus
      
      ## Accomplishments
      
      ## Tomorrow's Plan
```

## Architecture

MCP Mycelium is built with a modular architecture:

- **Vault Manager**: Coordinates multiple knowledge bases
- **Indexer**: Efficient content parsing and indexing
- **Search Engine**: Hybrid semantic and text search
- **Graph Engine**: Relationship analysis and metrics
- **Template Engine**: Content consistency and scaffolding
- **Validation System**: Quality assurance with custom rules

## Performance

Designed for large knowledge bases:
- ✅ Index 1000+ files in under 30 seconds
- ✅ Search responses under 500ms
- ✅ Real-time updates with debounced batching
- ✅ Memory-efficient with configurable limits
- ✅ Concurrent request handling

## Embedding Provider

### OpenAI API (Required)
- **Quality**: State-of-the-art embeddings with `text-embedding-3-small`
- **Speed**: Fast cloud processing
- **Cost**: Pay per token (very affordable for most use cases)
- **Setup**: Requires OpenAI API key

#### Configuration
Set your OpenAI API key as an environment variable:
```bash
export OPENAI_API_KEY="your-api-key-here"
```

Or create a `.env` file in your project:
```bash
OPENAI_API_KEY=your-api-key-here
```

## Development

### Build from Source
```bash
git clone https://github.com/your-org/mcp-mycelium
cd mcp-mycelium
npm install
npm run build
```

### Run Tests
```bash
# Set OpenAI API key first
export OPENAI_API_KEY="your-api-key-here"

npm test
npm run test:coverage
npm run test:performance
```

### Type Checking
```bash
npm run typecheck
npm run lint
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Run the full test suite
5. Submit a pull request

## Roadmap

### v1.1
- [ ] Vector database backends (Pinecone, Weaviate)
- [ ] Advanced graph visualizations
- [ ] Custom embedding model support
- [ ] Plugin system for extensions

### v1.2
- [ ] Collaborative features
- [ ] Version control integration
- [ ] Advanced analytics dashboard
- [ ] Mobile companion app

## Support

- **Documentation**: [Full documentation](https://docs.mcp-mycelium.com)
- **Issues**: [GitHub Issues](https://github.com/your-org/mcp-mycelium/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/mcp-mycelium/discussions)
- **Discord**: [Community Discord](https://discord.gg/mcp-mycelium)

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

- Built on the [Model Context Protocol](https://modelcontextprotocol.io/)
- Powered by [OpenAI Embeddings API](https://platform.openai.com/docs/guides/embeddings)
- Inspired by tools like Obsidian, Roam Research, and Logseq