/**
 * Enhanced Parquet-based cache for project indexes
 * Uses compressed Parquet files for efficient storage and fast loading
 * Organized structure inspired by .serena project layout
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { parquetRead } from 'hyparquet';
// @ts-ignore - asyncBufferFromFile exists in hyparquet node version
import { asyncBufferFromFile } from 'hyparquet';
// @ts-ignore - parquetWriteFile exists in hyparquet-writer node version
import { parquetWriteFile } from 'hyparquet-writer';
import { ProjectIndex, SymbolInfo, TypeInfo, ModuleInfo } from '../types.js';
import { Logger } from '../interfaces.js';

export interface ProjectCacheMetadata {
  projectPath: string;
  lastIndexed: Date;
  fileCount: number;
  fileHashes: Map<string, string>; // filePath -> modification time hash
  version: string; // Cache version for compatibility
  cacheFormat: 'parquet'; // Always parquet for this implementation
}

export interface ProjectConfig {
  projectName: string;
  language: 'typescript';
  version: string;
  lastIndexed: string;
  fileCount: number;
  symbolCount: number;
  typeCount: number;
}

export class ParquetCache {
  private readonly CACHE_VERSION = '1.0.0';
  private readonly CACHE_DIR = '.typeref';
  private readonly TYPESCRIPT_CACHE_DIR = 'cache/typescript';
  private readonly METADATA_DIR = 'cache/metadata';
  private readonly LOGS_DIR = 'logs';
  
  constructor(private logger: Logger) {}

  /**
   * Initialize project structure on first use
   */
  async initializeProjectStructure(projectPath: string): Promise<void> {
    const typerefDir = path.join(projectPath, this.CACHE_DIR);
    
    // Create directory structure
    const dirs = [
      typerefDir,
      path.join(typerefDir, 'cache'),
      path.join(typerefDir, this.TYPESCRIPT_CACHE_DIR),
      path.join(typerefDir, this.METADATA_DIR),
      path.join(typerefDir, this.LOGS_DIR),
    ];

    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }

    // Create .gitignore
    const gitignorePath = path.join(typerefDir, '.gitignore');
    const gitignoreContent = `# TypeRef cache files
/cache/
/logs/
*.log
*.tmp
`;
    
    try {
      await fs.access(gitignorePath);
    } catch {
      await fs.writeFile(gitignorePath, gitignoreContent);
    }

    // Create project.yml
    const projectName = path.basename(projectPath);
    const projectConfigPath = path.join(typerefDir, 'project.yml');
    const projectConfig = `# TypeRef MCP Project Configuration
project_name: "${projectName}"
language: typescript
version: "${this.CACHE_VERSION}"
created: "${new Date().toISOString()}"

# Cache configuration
cache:
  format: parquet
  compression: snappy
  version: "${this.CACHE_VERSION}"

# File patterns to ignore (follows .gitignore syntax)
ignored_paths:
  - "node_modules/**"
  - "dist/**" 
  - "build/**"
  - ".git/**"
  - "coverage/**"
  - "**/*.d.ts"
`;

    try {
      await fs.access(projectConfigPath);
    } catch {
      await fs.writeFile(projectConfigPath, projectConfig);
    }

    this.logger.info(`Initialized TypeRef project structure at ${typerefDir}`);
  }

  /**
   * Get cache file paths for different data types
   */
  private getCacheFilePaths(projectPath: string) {
    const baseDir = path.join(projectPath, this.CACHE_DIR, this.TYPESCRIPT_CACHE_DIR);
    const metaDir = path.join(projectPath, this.CACHE_DIR, this.METADATA_DIR);
    
    return {
      symbols: path.join(baseDir, `symbols_v${this.CACHE_VERSION}.parquet`),
      types: path.join(baseDir, `types_v${this.CACHE_VERSION}.parquet`),
      modules: path.join(baseDir, `modules_v${this.CACHE_VERSION}.parquet`),
      dependencies: path.join(baseDir, `dependencies_v${this.CACHE_VERSION}.parquet`),
      fileHashes: path.join(metaDir, `file_hashes_v${this.CACHE_VERSION}.json`),
      projectInfo: path.join(metaDir, `project_info_v${this.CACHE_VERSION}.json`),
    };
  }


  /**
   * Get file modification times for all TypeScript files
   */
  private async getFileHashes(projectPath: string): Promise<Map<string, string>> {
    const fileHashes = new Map<string, string>();
    
    try {
      const files = await this.findTypeScriptFiles(projectPath);
      
      for (const filePath of files) {
        try {
          const stats = await fs.stat(filePath);
          fileHashes.set(filePath, stats.mtime.toISOString());
        } catch (error) {
          this.logger.debug(`Could not stat file ${filePath}: ${error}`);
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to get file hashes for ${projectPath}: ${error}`);
    }
    
    return fileHashes;
  }

  /**
   * Find all TypeScript files in a project
   */
  private async findTypeScriptFiles(projectPath: string): Promise<string[]> {
    const files: string[] = [];
    const excludeDirs = ['node_modules', 'dist', 'build', '.git', 'coverage'];
    
    const scanDir = async (dirPath: string) => {
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          
          if (entry.isDirectory()) {
            if (!excludeDirs.includes(entry.name)) {
              await scanDir(fullPath);
            }
          } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
            files.push(fullPath);
          }
        }
      } catch (error) {
        this.logger.debug(`Could not scan directory ${dirPath}: ${error}`);
      }
    };
    
    await scanDir(projectPath);
    return files;
  }

  /**
   * Convert symbols map to array format for Parquet storage
   */
  private symbolsToParquetData(symbols: Map<string, SymbolInfo[]>): any[] {
    const data: any[] = [];
    
    for (const [symbolName, symbolInfos] of symbols) {
      for (const symbolInfo of symbolInfos) {
        data.push({
          symbolName,
          name: symbolInfo.name,
          kind: symbolInfo.kind,
          type: symbolInfo.type,
          location: JSON.stringify(symbolInfo.location),
          documentation: symbolInfo.documentation || null,
          isExported: symbolInfo.isExported,
          module: symbolInfo.module || null,
          signature: symbolInfo.signature || null,
        });
      }
    }
    
    return data;
  }

  /**
   * Convert types map to array format for Parquet storage
   */
  private typesToParquetData(types: Map<string, TypeInfo>): any[] {
    const data: any[] = [];
    
    for (const [typeName, typeInfo] of types) {
      data.push({
        typeName,
        name: typeInfo.name,
        kind: typeInfo.kind,
        properties: JSON.stringify(typeInfo.properties),
        methods: typeInfo.methods ? JSON.stringify(typeInfo.methods) : null,
        extends: typeInfo.extends ? JSON.stringify(typeInfo.extends) : null,
        implements: typeInfo.implements ? JSON.stringify(typeInfo.implements) : null,
        location: JSON.stringify(typeInfo.location),
        documentation: typeInfo.documentation || null,
        typeParameters: typeInfo.typeParameters ? JSON.stringify(typeInfo.typeParameters) : null,
      });
    }
    
    return data;
  }

  /**
   * Convert modules map to array format for Parquet storage  
   */
  private modulesToParquetData(modules: Map<string, ModuleInfo>): any[] {
    const data: any[] = [];
    
    for (const [modulePath, moduleInfo] of modules) {
      data.push({
        modulePath,
        path: moduleInfo.path,
        exports: JSON.stringify(moduleInfo.exports),
        imports: JSON.stringify(moduleInfo.imports),
        dependencies: JSON.stringify(moduleInfo.dependencies),
      });
    }
    
    return data;
  }

  /**
   * Convert dependencies map to array format for Parquet storage
   */
  private dependenciesToParquetData(dependencies: Map<string, string[]>): any[] {
    const data: any[] = [];
    
    for (const [fromModule, toModules] of dependencies) {
      data.push({
        fromModule,
        toModules: JSON.stringify(toModules),
      });
    }
    
    return data;
  }

  /**
   * Save project index to Parquet files
   */
  async saveProjectIndex(index: ProjectIndex): Promise<void> {
    try {
      const projectPath = index.projectPath;
      
      // Initialize project structure
      await this.initializeProjectStructure(projectPath);
      
      const cachePaths = this.getCacheFilePaths(projectPath);

      this.logger.info(`Saving index to Parquet files: ${Object.keys(cachePaths).length} files`);

      // Convert Maps to Parquet-friendly arrays
      const symbolsData = this.symbolsToParquetData(index.symbols);
      const typesData = this.typesToParquetData(index.types);
      const modulesData = this.modulesToParquetData(index.modules);
      const dependenciesData = this.dependenciesToParquetData(index.dependencies);

      // Write Parquet files using hyparquet-writer
      await Promise.all([
        this.writeParquetFile(cachePaths.symbols, symbolsData),
        this.writeParquetFile(cachePaths.types, typesData),
        this.writeParquetFile(cachePaths.modules, modulesData),
        this.writeParquetFile(cachePaths.dependencies, dependenciesData),
      ]);

      // Save metadata files
      const fileHashes = await this.getFileHashes(projectPath);
      const metadata: ProjectCacheMetadata = {
        projectPath,
        lastIndexed: index.lastIndexed,
        fileCount: fileHashes.size,
        fileHashes,
        version: this.CACHE_VERSION,
        cacheFormat: 'parquet',
      };

      const projectInfo: ProjectConfig = {
        projectName: path.basename(projectPath),
        language: 'typescript',
        version: this.CACHE_VERSION,
        lastIndexed: index.lastIndexed.toISOString(),
        fileCount: fileHashes.size,
        symbolCount: symbolsData.length,
        typeCount: typesData.length,
      };

      await fs.writeFile(
        cachePaths.fileHashes,
        JSON.stringify({
          ...metadata,
          fileHashes: Object.fromEntries(metadata.fileHashes)
        }, null, 2)
      );

      await fs.writeFile(
        cachePaths.projectInfo,
        JSON.stringify(projectInfo, null, 2)
      );

      this.logger.info(
        `Saved Parquet cache for ${projectPath}: ${symbolsData.length} symbols, ${typesData.length} types, ${modulesData.length} modules`
      );
      
    } catch (error) {
      this.logger.error(`Failed to save Parquet cache for ${index.projectPath}: ${error}`);
      throw error;
    }
  }

  /**
   * Write data to Parquet file using hyparquet-writer
   */
  private async writeParquetFile(filePath: string, data: any[]): Promise<void> {
    if (data.length === 0) {
      this.logger.debug(`Skipping empty data for ${filePath}`);
      return;
    }

    try {
      // Ensure directory exists
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });

      // Convert data array to column format for hyparquet-writer
      if (data.length === 0) return;
      
      const columns = Object.keys(data[0]);
      const columnData = columns.map(columnName => ({
        name: columnName,
        data: data.map(row => row[columnName])
      }));

      // Write to Parquet format using parquetWriteFile
      await parquetWriteFile({
        filename: filePath,
        columnData
      });
      
      this.logger.debug(`Written ${data.length} records to ${filePath}`);
    } catch (error) {
      this.logger.error(`Failed to write Parquet file ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Check if cached index is still valid
   */
  async isCacheValid(projectPath: string): Promise<boolean> {
    try {
      const cachePaths = this.getCacheFilePaths(projectPath);
      
      // Check if all cache files exist
      await Promise.all([
        fs.access(cachePaths.symbols),
        fs.access(cachePaths.types),
        fs.access(cachePaths.modules),
        fs.access(cachePaths.dependencies),
        fs.access(cachePaths.fileHashes),
        fs.access(cachePaths.projectInfo),
      ]);

      // Load and validate metadata
      const metadataContent = await fs.readFile(cachePaths.fileHashes, 'utf8');
      const metadata: ProjectCacheMetadata = JSON.parse(metadataContent);

      // Check version compatibility
      if (metadata.version !== this.CACHE_VERSION) {
        this.logger.info(`Cache version mismatch for ${projectPath}, invalidating`);
        return false;
      }

      // Check if files have changed
      const currentFileHashes = await this.getFileHashes(projectPath);
      const cachedFileHashes = new Map(Object.entries(metadata.fileHashes));

      // Quick check: different number of files
      if (currentFileHashes.size !== cachedFileHashes.size) {
        this.logger.info(`File count changed for ${projectPath} (${cachedFileHashes.size} → ${currentFileHashes.size}), invalidating cache`);
        return false;
      }

      // Check individual files
      for (const [filePath, currentHash] of currentFileHashes) {
        const cachedHash = cachedFileHashes.get(filePath);
        if (!cachedHash || cachedHash !== currentHash) {
          this.logger.info(`File modified: ${filePath}, invalidating cache`);
          return false;
        }
      }

      this.logger.info(`Cache is valid for ${projectPath} (${currentFileHashes.size} files)`);
      return true;
      
    } catch (error) {
      this.logger.debug(`Cache validation failed for ${projectPath}: ${error}`);
      return false;
    }
  }

  /**
   * Load project index from Parquet files
   */
  async loadProjectIndex(projectPath: string): Promise<ProjectIndex | null> {
    try {
      const cachePaths = this.getCacheFilePaths(projectPath);
      
      this.logger.info(`Loading index from Parquet files: ${projectPath}`);

      // Load all Parquet files in parallel
      const [symbolsData, typesData, modulesData, dependenciesData, projectInfo] = await Promise.all([
        this.readParquetFile(cachePaths.symbols),
        this.readParquetFile(cachePaths.types),
        this.readParquetFile(cachePaths.modules),
        this.readParquetFile(cachePaths.dependencies),
        fs.readFile(cachePaths.projectInfo, 'utf8').then(content => JSON.parse(content) as ProjectConfig),
      ]);

      // Convert back to Map structures
      const symbols = new Map<string, SymbolInfo[]>();
      const types = new Map<string, TypeInfo>();
      const modules = new Map<string, ModuleInfo>();
      const dependencies = new Map<string, string[]>();

      // Reconstruct symbols map
      for (const row of symbolsData) {
        const symbolName = row.symbolName;
        const symbolInfo: SymbolInfo = {
          name: row.name,
          kind: row.kind,
          type: row.type,
          location: JSON.parse(row.location),
          documentation: row.documentation,
          isExported: row.isExported,
          module: row.module,
          signature: row.signature,
        };

        if (!symbols.has(symbolName)) {
          symbols.set(symbolName, []);
        }
        symbols.get(symbolName)!.push(symbolInfo);
      }

      // Reconstruct types map
      for (const row of typesData) {
        const typeInfo: TypeInfo = {
          name: row.name,
          kind: row.kind,
          properties: JSON.parse(row.properties),
          methods: row.methods ? JSON.parse(row.methods) : undefined,
          extends: row.extends ? JSON.parse(row.extends) : undefined,
          implements: row.implements ? JSON.parse(row.implements) : undefined,
          location: JSON.parse(row.location),
          documentation: row.documentation,
          typeParameters: row.typeParameters ? JSON.parse(row.typeParameters) : undefined,
        };
        types.set(row.typeName, typeInfo);
      }

      // Reconstruct modules map
      for (const row of modulesData) {
        const moduleInfo: ModuleInfo = {
          path: row.path,
          exports: JSON.parse(row.exports),
          imports: JSON.parse(row.imports),
          dependencies: JSON.parse(row.dependencies),
        };
        modules.set(row.modulePath, moduleInfo);
      }

      // Reconstruct dependencies map
      for (const row of dependenciesData) {
        dependencies.set(row.fromModule, JSON.parse(row.toModules));
      }

      const index: ProjectIndex = {
        projectPath,
        symbols,
        types,
        modules,
        dependencies,
        lastIndexed: new Date(projectInfo.lastIndexed),
      };

      this.logger.info(
        `Loaded Parquet cache for ${projectPath}: ${symbols.size} symbol groups, ${types.size} types, ${modules.size} modules`
      );
      
      return index;
      
    } catch (error) {
      this.logger.debug(`Failed to load Parquet cache for ${projectPath}: ${error}`);
      return null;
    }
  }

  /**
   * Read data from Parquet file using hyparquet
   */
  private async readParquetFile(filePath: string): Promise<any[]> {
    try {
      // Create AsyncBuffer from file
      const file = await asyncBufferFromFile(filePath);
      const results: any[] = [];
      
      // Read Parquet file using hyparquet
      await parquetRead({
        file,
        onComplete: (data: any[]) => {
          results.push(...data);
        }
      });
      
      return results;
    } catch (error) {
      this.logger.error(`Failed to read Parquet file ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Clear cache for a project
   */
  async clearProjectCache(projectPath: string): Promise<void> {
    try {
      const cacheDir = path.join(projectPath, this.CACHE_DIR);
      await fs.rm(cacheDir, { recursive: true, force: true });
      this.logger.info(`Cleared cache for ${projectPath}`);
    } catch (error) {
      this.logger.debug(`Failed to clear cache for ${projectPath}: ${error}`);
    }
  }
}