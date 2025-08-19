# Changelog

All notable changes to MCP Mycelium will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial release of MCP Mycelium
- Multi-vault knowledge base architecture
- Hybrid search engine (semantic + text + metadata)
- Real-time file monitoring with debounced updates
- Hierarchical tag system with co-occurrence tracking
- WikiLink and markdown link detection
- Graph analytics (PageRank, community detection, centrality)
- Template system with path-based pattern matching
- Validation system with custom rules and auto-fixing
- 25+ MCP tools for AI integration
- Local embedding support (sentence-transformers)
- OpenAI embedding support (optional)
- Comprehensive CLI with vault management
- Performance benchmarks and real-world testing
- GitHub Actions for CI/CD and NPM publishing
- Docker support with multi-architecture builds

### Features
- **Search**: Semantic similarity, text matching, tag filtering, date ranges
- **Graph**: Backlink tracking, path analysis, authority scoring
- **Templates**: Automatic content scaffolding based on file paths
- **Validation**: Content quality assurance with configurable rules
- **Performance**: 1000+ file indexing in <30 seconds, <500ms search
- **Privacy**: Local-first design with optional cloud enhancement

### Technical
- TypeScript with strict mode enabled
- 90%+ test coverage across unit, integration, and performance tests
- Real-world testing against Obsidian Help vault (2500+ files)
- Graceful error handling and recovery
- Cross-platform compatibility (Windows, macOS, Linux)
- Docker support for containerized deployment

## [1.0.0] - TBD

### Added
- Initial stable release
- Full feature set as described above
- Production-ready performance and reliability
- Comprehensive documentation and examples

### Security
- Input validation and sanitization
- Safe file system operations
- No secret logging or exposure
- Optional API key handling for cloud providers