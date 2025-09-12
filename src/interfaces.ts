/**
 * Core interfaces for the extensible language adapter system
 */

import {
  SymbolInfo,
  TypeInfo,
  ReferenceInfo,
  ModuleInfo,
  ProjectIndex,
  TypeInferenceResult,
  SymbolSearchOptions,
  TypeSearchOptions,
  LanguageConfig,
} from './types.js';

/**
 * Base interface for language adapters
 * Enables support for multiple typed languages
 */
export interface LanguageAdapter {
  readonly config: LanguageConfig;
  
  /**
   * Initialize the adapter for a specific project
   */
  initialize(projectPath: string): Promise<void>;
  
  /**
   * Index a project and build symbol/type tables
   */
  indexProject(projectPath: string, force?: boolean): Promise<ProjectIndex>;
  
  /**
   * Get type information for a symbol at a specific location
   */
  getTypeInference(
    filePath: string,
    position: number,
    projectPath: string
  ): Promise<TypeInferenceResult | null>;
  
  /**
   * Get complete type definition for a named type
   */
  getTypeDefinition(
    typeName: string,
    projectPath: string,
    contextFile?: string
  ): Promise<TypeInfo | null>;
  
  /**
   * Find symbol information by name
   */
  findSymbol(
    symbolName: string,
    projectPath: string,
    options?: SymbolSearchOptions
  ): Promise<SymbolInfo[]>;
  
  /**
   * Find all references to a symbol
   */
  findReferences(
    symbolName: string,
    filePath: string,
    projectPath: string
  ): Promise<ReferenceInfo[]>;
  
  /**
   * Get available symbols in a specific context/scope
   */
  getAvailableSymbols(
    filePath: string,
    position: number,
    projectPath: string
  ): Promise<SymbolInfo[]>;
  
  /**
   * Get module exports and metadata
   */
  getModuleInfo(
    modulePath: string,
    projectPath: string
  ): Promise<ModuleInfo | null>;
  
  /**
   * Search for types/interfaces by query
   */
  searchTypes(
    options: TypeSearchOptions,
    projectPath: string
  ): Promise<TypeInfo[]>;
  
  /**
   * Get diagnostics/errors for a file
   */
  getDiagnostics(
    filePath: string,
    projectPath: string
  ): Promise<DiagnosticInfo[]>;
  
  /**
   * Cleanup resources
   */
  dispose(): Promise<void>;
}

/**
 * Cache manager interface for performance optimization
 */
export interface CacheManager {
  /**
   * Get cached data
   */
  get<T>(key: string): T | null;
  
  /**
   * Set cached data with TTL
   */
  set<T>(key: string, data: T, ttl?: number): void;
  
  /**
   * Invalidate cache entries
   */
  invalidate(pattern: string): void;
  
  /**
   * Clear all cache
   */
  clear(): void;
  
  /**
   * Get cache statistics
   */
  getStats(): CacheStats;
}

/**
 * File watcher interface for incremental updates
 */
export interface FileWatcher {
  /**
   * Start watching a directory
   */
  watch(path: string, callback: FileChangeCallback): void;
  
  /**
   * Stop watching a directory
   */
  unwatch(path: string): void;
  
  /**
   * Stop all watchers
   */
  dispose(): void;
}

/**
 * Project manager interface for handling multiple projects
 */
export interface ProjectManager {
  /**
   * Register a project for management
   */
  addProject(projectPath: string): Promise<void>;
  
  /**
   * Remove a project
   */
  removeProject(projectPath: string): Promise<void>;
  
  /**
   * Get project index
   */
  getProject(projectPath: string): ProjectIndex | null;
  
  /**
   * Check if project is indexed
   */
  isProjectIndexed(projectPath: string): boolean;
  
  /**
   * Get all managed projects
   */
  getProjects(): string[];
  
  /**
   * Refresh a project's index
   */
  refreshProject(projectPath: string): Promise<void>;
}

// Additional interfaces

export interface DiagnosticInfo {
  filePath: string;
  line: number;
  column: number;
  message: string;
  severity: DiagnosticSeverity;
  code?: string | number;
  source?: string;
}

export enum DiagnosticSeverity {
  Error = 'error',
  Warning = 'warning',
  Information = 'information',
  Hint = 'hint',
}

export interface FileChangeCallback {
  (eventType: FileChangeType, filePath: string): void;
}

export enum FileChangeType {
  Created = 'created',
  Modified = 'modified',
  Deleted = 'deleted',
}

export interface CacheStats {
  size: number;
  hitRate: number;
  missRate: number;
  evictions: number;
}

/**
 * MCP Tool Handler interface
 */
export interface ToolHandler {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  
  handle(args: Record<string, any>): Promise<any>;
}

/**
 * Configuration interface
 */
export interface TypeRefConfig {
  maxCacheSize: number;
  cacheTTL: number;
  maxProjectSize: number;
  enableWatcher: boolean;
  excludePatterns: string[];
  logLevel: LogLevel;
}

export enum LogLevel {
  Error = 'error',
  Warn = 'warn',
  Info = 'info',
  Debug = 'debug',
}

/**
 * Logger interface
 */
export interface Logger {
  error(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  debug(message: string, ...args: any[]): void;
}