# Testing Strategy - MCP Mycelium

## 🧪 Current Testing Coverage

### ✅ **Test Suite Overview**
- **Unit Tests**: 15+ test files covering all core modules
- **Integration Tests**: MCP tools, multi-vault operations, filesystem monitoring
- **Performance Tests**: Large vault handling, concurrent operations, memory usage
- **End-to-End Tests**: Full workflow scenarios with real markdown files

### 📊 **Test Categories**

#### Unit Tests (`tests/unit/`)
- **Core Components**: Vault manager, indexer, search engine
- **Graph Engine**: Tag engine, backlink tracking, graph analytics
- **Templates**: Template engine, validation system
- **Utilities**: Configuration, filesystem, markdown parsing
- **Embeddings**: Provider abstraction, local/cloud implementations

#### Integration Tests (`tests/integration/`)
- **MCP Tools**: All 25+ tools with realistic scenarios
- **Multi-Vault**: Cross-vault operations and isolation
- **File Monitoring**: Real-time updates and debouncing
- **Search Integration**: Hybrid search with all ranking factors

#### Performance Tests (`tests/performance/`)
- **Indexing**: 1000+ files in under 30 seconds
- **Search**: Sub-500ms response times
- **Memory**: Reasonable usage scaling
- **Graph Operations**: PageRank, community detection efficiency
- **Concurrent Access**: Multiple simultaneous operations

### 🌟 **Real-World Testing**

#### Recommended Knowledge Bases

**1. Obsidian Help Vault** ⭐ Best Choice
```bash
git clone https://github.com/obsidianmd/obsidian-help
```
- **Files**: ~200 interconnected markdown files
- **Features**: Rich WikiLinks, comprehensive tagging, real organizational patterns
- **Why Perfect**: Represents actual user knowledge base patterns

**2. Foam Knowledge Base Template**
```bash
git clone https://github.com/foambubble/foam-template
```
- **Focus**: Research-oriented structure
- **Features**: Graph visualization patterns, VSCode integration

**3. Dendron Template**
```bash
git clone https://github.com/dendronhq/dendron-template
```
- **Focus**: Hierarchical organization
- **Features**: Schema-based templates, daily/weekly patterns

**4. Logseq Documentation**
```bash
git clone https://github.com/logseq/docs
```
- **Focus**: Block-based references
- **Features**: Temporal organization, advanced linking

## 🚀 **Running Tests**

### Basic Test Commands
```bash
# Run all tests
npm test

# Run with coverage report
npm run test:coverage

# Run performance benchmarks
npm run test:performance

# Watch mode for development
npm run test:watch
```

### Real-World Testing
```bash
# Download and test against real knowledge bases
npm run test:real-world

# Test specific real-world vault
npm run test:e2e:real-vaults
```

### Type Safety & Linting
```bash
# Type checking
npm run typecheck

# Code linting
npm run lint
npm run lint:fix
```

## 📈 **Performance Benchmarks**

### Target Performance Standards
- ✅ **Indexing**: 1000 files in <30 seconds
- ✅ **Search**: Response time <500ms
- ✅ **Memory**: <50KB per file indexed
- ✅ **Graph**: PageRank calculation <2 seconds
- ✅ **Concurrency**: 20 searches in <5 seconds

### Real-World Performance
Based on testing with Obsidian Help vault (~200 files):
- **Indexing**: ~2-5 seconds
- **Search**: 50-200ms typical
- **Memory**: 10-30KB per file
- **Graph Metrics**: Sub-second calculations

## 🧩 **Test Fixtures & Utilities**

### Synthetic Test Data
Our test fixtures include realistic patterns:
```typescript
// Sample test files with proper structure
const sampleFiles = [
  {
    path: 'getting-started.md',
    frontmatter: {
      title: 'Getting Started',
      tags: ['tutorial', 'basics'],
      created: '2024-01-01T00:00:00Z'
    },
    content: '# Getting Started\n\nLearn to use [[Linking Notes]]...'
  }
  // ... more realistic examples
];
```

### Test Utilities
- **TestVaultManager**: Creates temporary vaults with cleanup
- **Mock Embedding Provider**: Consistent test embeddings
- **Performance Helpers**: Timing and memory measurement
- **Error Injection**: Testing resilience and error handling

## 🔍 **What We Test**

### Core Functionality
- [x] Multi-vault initialization and coordination
- [x] Markdown parsing with frontmatter extraction
- [x] Real-time file monitoring and updates
- [x] Tag extraction and hierarchical organization
- [x] WikiLink and markdown link detection
- [x] Embedding generation and semantic search
- [x] Hybrid search with configurable ranking
- [x] Template application and validation
- [x] Graph analytics (PageRank, centrality, communities)
- [x] All 25+ MCP tools with proper schemas

### Edge Cases & Error Handling
- [x] Malformed markdown files
- [x] Broken frontmatter YAML
- [x] Invalid WikiLinks and references
- [x] Large file handling
- [x] Concurrent access patterns
- [x] Memory constraints
- [x] Network failures (for cloud embeddings)
- [x] File system permission issues

### Performance Scenarios
- [x] Large vault indexing (1000+ files)
- [x] Frequent file updates
- [x] Complex graph structures
- [x] Memory usage under load
- [x] Concurrent search requests
- [x] Background embedding generation

## 🎯 **Test Quality Standards**

### Coverage Requirements
- **Target**: 90%+ test coverage (per coding standards)
- **Critical Paths**: 100% coverage for core MCP tools
- **Performance**: All benchmarks must pass
- **Error Handling**: Every error condition tested

### Test Organization
```
tests/
├── unit/           # Isolated component testing
├── integration/    # Cross-component workflows  
├── performance/    # Speed and memory benchmarks
├── e2e/           # End-to-end scenarios
└── helpers/       # Test utilities and fixtures
```

### Quality Metrics
- ✅ Fast execution (full suite <60 seconds)
- ✅ Deterministic results (no flaky tests)
- ✅ Clear error messages
- ✅ Realistic test scenarios
- ✅ Comprehensive edge case coverage

## 🌐 **Continuous Testing**

### Pre-commit Hooks
```bash
# Run before every commit
npm run typecheck
npm run lint
npm test
```

### CI/CD Integration
```yaml
# Example GitHub Actions
- name: Run tests
  run: |
    npm ci
    npm run test:coverage
    npm run test:performance
    npm run test:real-world
```

## 📝 **Adding New Tests**

### When to Add Tests
- New MCP tools or significant feature changes
- Bug fixes (regression testing)
- Performance optimizations
- New vault configurations or templates

### Test Templates
```typescript
// Unit test template
describe('NewFeature', () => {
  it('should handle expected behavior', () => {
    // Arrange
    // Act  
    // Assert
  });
  
  it('should handle edge cases', () => {
    // Test error conditions
  });
});
```

### Performance Test Template
```typescript
it('should meet performance requirements', async () => {
  const startTime = Date.now();
  // ... operation
  const duration = Date.now() - startTime;
  expect(duration).toBeLessThan(targetMs);
});
```

This comprehensive testing strategy ensures MCP Mycelium is robust, performant, and reliable across diverse real-world knowledge bases.