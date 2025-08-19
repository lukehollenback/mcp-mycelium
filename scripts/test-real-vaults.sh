#!/bin/bash

# Test MCP Mycelium against real-world knowledge bases
set -e

echo "🧪 Testing MCP Mycelium against real-world knowledge bases..."

# Create test data directory
mkdir -p test-data
cd test-data

# Download knowledge bases if they don't exist
echo "📥 Downloading knowledge bases..."

if [ ! -d "obsidian-help" ]; then
    echo "  • Cloning Obsidian Help vault..."
    git clone --depth 1 https://github.com/obsidianmd/obsidian-help.git
fi

if [ ! -d "foam-template" ]; then
    echo "  • Cloning Foam template..."
    git clone --depth 1 https://github.com/foambubble/foam-template.git
fi

if [ ! -d "dendron-template" ]; then
    echo "  • Cloning Dendron template..."
    git clone --depth 1 https://github.com/dendronhq/dendron-template.git
fi

cd ..

echo "✅ Knowledge bases ready"

# Analyze the vaults
echo "📊 Analyzing real knowledge bases..."

echo "Obsidian Help vault:"
echo "  Files: $(find test-data/obsidian-help -name "*.md" | wc -l)"
echo "  WikiLinks: $(grep -r "\[\[.*\]\]" test-data/obsidian-help --include="*.md" | wc -l)"
echo "  Tags: $(grep -r "#[a-zA-Z]" test-data/obsidian-help --include="*.md" | wc -l)"

echo "Foam template:"
echo "  Files: $(find test-data/foam-template -name "*.md" | wc -l)"
echo "  WikiLinks: $(grep -r "\[\[.*\]\]" test-data/foam-template --include="*.md" | wc -l)"

echo "Dendron template:"
echo "  Files: $(find test-data/dendron-template -name "*.md" | wc -l)"

# Run the real-world tests
echo "🚀 Running real-world vault tests..."
npm run test:e2e:real-vaults

echo "✅ Real-world testing complete!"