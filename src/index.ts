#!/usr/bin/env node

/**
 * TypeRef-MCP entry point
 * TypeScript type inference and symbol navigation MCP server
 */

import { TypeRefServer } from './server/TypeRefServer.js';
import { LogLevel } from './interfaces.js';

async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  
  let logLevel = LogLevel.Info;
  let enableWatcher = true;
  let maxCacheSize = 1000;

  // Simple argument parsing
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--debug':
        logLevel = LogLevel.Debug;
        break;
      case '--quiet':
        logLevel = LogLevel.Error;
        break;
      case '--no-watch':
        enableWatcher = false;
        break;
      case '--cache-size':
        if (i + 1 < args.length) {
          maxCacheSize = parseInt(args[++i], 10) || 1000;
        }
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      case '--version':
      case '-v':
        printVersion();
        process.exit(0);
        break;
    }
  }

  // Create and start server
  const server = new TypeRefServer({
    logLevel,
    enableWatcher,
    maxCacheSize,
  });

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.error('\nReceived SIGINT, shutting down gracefully...');
    await server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.error('\nReceived SIGTERM, shutting down gracefully...');
    await server.stop();
    process.exit(0);
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled rejection at:', promise, 'reason:', reason);
    process.exit(1);
  });

  try {
    await server.start();
  } catch (error) {
    console.error('Failed to start TypeRef MCP Server:', error);
    process.exit(1);
  }
}

function printHelp() {
  console.log(`
TypeRef-MCP - TypeScript Type Inference and Symbol Navigation MCP Server

USAGE:
    typeref-mcp [OPTIONS]

OPTIONS:
    --debug              Enable debug logging
    --quiet              Only show error messages
    --no-watch          Disable file watching
    --cache-size <size>  Set cache size (default: 1000)
    --help, -h          Show this help message
    --version, -v       Show version information

EXAMPLES:
    typeref-mcp
    typeref-mcp --debug --cache-size 2000
    typeref-mcp --no-watch --quiet

The server communicates via JSON-RPC over stdio and provides tools for:
- Type inference at specific positions
- Symbol definition lookup
- Reference finding
- Module analysis
- TypeScript diagnostics

For more information, see: https://github.com/username/typeref-mcp
`);
}

function printVersion() {
  // In a real implementation, you'd import from package.json
  console.log('TypeRef-MCP v0.1.0');
}

// Start the server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}