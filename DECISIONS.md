# Architectural Decisions

This document tracks all significant architectural decisions made during the development of MCP Mycelium.

## Decision #2 - 2025-01-03 - Remove Python Dependencies and Local Embeddings

**Context**: The original architecture included local sentence-transformers with Python dependencies alongside OpenAI API embeddings as an option. Python dependencies were causing installation and distribution issues for an MCP server that needs to work with `uvx`/`npx`.

**Decision**: Remove all Python dependencies (sentence-transformers, torch, embedding_server.py, LocalEmbeddingProvider) and use OpenAI embeddings exclusively.

**Rationale**:
- Python dependencies were causing complex installation requirements that conflict with MCP server distribution model
- OpenAI embeddings provide consistently high quality results  
- Eliminates dependency management complexity and Python environment issues
- Tests now fail hard when OpenAI API key is missing, ensuring proper configuration
- Simpler architecture with single embedding provider path

**Alternatives**:
- Keep both providers but fix Python installation issues
- Switch to different local embedding solution (WebAssembly-based)
- Use cloud-hosted local model API

**Impact**: 
- Requires OpenAI API key for all embedding functionality
- Eliminates Python installation complexity for end users
- Tests now fail fast without proper API key configuration
- Reduced codebase complexity and maintenance burden
- Better distribution compatibility with npm/uvx/npx

---

## Decision #1 - 2025-01-19 - Multi-Vault Architecture with Isolated Indexes

**Context**: The system needs to support multiple knowledge bases (vaults) simultaneously while maintaining performance and data isolation.

**Decision**: Implement a multi-vault architecture where each vault maintains its own indexes for tags, backlinks, and embeddings, coordinated by a central VaultManager.

**Rationale**: 
- Enables users to work with multiple knowledge bases without interference
- Allows different configuration per vault (templates, validation rules)
- Provides better performance through isolated indexes
- Supports different embedding models per vault if needed

**Alternatives**: 
- Single vault with namespace separation
- Completely separate server instances per vault

**Impact**: 
- More complex initialization and coordination logic
- Higher memory usage with multiple indexes
- Better scalability and user experience
- Clean separation of concerns

---

## Decision #2 - 2025-01-19 - Hybrid Search Engine with Configurable Ranking

**Context**: Users need powerful search capabilities that combine semantic understanding with traditional text matching and metadata relevance.

**Decision**: Implement a hybrid search engine that combines semantic similarity (embeddings), text search, tag relevance, recency, and backlink authority with configurable weights.

**Rationale**:
- Pure semantic search misses exact keyword matches
- Pure text search misses conceptually related content
- Metadata (tags, links, dates) provides important context
- Configurable weights allow customization per use case

**Alternatives**:
- Separate semantic and text search tools
- Pure semantic search only
- Traditional full-text search only

**Impact**:
- More complex search implementation
- Better search results that combine multiple signals
- Requires embedding provider for optimal performance
- Configurable ranking enables customization

---

## Decision #3 - 2025-01-19 - Template Engine with Path-Based Pattern Matching

**Context**: Users need consistent structure for different types of content (daily notes, project notes, meeting notes) with automatic application.

**Decision**: Implement a template engine that uses regex patterns to match file paths and automatically applies templates with frontmatter schemas and content scaffolds.

**Rationale**:
- Path-based matching is intuitive and flexible
- Regex patterns support complex matching scenarios
- Automatic application reduces manual work
- Schema validation ensures consistency

**Alternatives**:
- Manual template selection
- Content-based template detection
- Fixed folder-based templates

**Impact**:
- Flexible template system that adapts to user organization
- Automatic consistency enforcement
- Reduced cognitive load for content creation
- Requires careful pattern design to avoid conflicts

---

## Decision #4 - 2025-01-19 - Embedding Provider Abstraction with Local and Cloud Options

**Context**: Users need semantic search capabilities but may have different requirements for privacy, cost, and model quality.

**Decision**: Create an abstraction layer supporting both local embedding models (sentence-transformers) and cloud APIs (OpenAI) with graceful degradation when embeddings are unavailable.

**Rationale**:
- Local models provide privacy and no API costs
- Cloud APIs offer better quality and faster processing
- Abstraction enables easy switching between providers
- Graceful degradation ensures core functionality works without embeddings

**Alternatives**:
- Cloud-only approach
- Local-only approach
- Require embeddings for all functionality

**Impact**:
- More complex implementation and testing
- Better user choice and privacy options
- Robust fallback behavior
- Enables semantic search without vendor lock-in

---

## Decision #5 - 2025-01-19 - Real-Time File Monitoring with Debounced Updates

**Context**: Knowledge bases change frequently as users edit files, and the system needs to stay synchronized without overwhelming performance.

**Decision**: Implement real-time file monitoring using chokidar with debounced batch updates to indexes.

**Rationale**:
- Real-time updates provide immediate access to changes
- Debouncing prevents performance issues during rapid changes
- Batch processing improves efficiency
- File system events are reliable cross-platform

**Alternatives**:
- Manual refresh/reindex commands
- Periodic polling for changes
- Immediate update on every change

**Impact**:
- Better user experience with up-to-date information
- Complex event handling and coordination
- Improved performance through batching
- Requires careful error handling for file system issues

---

## Decision #6 - 2025-01-19 - Graph Analytics with PageRank and Community Detection

**Context**: Knowledge graphs provide valuable insights about content relationships, influential nodes, and content clusters that users want to discover.

**Decision**: Implement comprehensive graph analytics including PageRank for authority scoring, community detection for clustering, and path analysis for relationship discovery.

**Rationale**:
- PageRank identifies influential/central content
- Community detection reveals natural content clusters
- Path analysis helps discover unexpected connections
- Graph metrics provide actionable insights

**Alternatives**:
- Simple link counting only
- External graph analysis tools
- Basic connectivity metrics only

**Impact**:
- Rich analytical capabilities for knowledge discovery
- Complex algorithms requiring careful implementation
- Performance considerations for large graphs
- Valuable insights for content organization

---

## Decision #7 - 2025-01-19 - Comprehensive Validation System with Custom Rules

**Context**: Content quality and consistency are important for knowledge bases, and users need flexible validation that adapts to their specific needs.

**Decision**: Implement a validation system with built-in rules and support for custom JavaScript validation scripts with auto-fixing capabilities.

**Rationale**:
- Built-in rules cover common validation needs
- Custom scripts enable domain-specific validation
- Auto-fixing reduces manual correction work
- Structured error reporting guides improvements

**Alternatives**:
- Built-in validation only
- External linting tools
- Manual quality control only

**Impact**:
- High-quality content through automated checking
- Flexible system that adapts to different use cases
- Complex rule execution and error handling
- Improved user productivity through auto-fixing

---

## Decision #8 - 2025-01-19 - MCP Tools Interface with Comprehensive Coverage

**Context**: The Model Context Protocol requires a rich set of tools that enable AI assistants to effectively work with knowledge bases.

**Decision**: Implement a comprehensive set of 25+ MCP tools covering search, file operations, graph analysis, discovery, and bulk operations with detailed schemas and error handling.

**Rationale**:
- Comprehensive tool coverage enables sophisticated AI interactions
- Well-defined schemas ensure reliable AI integration
- Bulk operations improve efficiency for large tasks
- Detailed error handling provides clear feedback to AI

**Alternatives**:
- Basic file operations only
- Separate tools for each operation
- Generic query interface

**Impact**:
- Rich AI integration capabilities
- Large API surface requiring thorough testing
- Consistent interface patterns across all tools
- Enables sophisticated knowledge management workflows

---

## Decision #9 - 2025-01-19 - TypeScript with Strict Mode and Comprehensive Error Handling

**Context**: The system needs to be robust, maintainable, and provide clear error messages for both users and AI integrations.

**Decision**: Use TypeScript in strict mode with comprehensive error handling classes and structured logging throughout the system.

**Rationale**:
- TypeScript prevents many runtime errors
- Strict mode catches subtle type issues
- Structured error handling improves debugging
- Comprehensive logging enables troubleshooting

**Alternatives**:
- JavaScript with JSDoc
- TypeScript in non-strict mode
- Minimal error handling

**Impact**:
- Higher development rigor but better reliability
- Clear error messages improve user experience
- Structured logging enables performance monitoring
- Maintenance benefits from strong typing

---

## Decision #10 - 2025-01-19 - Command-Line Interface with Management Commands

**Context**: Users need convenient ways to initialize, validate, and manage their knowledge bases outside of the MCP protocol.

**Decision**: Implement a comprehensive CLI with commands for vault initialization, validation, reindexing, and server management.

**Rationale**:
- CLI provides direct access for power users
- Management commands enable maintenance workflows
- Initialization templates reduce setup friction
- Validation commands catch issues early

**Alternatives**:
- MCP-only interface
- Separate management tools
- Configuration file only setup

**Impact**:
- Better user experience for setup and maintenance
- Additional interface to maintain and test
- Enables automation and scripting
- Provides fallback access when MCP isn't available

---