# TypeRef-MCP

A specialized MCP (Model Context Protocol) server providing TypeScript type inference and symbol navigation capabilities for Claude Code.

## Features

- **Type Inference**: Get precise TypeScript type information using the compiler API
- **Symbol Navigation**: Find definitions, references, and usages with type context
- **IntelliSense-Level Intelligence**: Professional IDE-grade type analysis
- **Real-time Analysis**: Live type checking and diagnostics
- **Extensible Architecture**: Designed to support multiple typed languages

## Installation

### From GitHub (Recommended)

```bash
# Install directly from GitHub
npm install -g github:Coldsewoo/typeref-mcp

# Or with pnpm
pnpm add -g github:Coldsewoo/typeref-mcp
```

### From Source

```bash
# Clone and install
git clone https://github.com/Coldsewoo/typeref-mcp.git
cd typeref-mcp
npm install
npm run build
npm link
```

## Usage with Claude Code

Add to your MCP configuration:

```json
{
  "mcpServers": {
    "typeref": {
      "command": "typeref-mcp",
      "args": [],
      "env": {}
    }
  }
}
```

Or if installed locally:

```json
{
  "mcpServers": {
    "typeref": {
      "command": "node",
      "args": ["./node_modules/.bin/typeref-mcp"],
      "env": {}
    }
  }
}
```

## Core Capabilities

### Type Inference
- Resolve exact types for variables, functions, and expressions
- Handle complex TypeScript features (generics, conditionals, mapped types)
- Understand type narrowing in control flow

### Symbol Navigation
- Find symbol definitions with full type context
- Locate all references and usages
- Navigate import/export relationships
- Analyze module dependencies

### IntelliSense Features
- Parameter hints and signature help
- Autocompletion data with type information
- Documentation and JSDoc integration
- Error diagnostics and type checking

## Architecture

```
TypeRef-MCP
├── Language Adapters (extensible)
│   └── TypeScript Adapter (ts-morph + TS Compiler API)
├── Core Services
│   ├── Project Indexer
│   ├── Type Resolver
│   ├── Symbol Navigator
│   └── Cache Manager
└── MCP Server
    └── Tool Implementations
```

## Development

```bash
# Development mode with hot reload
npm run dev

# Watch mode
npm run watch

# Linting
npm run lint

# Formatting
npm run format

# Testing
npm test
```

## License

MIT