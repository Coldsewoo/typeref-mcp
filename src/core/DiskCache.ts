/**
 * Persistent disk-based cache for project indexes
 * Saves indexed data to disk and loads on startup for instant access
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { ProjectIndex } from '../types.js';
import { Logger } from '../interfaces.js';

export interface ProjectCacheMetadata {
  projectPath: string;
  lastIndexed: Date;
  fileCount: number;
  fileHashes: Map<string, string>; // filePath -> modification time hash
  version: string; // Cache version for compatibility
}

export class DiskCache {
  private readonly CACHE_VERSION = '1.0.0';
  private readonly CACHE_DIR = '.typeref';
  
  constructor(private logger: Logger) {}

  /**
   * Get cache file path for a project
   */
  private getCacheFilePath(projectPath: string): string {
    const projectHash = this.hashPath(projectPath);
    return path.join(projectPath, this.CACHE_DIR, `${projectHash}.json`);
  }

  private getMetadataFilePath(projectPath: string): string {
    const projectHash = this.hashPath(projectPath);
    return path.join(projectPath, this.CACHE_DIR, `${projectHash}.meta.json`);
  }

  /**
   * Create a simple hash from project path
   */
  private hashPath(projectPath: string): string {
    return Buffer.from(projectPath).toString('base64').replace(/[/+=]/g, '_').substring(0, 16);
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
          // File might have been deleted, skip
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
        // Directory might not be accessible, skip
        this.logger.debug(`Could not scan directory ${dirPath}: ${error}`);
      }
    };
    
    await scanDir(projectPath);
    return files;
  }

  /**
   * Check if cached index is still valid
   */
  async isCacheValid(projectPath: string): Promise<boolean> {
    try {
      const metadataPath = this.getMetadataFilePath(projectPath);
      const cacheFilePath = this.getCacheFilePath(projectPath);
      
      // Check if cache files exist
      await fs.access(metadataPath);
      await fs.access(cacheFilePath);
      
      // Load metadata
      const metadataContent = await fs.readFile(metadataPath, 'utf8');
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
   * Load project index from disk cache
   */
  async loadProjectIndex(projectPath: string): Promise<ProjectIndex | null> {
    try {
      const cacheFilePath = this.getCacheFilePath(projectPath);
      const content = await fs.readFile(cacheFilePath, 'utf8');
      const data = JSON.parse(content);
      
      // Reconstruct Maps from plain objects
      const index: ProjectIndex = {
        projectPath: data.projectPath,
        symbols: new Map(Object.entries(data.symbols)),
        types: new Map(Object.entries(data.types)),
        modules: new Map(Object.entries(data.modules)),
        dependencies: new Map(Object.entries(data.dependencies)),
        lastIndexed: new Date(data.lastIndexed),
      };
      
      this.logger.info(`Loaded cached index for ${projectPath}: ${index.symbols.size} symbols, ${index.types.size} types`);
      return index;
      
    } catch (error) {
      this.logger.debug(`Failed to load cached index for ${projectPath}: ${error}`);
      return null;
    }
  }

  /**
   * Save project index to disk cache
   */
  async saveProjectIndex(index: ProjectIndex): Promise<void> {
    try {
      const projectPath = index.projectPath;
      const cacheDir = path.join(projectPath, this.CACHE_DIR);
      
      // Ensure cache directory exists
      await fs.mkdir(cacheDir, { recursive: true });
      
      const cacheFilePath = this.getCacheFilePath(projectPath);
      const metadataPath = this.getMetadataFilePath(projectPath);
      
      // Convert Maps to plain objects for JSON serialization
      const serializable = {
        projectPath: index.projectPath,
        symbols: Object.fromEntries(index.symbols),
        types: Object.fromEntries(index.types),
        modules: Object.fromEntries(index.modules),
        dependencies: Object.fromEntries(index.dependencies),
        lastIndexed: index.lastIndexed.toISOString(),
      };
      
      // Save index data
      await fs.writeFile(cacheFilePath, JSON.stringify(serializable, null, 2));
      
      // Save metadata
      const fileHashes = await this.getFileHashes(projectPath);
      const metadata: ProjectCacheMetadata = {
        projectPath,
        lastIndexed: index.lastIndexed,
        fileCount: fileHashes.size,
        fileHashes,
        version: this.CACHE_VERSION,
      };
      
      await fs.writeFile(metadataPath, JSON.stringify({
        ...metadata,
        fileHashes: Object.fromEntries(metadata.fileHashes)
      }, null, 2));
      
      this.logger.info(`Saved index cache for ${projectPath}: ${index.symbols.size} symbols, ${index.types.size} types`);
      
    } catch (error) {
      this.logger.error(`Failed to save index cache for ${index.projectPath}: ${error}`);
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