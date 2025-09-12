/**
 * Base abstract class for language adapters
 * Provides common functionality and enforces interface compliance
 */

import {
  LanguageAdapter,
  CacheManager,
  FileWatcher,
  Logger,
  DiagnosticInfo,
  FileChangeCallback,
  FileChangeType,
} from '../interfaces.js';
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
} from '../types.js';

export abstract class BaseLanguageAdapter implements LanguageAdapter {
  protected projectIndexes = new Map<string, ProjectIndex>();
  protected isInitialized = false;

  constructor(
    public readonly config: LanguageConfig,
    protected cache: CacheManager,
    protected watcher: FileWatcher,
    protected logger: Logger
  ) {}

  async initialize(projectPath: string): Promise<void> {
    this.logger.info(`Initializing ${this.config.name} adapter for project: ${projectPath}`);
    
    // Setup file watcher
    if (this.watcher) {
      const changeCallback: FileChangeCallback = (eventType, filePath) => {
        this.handleFileChange(eventType, filePath, projectPath);
      };
      this.watcher.watch(projectPath, changeCallback);
    }
    
    this.isInitialized = true;
  }

  abstract indexProject(projectPath: string, force?: boolean): Promise<ProjectIndex>;
  
  abstract getTypeInference(
    filePath: string,
    position: number,
    projectPath: string
  ): Promise<TypeInferenceResult | null>;
  
  abstract getTypeDefinition(
    typeName: string,
    projectPath: string,
    contextFile?: string
  ): Promise<TypeInfo | null>;
  
  abstract findSymbol(
    symbolName: string,
    projectPath: string,
    options?: SymbolSearchOptions
  ): Promise<SymbolInfo[]>;
  
  abstract findReferences(
    symbolName: string,
    filePath: string,
    projectPath: string
  ): Promise<ReferenceInfo[]>;
  
  abstract getAvailableSymbols(
    filePath: string,
    position: number,
    projectPath: string
  ): Promise<SymbolInfo[]>;
  
  abstract getModuleInfo(
    modulePath: string,
    projectPath: string
  ): Promise<ModuleInfo | null>;
  
  abstract searchTypes(
    options: TypeSearchOptions,
    projectPath: string
  ): Promise<TypeInfo[]>;
  
  abstract getDiagnostics(
    filePath: string,
    projectPath: string
  ): Promise<DiagnosticInfo[]>;

  async dispose(): Promise<void> {
    this.logger.info(`Disposing ${this.config.name} adapter`);
    
    // Stop file watchers
    if (this.watcher) {
      this.watcher.dispose();
    }
    
    // Clear project indexes
    this.projectIndexes.clear();
    
    // Clear cache entries for this adapter
    this.cache.invalidate(`${this.config.name}:*`);
    
    this.isInitialized = false;
  }

  // Protected helper methods

  protected getCacheKey(projectPath: string, operation: string, ...args: string[]): string {
    return `${this.config.name}:${projectPath}:${operation}:${args.join(':')}`;
  }

  protected getProjectIndex(projectPath: string): ProjectIndex | null {
    return this.projectIndexes.get(projectPath) || null;
  }

  protected setProjectIndex(projectPath: string, index: ProjectIndex): void {
    this.projectIndexes.set(projectPath, index);
  }

  protected async handleFileChange(
    eventType: FileChangeType,
    filePath: string,
    projectPath: string
  ): Promise<void> {
    this.logger.debug(`File ${eventType}: ${filePath}`);
    
    // Invalidate relevant cache entries
    this.cache.invalidate(`${this.config.name}:${projectPath}:*`);
    
    // Handle specific file changes
    switch (eventType) {
      case FileChangeType.Modified:
      case FileChangeType.Created:
        await this.handleFileUpdate(filePath, projectPath);
        break;
      case FileChangeType.Deleted:
        await this.handleFileDelete(filePath, projectPath);
        break;
    }
  }

  protected async handleFileUpdate(filePath: string, _projectPath: string): Promise<void> {
    // Subclasses can override for incremental updates
    this.logger.debug(`Handling file update: ${filePath}`);
  }

  protected async handleFileDelete(filePath: string, _projectPath: string): Promise<void> {
    // Subclasses can override for cleanup
    this.logger.debug(`Handling file deletion: ${filePath}`);
  }

  protected shouldIncludeFile(filePath: string): boolean {
    // Check if file matches supported extensions
    const ext = this.getFileExtension(filePath);
    if (!this.config.fileExtensions.includes(ext)) {
      return false;
    }

    // Check exclude patterns
    for (const pattern of this.config.excludePatterns) {
      if (this.matchesPattern(filePath, pattern)) {
        return false;
      }
    }

    return true;
  }

  protected getFileExtension(filePath: string): string {
    const lastDot = filePath.lastIndexOf('.');
    return lastDot >= 0 ? filePath.substring(lastDot) : '';
  }

  protected matchesPattern(filePath: string, pattern: string): boolean {
    // Simple glob-like pattern matching
    const regex = new RegExp(
      pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.')
    );
    return regex.test(filePath);
  }

  protected validateProjectPath(projectPath: string): void {
    if (!projectPath) {
      throw new Error('Project path is required');
    }
    
    if (!this.isInitialized) {
      throw new Error('Adapter not initialized. Call initialize() first.');
    }
  }
}