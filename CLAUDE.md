# (mcp-mycelium) Regenerable Technical Specification & AI Instructions

## Overview

A sophisticated Model Context Protocol (MCP) server for managing markdown-based knowledge bases with intelligent indexing, graph relationships, and AI-friendly operations. Designed to work directly with filesystem markdown files without requiring external applications.

## Core Requirements

### 1. Multi-Vault Architecture
- **Command Line Interface**: `mcp-mycelium --config <config-dir> <vault1> <vault2> ... <vaultN>`
- **Configuration**: YAML/JSON config in `<config-dir>` for global settings, templates, and validation rules
- **Vault Isolation**: Each vault maintains its own indexes and can have different configurations
- **Cross-Vault Queries**: Support for searching across multiple vaults or within specific vaults

### 2. Filesystem Operations
- **Direct Access**: Read/write markdown files without external dependencies
- **Change Monitoring**: Real-time filesystem watching with debounced updates (chokidar or similar)
- **Efficient Updates**: Incremental re-indexing of only changed files
- **Path Normalization**: Handle various path formats and ensure cross-platform compatibility

### 3. Content Indexing & Search

#### Embeddings Index
- **Model Choice**: OpenAI API embeddings (required)
- **Lazy Loading**: Build embeddings on-demand or background processing
- **Incremental Updates**: Re-embed only modified content
- **Chunking Strategy**: Smart content chunking for large files (respect headers, paragraphs)
- **Storage**: Efficient vector storage (FAISS, in-memory, or simple JSON)

#### Search Capabilities
- **Hybrid Search**: Combine semantic similarity with metadata relevance
- **Ranking Factors**: 
  - Semantic similarity score
  - Tag overlap with query
  - Recency/modification time
  - Backlink authority (PageRank-style)
  - File path relevance
- **Query Types**:
  - Natural language semantic search
  - Tag-based filtering
  - Path-based filtering
  - Combined queries

### 4. Graph Engine

#### Tag System
- **First-Class Support**: Tags as primary organizational mechanism
- **Index Structure**: 
  ```
  tags: {
    "tag-name": {
      files: ["path1", "path2"],
      co_occurring_tags: {"other-tag": count},
      created: timestamp,
      last_seen: timestamp
    }
  }
  ```
- **Tag Sources**: Frontmatter arrays, inline `#tags`, and configurable patterns
- **Hierarchical Tags**: Support for nested tags (`project/web/frontend`)
- **Tag Suggestions**: AI-accessible list of existing tags to prevent duplication

#### Backlink System
- **Bidirectional Index**: Track both outgoing and incoming links
- **Link Types**:
  - WikiLinks: `[[Note Name]]` or `[[Note Name|Display Text]]`
  - Markdown links: `[Display](./path/to/file.md)`
  - Configurable patterns via regex
- **Index Structure**:
  ```
  backlinks: {
    "file-path": {
      outgoing: [
        {target: "other-file", text: "link text", line: 42}
      ],
      incoming: [
        {source: "source-file", text: "link text", line: 15}
      ]
    }
  }
  ```
- **Link Validation**: Detect broken links, suggest corrections
- **Graph Metrics**: Calculate centrality, clustering, path distances

#### Mind Map Exposure
- **Graph API**: Expose tag and backlink relationships to AI
- **Query Operations**:
  - "Find all notes tagged with X and Y"
  - "Show notes 2 hops from this file via backlinks"
  - "What tags co-occur most with tag X?"
  - "Find the shortest path between note A and note B"
- **Graph Visualization Data**: Export graph structure for external visualization

### 5. Template System

#### Path-Based Templates
- **Regex Matching**: Define templates based on file path patterns
- **Template Types**:
  - Frontmatter schemas (required/optional fields)
  - Content scaffolds (boilerplate content)
  - Naming conventions
- **Configuration Example**:
  ```yaml
  templates:
    - pattern: "^daily-notes/\\d{4}-\\d{2}-\\d{2}\\.md$"
      frontmatter:
        required: ["date", "mood"]
        optional: ["weather", "goals"]
      content_template: |
        ## Today's Focus
        
        ## Accomplishments
        
        ## Tomorrow's Plan
  ```

#### Template Enforcement
- **On Creation**: Auto-apply templates for new files matching patterns
- **On Validation**: Check existing files against their templates
- **AI Guidance**: Provide template information to AI for proper file creation

### 6. Validation System

#### Frontmatter Validation
- **Schema Definition**: JSON Schema or similar for frontmatter structure
- **Type Checking**: Ensure proper data types (dates, arrays, strings)
- **Required Fields**: Enforce mandatory frontmatter fields
- **Error Reporting**: Descriptive errors to guide AI corrections
- **Auto-Fixing**: Suggest or auto-apply common fixes

#### Custom Validation Rules
- **Rule Engine**: JavaScript/TypeScript functions for custom validation
- **Validation Points**: On file save, on demand, or scheduled
- **Rule Examples**:
  - Ensure certain tags are present for specific paths
  - Validate date formats in daily notes
  - Check for required sections in meeting notes
  - Enforce naming conventions
- **Configuration**:
  ```yaml
  validation:
    rules:
      - name: "daily-note-format"
        pattern: "^daily-notes/.*"
        script: "./validators/daily-note.js"
        on: ["save", "validation-run"]
  ```

### 7. MCP Tools Interface

#### Core Operations
- `search_content(query: string, vault?: string, filters?: object)` - Semantic + metadata search
- `read_file(path: string, vault?: string)` - Read file with metadata
- `write_file(path: string, content: string, vault?: string)` - Write with validation
- `update_file(path: string, content: string, vault?: string)` - Efficient updates
- `create_file(path: string, content?: string, vault?: string)` - Create with template application

#### Graph Operations
- `get_tags(vault?: string)` - List all tags with usage stats
- `get_files_by_tag(tags: string[], vault?: string)` - Tag-based file discovery
- `get_backlinks(path: string, vault?: string)` - Get incoming/outgoing links
- `find_related(path: string, hops?: number, vault?: string)` - Graph traversal
- `get_graph_stats(vault?: string)` - Graph metrics and insights

#### Discovery & Navigation
- `list_vaults()` - Available vaults
- `list_files(vault?: string, pattern?: string)` - File listing with filtering
- `get_file_metadata(path: string, vault?: string)` - Tags, links, stats without content
- `validate_file(path: string, vault?: string)` - Run validation checks
- `suggest_tags(content: string, vault?: string)` - AI tag suggestions based on existing taxonomy

#### Bulk Operations
- `bulk_search(queries: string[], vault?: string)` - Multiple searches efficiently
- `bulk_validate(vault?: string, pattern?: string)` - Validate multiple files
- `reindex_vault(vault?: string)` - Force full re-indexing

### 8. Configuration System

#### Global Configuration (`config/settings.yaml`)
```yaml
server:
  embeddings:
    provider: "openai"
    model: "text-embedding-3-small"
    api_key: "${OPENAI_API_KEY}"
  
  monitoring:
    debounce_ms: 1000
    batch_size: 50
  
  search:
    max_results: 100
    similarity_threshold: 0.7
    ranking_weights:
      semantic: 0.4
      tags: 0.3
      recency: 0.2
      backlinks: 0.1

vaults:
  default_config:
    frontmatter:
      date_format: "YYYY-MM-DD"
      required_fields: ["created", "modified"]
    
    links:
      patterns:
        - "\\[\\[([^\\]]+)\\]\\]"  # WikiLinks
        - "\\[([^\\]]+)\\]\\(([^\\)]+\\.md)\\)"  # Markdown links
    
    tags:
      patterns:
        - "#([a-zA-Z0-9_/-]+)"  # Inline tags
        - frontmatter: "tags"   # Frontmatter array
```

#### Vault-Specific Configuration (`config/vaults/<vault-name>.yaml`)
```yaml
name: "Research Notes"
path: "/path/to/vault"

templates:
  - pattern: "^research/papers/.*\\.md$"
    frontmatter:
      required: ["title", "authors", "year", "tags"]
      schema:
        title: {type: "string"}
        authors: {type: "array", items: {type: "string"}}
        year: {type: "integer", minimum: 1900, maximum: 2100}
        tags: {type: "array", items: {type: "string"}}

validation:
  rules:
    - name: "paper-citation-format"
      pattern: "^research/papers/.*"
      script: "./validators/citation-format.js"
```

### 9. Performance Considerations

#### Indexing Strategy
- **Startup**: Build basic indexes first (files, tags), then embeddings in background
- **Memory Management**: LRU cache for embeddings, configurable limits
- **Persistence**: Save indexes to disk, reload on restart
- **Incremental**: Only re-process changed files

#### Scaling Considerations
- **Large Vaults**: Handle 10k+ files efficiently
- **Memory Usage**: Configurable memory limits and disk-based fallbacks
- **Concurrent Access**: Thread-safe operations for filesystem monitoring
- **Batch Processing**: Group operations for efficiency

### 10. Error Handling & Logging

#### Error Categories
- **Validation Errors**: Detailed, AI-friendly error messages
- **File System Errors**: Permission, missing file, corruption issues
- **Index Corruption**: Automatic rebuild capabilities
- **Template Errors**: Clear guidance for AI on proper formatting

#### Logging
- **Structured Logs**: JSON format with context
- **Log Levels**: Debug, info, warn, error with configurable verbosity
- **Audit Trail**: Track AI operations for debugging
- **Performance Metrics**: Index build times, search performance

### 11. Implementation Architecture

```
mcp-mycelium/
├── src/
│   ├── server/
│   │   ├── mcp-server.ts           # Main MCP interface
│   │   └── tools/                  # MCP tool implementations
│   ├── core/
│   │   ├── vault-manager.ts        # Multi-vault coordination
│   │   ├── file-monitor.ts         # Filesystem watching
│   │   ├── indexer.ts              # Content indexing
│   │   └── search-engine.ts        # Hybrid search
│   ├── graph/
│   │   ├── tag-engine.ts           # Tag management
│   │   ├── backlink-engine.ts      # Backlink tracking
│   │   └── graph-analyzer.ts       # Graph metrics
│   ├── templates/
│   │   ├── template-engine.ts      # Template application
│   │   └── validator.ts            # Validation system
│   ├── embeddings/
│   │   └── openai-embeddings.ts    # OpenAI API integration
│   └── utils/
│       ├── config.ts               # Configuration management
│       ├── markdown-parser.ts      # Frontmatter + content
│       └── filesystem.ts           # File operations
├── config/
│   ├── settings.yaml               # Global settings
│   ├── vaults/                     # Vault-specific configs
│   └── validators/                 # Custom validation scripts
├── package.json
├── tsconfig.json
└── README.md
```

### 12. Installation & Usage

#### Installation
```bash
npm install -g mcp-mycelium
# or
npx mcp-mycelium --config ./config ./vault1 ./vault2
```

#### Docker Support
```dockerfile
FROM node:18-alpine
RUN npm install -g mcp-mycelium
VOLUME ["/config", "/vaults"]
CMD ["mcp-mycelium", "--config", "/config", "/vaults"]
```

#### MCP Client Configuration
```json
{
  "mcpServers": {
    "knowledge-base": {
      "command": "mcp-mycelium",
      "args": ["--config", "/path/to/config", "/path/to/vault1", "/path/to/vault2"]
    }
  }
}
```

### 13. Success Criteria

#### Functional Requirements
- ✅ Handle multiple vaults simultaneously
- ✅ Real-time filesystem monitoring with efficient updates  
- ✅ Semantic search with configurable embedding models
- ✅ Complete tag and backlink graph maintenance
- ✅ Template application and validation
- ✅ AI-friendly error messages and guidance

#### Performance Requirements
- ✅ Index 1000 files in under 30 seconds
- ✅ Search response time under 500ms for typical queries
- ✅ Memory usage scales predictably with vault size
- ✅ Handle concurrent AI requests without blocking

#### Usability Requirements
- ✅ Zero-configuration setup for basic use cases
- ✅ Clear documentation and examples
- ✅ Helpful error messages that guide AI behavior
- ✅ Graceful degradation when optional features fail

## Decision Log Management

### When to Log Decisions
Document any decision that:
- Changes the public API or tool interfaces
- Affects architecture or major code organization
- Chooses between significant alternatives (libraries, patterns, approaches)
- Impacts testing strategy or deployment process
- Resolves a design problem or technical constraint

### Decision Format
```markdown
## Decision #{number} - {YYYY-MM-DD} - {Title}

**Context**: Brief description of the situation requiring a decision

**Decision**: What was decided

**Rationale**: Why this decision was made

**Alternatives**: Other options considered

**Impact**: Expected consequences of this decision

---
```

### Decision Log Archiving
When `DECISIONS.md` reaches 250 entries:
1. Archive entries 1-200 to `DECISIONS-archive-{timestamp}.md`
2. Keep entries 201-250 in active log, renumber as 1-50
3. Add reference to archived file at top of active log

## Testing Strategy

### Comprehensive Test Coverage
- **Unit Tests**: All core modules (indexing, search, graph, validation)
- **Integration Tests**: MCP tool interactions, multi-vault operations
- **Performance Tests**: Large vault handling, concurrent access, memory usage
- **End-to-End Tests**: Full workflow scenarios with actual markdown files
- **Regression Tests**: Maintain test cases for all critical bug fixes

### Test Organization
```
tests/
├── unit/
│   ├── core/
│   ├── graph/
│   ├── templates/
│   └── embeddings/
├── integration/
│   ├── mcp-tools/
│   ├── multi-vault/
│   └── filesystem-monitoring/
├── performance/
│   ├── large-vault-tests/
│   └── concurrent-access/
├── e2e/
│   ├── scenarios/
│   └── fixtures/
└── helpers/
    ├── test-vaults/
    └── mock-data/
```

### Test-Driven Development
- Write tests before implementing features
- Maintain 90%+ test coverage
- Update tests immediately when changing functionality
- Include negative test cases and edge conditions

## Important Additional Instructions

### Critical Maintenance Requirements

**CLAUDE.md File Maintenance**:
- This specification MUST be updated whenever any architectural decision is made
- All new features, APIs, or significant changes MUST be documented here
- The specification must remain complete enough to regenerate the entire project
- Version the specification alongside code changes

**README.md File Maintenance**:
- Must be maintained as the primary end-user documentation
- Focus on software description, installation, and usage instructions
- Avoid architectural details or implementation specifics
- Include practical examples and common use cases
- Keep separate from CLAUDE.md with minimal cross-over
- Update whenever user-facing features or installation process changes

**DECISIONS.md File Maintenance**:
- EVERY architectural decision must be logged immediately when made
- Use the specified format consistently
- Reference decision numbers in commit messages and code comments
- Review and update impact assessments as implementations progress

**Test Suite Maintenance**:
- Tests MUST be updated before merging any feature changes
- New MCP tools require both unit and integration tests
- Performance benchmarks must be established and monitored
- Test fixtures should cover edge cases and real-world scenarios

### Code Quality Standards
- **TypeScript Strict Mode**: All code must pass strict type checking
- **Error Handling**: Every operation must have appropriate error handling with AI-friendly messages
- **Logging**: Structured logging at appropriate levels throughout
- **Documentation**: JSDoc comments for all public APIs
- **Performance**: Profile critical paths and optimize for large vault handling

### AI Development Guidelines
When working with Claude Code or other AI assistance:
- Always reference current CLAUDE.md for project context
- Require decision logging for any architectural changes
- Insist on test coverage for new functionality
- Validate that changes maintain specification compliance
- Update documentation before considering features complete

### Project Regeneration Verification
Periodically verify regeneration capability by:
1. Creating new project from CLAUDE.md specification alone
2. Comparing against existing implementation
3. Identifying and fixing specification gaps
4. Updating specification with missing details

## Regeneration Requirements
This specification contains all information needed to recreate the project:
- Complete architecture and file structure
- Implementation details for all MCP tools
- Testing strategy and organization  
- Error handling patterns
- Data validation and transformation logic
- Distribution and deployment setup
- Decision log management process
- Quality standards and maintenance procedures
- README.md maintenance requirements for end-user documentation

This specification provides a comprehensive foundation for building a production-quality knowledge base MCP server that goes far beyond existing filesystem-based solutions while maintaining complete regenerability, architectural decision transparency, and clear end-user documentation.
