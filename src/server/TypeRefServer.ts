/**
 * Main MCP server implementation for TypeRef
 * Handles MCP protocol communication and delegates to language adapters
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  CallToolRequest,
  CallToolResult,
  TextContent,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

import { TypeScriptAdapter } from '../adapters/TypeScriptAdapter.js';
import { MemoryCache } from '../core/MemoryCache.js';
import { SimpleFileWatcher } from '../core/SimpleFileWatcher.js';
import { ConsoleLogger } from '../core/ConsoleLogger.js';
import { TOOLS } from './tools.js';
import {
  LanguageAdapter,
  CacheManager,
  FileWatcher,
  Logger,
  TypeRefConfig,
  LogLevel,
} from '../interfaces.js';
import {
  TypeInferenceResponse,
  SymbolNavigationResponse,
  ModuleAnalysisResponse,
  ProjectAnalysisResponse,
} from '../types.js';

export class TypeRefServer {
  private server: Server;
  private adapters = new Map<string, LanguageAdapter>();
  private cache: CacheManager;
  private watcher: FileWatcher;
  private logger: Logger;
  private config: TypeRefConfig;
  private performanceMonitor?: {
    toolCalls: Map<string, { count: number; totalTime: number; lastCalled: number }>;
    startTime: number;
    interval?: NodeJS.Timeout;
  };
  private readonly isDev = process.env.NODE_ENV === 'development' || process.env.DEBUG === 'typeref:*';

  constructor(config: Partial<TypeRefConfig> = {}) {
    // Initialize configuration
    this.config = {
      maxCacheSize: 1000,
      cacheTTL: 10 * 60 * 1000, // 10 minutes
      maxProjectSize: 10000, // max files
      enableWatcher: true,
      excludePatterns: ['node_modules/**', '**/*.d.ts', 'dist/**', 'build/**'],
      logLevel: LogLevel.Info,
      ...config,
    };

    // Initialize performance monitoring in dev mode only
    if (this.isDev) {
      this.initializePerformanceMonitoring();
    }

    // Initialize core services
    this.logger = new ConsoleLogger(this.config.logLevel);
    this.cache = new MemoryCache(this.config.maxCacheSize);
    this.watcher = this.config.enableWatcher 
      ? new SimpleFileWatcher(this.logger)
      : null as any;

    // Initialize MCP server
    this.server = new Server(
      {
        name: 'typeref-mcp',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Initialize language adapters
    this.initializeAdapters();
    
    // Setup MCP handlers
    this.setupHandlers();
    
    this.logger.info('TypeRef MCP Server initialized');
  }

  private initializePerformanceMonitoring(): void {
    this.performanceMonitor = {
      toolCalls: new Map(),
      startTime: Date.now(),
    };

    // Report performance stats every 5 minutes in dev mode
    this.performanceMonitor.interval = setInterval(() => {
      this.reportPerformanceStats();
    }, 5 * 60 * 1000);

    this.logger.info('🔧 Performance monitoring enabled (development mode)');
  }

  private reportPerformanceStats(): void {
    if (!this.performanceMonitor) return;

    const uptime = Date.now() - this.performanceMonitor.startTime;
    const uptimeMinutes = Math.floor(uptime / 60000);
    
    this.logger.info(`📊 Performance Report (${uptimeMinutes}m uptime):`);
    
    // Tool call statistics
    if (this.performanceMonitor.toolCalls.size > 0) {
      this.logger.info('   Tool Call Performance:');
      for (const [tool, stats] of this.performanceMonitor.toolCalls.entries()) {
        const avgTime = stats.totalTime / stats.count;
        const lastCalledAgo = Math.floor((Date.now() - stats.lastCalled) / 1000);
        this.logger.info(`     ${tool}: ${stats.count} calls, ${avgTime.toFixed(1)}ms avg, last: ${lastCalledAgo}s ago`);
      }
    }

    // Memory usage
    const memUsage = process.memoryUsage();
    this.logger.info(`   Memory: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB heap`);
    
    // Cache statistics
    if (this.cache && typeof (this.cache as any).getStats === 'function') {
      const cacheStats = (this.cache as any).getStats();
      this.logger.info(`   Cache: ${cacheStats.size} entries, ${(cacheStats.hitRate * 100).toFixed(1)}% hit rate`);
    }

    // Active projects
    const tsAdapter = this.adapters.get('typescript') as any;
    if (tsAdapter?.projects?.size) {
      this.logger.info(`   Active Projects: ${tsAdapter.projects.size}`);
    }
  }

  private trackToolCall(toolName: string, duration: number): void {
    if (!this.performanceMonitor || !this.isDev) return;

    const existing = this.performanceMonitor.toolCalls.get(toolName) || {
      count: 0,
      totalTime: 0,
      lastCalled: 0,
    };

    existing.count++;
    existing.totalTime += duration;
    existing.lastCalled = Date.now();

    this.performanceMonitor.toolCalls.set(toolName, existing);
  }

  private initializeAdapters(): void {
    // Initialize TypeScript adapter
    const tsAdapter = new TypeScriptAdapter(this.cache, this.watcher, this.logger);
    this.adapters.set('typescript', tsAdapter);
    
    this.logger.info(`Registered ${this.adapters.size} language adapters`);
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async (): Promise<{ tools: Tool[] }> => {
      this.logger.debug('Listing available tools');
      return { tools: [...TOOLS] };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest): Promise<CallToolResult> => {
      const { name, arguments: args } = request.params;
      this.logger.debug(`Handling tool call: ${name}`);

      const startTime = this.isDev ? Date.now() : 0;

      try {
        const result = await this.handleToolCall(name, args || {});
        
        // Track performance in dev mode only
        if (this.isDev) {
          const duration = Date.now() - startTime;
          this.trackToolCall(name, duration);
          if (duration > 1000) { // Log slow calls
            this.logger.warn(`⚠️  Slow tool call: ${name} took ${duration}ms`);
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            } as TextContent,
          ],
        };
      } catch (error) {
        this.logger.error(`Tool call failed for ${name}:`, error);
        
        // Track failed calls in dev mode
        if (this.isDev) {
          const duration = Date.now() - startTime;
          this.trackToolCall(`${name}_failed`, duration);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error: error instanceof Error ? error.message : 'Unknown error',
                  tool: name,
                  args,
                },
                null,
                2
              ),
            } as TextContent,
          ],
        };
      }
    });
  }

  private async handleToolCall(toolName: string, args: Record<string, any>): Promise<any> {
    switch (toolName) {
      case 'index_project':
        return this.handleIndexProject(args);

      case 'get_type_inference':
        return this.handleGetTypeInference(args);

      case 'get_type_definition':
        return this.handleGetTypeDefinition(args);

      case 'find_symbol':
        return this.handleFindSymbol(args);

      case 'find_references':
        return this.handleFindReferences(args);

      case 'get_available_symbols':
        return this.handleGetAvailableSymbols(args);

      case 'get_module_info':
        return this.handleGetModuleInfo(args);

      case 'search_types':
        return this.handleSearchTypes(args);

      case 'get_diagnostics':
        return this.handleGetDiagnostics(args);

      case 'batch_type_analysis':
        return this.handleBatchTypeAnalysis(args);

      case 'clear_project_cache':
        return this.handleClearProjectCache(args);

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  private async handleIndexProject(args: Record<string, any>): Promise<ProjectAnalysisResponse> {
    const { projectPath, force = false } = args;
    this.logger.info(`Indexing project: ${projectPath} (force: ${force})`);

    try {
      const adapter = await this.getAdapterForProject(projectPath);
      const index = await adapter.indexProject(projectPath, force);

      return {
        success: true,
        projectPath: index.projectPath,
        fileCount: index.modules.size,
        symbolCount: Array.from(index.symbols.values()).reduce((sum, symbols) => sum + symbols.length, 0),
        typeCount: index.types.size,
        lastIndexed: index.lastIndexed,
      };
    } catch (error) {
      this.logger.error(`Failed to index project ${projectPath}:`, error);

      // Return error information instead of hiding it
      return {
        success: false,
        projectPath: projectPath,
        fileCount: 0,
        symbolCount: 0,
        typeCount: 0,
        lastIndexed: new Date(),
        errors: [error instanceof Error ? `${error.message}\n${error.stack}` : String(error)],
      };
    }
  }

  private async handleGetTypeInference(args: Record<string, any>): Promise<TypeInferenceResponse | null> {
    const { filePath, position, projectPath } = args;
    this.logger.debug(`Type inference: ${filePath}:${position}`);

    const adapter = await this.getAdapterForProject(projectPath);
    const result = await adapter.getTypeInference(filePath, position, projectPath);

    if (!result) {
      return null;
    }

    return {
      symbol: `${filePath}:${position}`,
      type: result.type,
      kind: result.kind,
      location: result.location,
      documentation: result.documentation,
      signature: result.callSignatures?.[0],
    };
  }

  private async handleGetTypeDefinition(args: Record<string, any>) {
    const { typeName, projectPath, contextFile } = args;
    this.logger.debug(`Type definition: ${typeName}`);

    const adapter = await this.getAdapterForProject(projectPath);
    const typeInfo = await adapter.getTypeDefinition(typeName, projectPath, contextFile);

    return typeInfo;
  }

  private async handleFindSymbol(args: Record<string, any>) {
    const { symbolName, projectPath, ...options } = args;
    this.logger.debug(`Find symbol: ${symbolName}`);

    const adapter = await this.getAdapterForProject(projectPath);
    const symbols = await adapter.findSymbol(symbolName, projectPath, { query: symbolName, ...options });

    return symbols;
  }

  private async handleFindReferences(args: Record<string, any>): Promise<SymbolNavigationResponse> {
    const { symbolName, filePath, projectPath } = args;
    this.logger.debug(`Find references: ${symbolName}`);

    const adapter = await this.getAdapterForProject(projectPath);
    const references = await adapter.findReferences(symbolName, filePath, projectPath);
    
    // Get symbol type information
    const symbols = await adapter.findSymbol(symbolName, projectPath, { query: symbolName, maxResults: 1 });
    const symbolType = symbols[0]?.type || 'unknown';
    const documentation = symbols[0]?.documentation;

    return {
      symbol: symbolName,
      definitions: references
        .filter(ref => ref.referenceType === 'definition')
        .map(ref => ref.location),
      references,
      type: symbolType,
      documentation,
    };
  }

  private async handleGetAvailableSymbols(args: Record<string, any>) {
    const { filePath, position, projectPath } = args;
    this.logger.debug(`Available symbols: ${filePath}:${position}`);

    const adapter = await this.getAdapterForProject(projectPath);
    const symbols = await adapter.getAvailableSymbols(filePath, position, projectPath);

    return symbols;
  }

  private async handleGetModuleInfo(args: Record<string, any>): Promise<ModuleAnalysisResponse | null> {
    const { modulePath, projectPath } = args;
    this.logger.debug(`Module info: ${modulePath}`);

    const adapter = await this.getAdapterForProject(projectPath);
    const moduleInfo = await adapter.getModuleInfo(modulePath, projectPath);

    if (!moduleInfo) {
      return null;
    }

    return {
      path: moduleInfo.path,
      exports: moduleInfo.exports,
      imports: moduleInfo.imports,
      dependencies: moduleInfo.dependencies,
    };
  }

  private async handleSearchTypes(args: Record<string, any>) {
    const { query, projectPath, ...options } = args;
    this.logger.debug(`Search types: ${query}`);

    const adapter = await this.getAdapterForProject(projectPath);
    const types = await adapter.searchTypes({ query, ...options } as any, projectPath);

    return types;
  }

  private async handleGetDiagnostics(args: Record<string, any>) {
    const { filePath, projectPath } = args;
    this.logger.debug(`Diagnostics: ${filePath}`);

    const adapter = await this.getAdapterForProject(projectPath);
    const diagnostics = await adapter.getDiagnostics(filePath, projectPath);

    return diagnostics;
  }

  private async handleBatchTypeAnalysis(args: Record<string, any>) {
    const { requests, projectPath } = args;
    this.logger.debug(`Batch analysis: ${requests.length} requests`);

    const results = [];
    
    for (const request of requests) {
      try {
        let result;
        switch (request.type) {
          case 'type_inference':
            result = await this.handleGetTypeInference({ ...request.params, projectPath });
            break;
          case 'type_definition':
            result = await this.handleGetTypeDefinition({ ...request.params, projectPath });
            break;
          case 'symbol_search':
            result = await this.handleFindSymbol({ ...request.params, projectPath });
            break;
          default:
            throw new Error(`Unknown batch request type: ${request.type}`);
        }
        results.push({ success: true, data: result });
      } catch (error) {
        results.push({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return { results };
  }

  private async handleClearProjectCache(args: Record<string, any>) {
    const { projectPath } = args;
    this.logger.debug(`Clearing cache for project: ${projectPath}`);

    try {
      const adapter = await this.getAdapterForProject(projectPath);
      if (typeof (adapter as any).clearProjectDiskCache === 'function') {
        await (adapter as any).clearProjectDiskCache(projectPath);
        return `Cache cleared for project: ${projectPath}. Next indexing will rebuild from scratch.`;
      } else {
        throw new Error('Cache clearing not supported by this adapter');
      }
    } catch (error) {
      this.logger.error(`Failed to clear cache for ${projectPath}:`, error);
      throw new Error(`Failed to clear cache: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async getAdapterForProject(projectPath: string): Promise<LanguageAdapter> {
    // For now, always use TypeScript adapter
    // In the future, this could detect project type based on files
    const adapter = this.adapters.get('typescript');
    if (!adapter) {
      throw new Error('No TypeScript adapter available');
    }
    
    // Initialize adapter once if not already initialized
    if (!(adapter as any).isInitialized) {
      await adapter.initialize(projectPath);
    }
    
    return adapter;
  }

  async start(): Promise<void> {
    this.logger.info('Starting TypeRef MCP Server...');
    
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    this.logger.info('TypeRef MCP Server started and listening on stdio');
  }

  async stop(): Promise<void> {
    this.logger.info('Stopping TypeRef MCP Server...');
    
    // Stop performance monitoring
    if (this.performanceMonitor?.interval) {
      clearInterval(this.performanceMonitor.interval);
      if (this.isDev) {
        this.logger.info('🔧 Performance monitoring stopped');
        this.reportPerformanceStats(); // Final report
      }
    }
    
    // Cleanup adapters
    for (const adapter of this.adapters.values()) {
      if (typeof (adapter as any).cleanup === 'function') {
        (adapter as any).cleanup();
      }
      await adapter.dispose();
    }
    
    // Cleanup services
    if (this.watcher) {
      this.watcher.dispose();
    }
    
    // Cleanup cache
    if (typeof (this.cache as any).destroy === 'function') {
      (this.cache as any).destroy();
    } else {
      this.cache.clear();
    }
    
    this.logger.info('TypeRef MCP Server stopped');
  }
}