import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import { DiskCache } from '../src/core/DiskCache.js';
import { ProjectIndex } from '../src/types.js';
import { LogLevel } from '../src/interfaces.js';

// Mock logger
const mockLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {}
};

describe('DiskCache', () => {
  let diskCache: DiskCache;
  let testProjectPath: string;
  let mockProjectIndex: ProjectIndex;

  beforeEach(async () => {
    diskCache = new DiskCache(mockLogger);
    testProjectPath = path.join(__dirname, 'fixtures', 'test-cache-project');
    
    // Create test project directory
    await fs.mkdir(testProjectPath, { recursive: true });
    await fs.mkdir(path.join(testProjectPath, 'src'), { recursive: true });
    
    // Create test TypeScript files
    await fs.writeFile(
      path.join(testProjectPath, 'src', 'test.ts'),
      'export interface TestType { id: number; name: string; }'
    );
    await fs.writeFile(
      path.join(testProjectPath, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { target: 'ES2020', strict: true },
        include: ['src/**/*']
      })
    );

    // Create mock project index
    mockProjectIndex = {
      projectPath: testProjectPath,
      symbols: new Map([
        ['TestType', [{
          name: 'TestType',
          kind: 'interface',
          location: {
            file: path.join(testProjectPath, 'src', 'test.ts'),
            line: 1,
            column: 1
          },
          isExported: true,
          documentation: 'Test interface'
        }]]
      ]),
      types: new Map([
        ['TestType', {
          name: 'TestType',
          kind: 'interface',
          properties: [
            { name: 'id', type: 'number', optional: false },
            { name: 'name', type: 'string', optional: false }
          ],
          location: {
            file: path.join(testProjectPath, 'src', 'test.ts'),
            line: 1,
            column: 1
          }
        }]
      ]),
      modules: new Map(),
      dependencies: new Map(),
      lastIndexed: new Date()
    };
  });

  afterEach(async () => {
    // Clean up test project and cache
    try {
      await fs.rm(testProjectPath, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it('should save and load project index correctly', async () => {
    // Save the project index
    await diskCache.saveProjectIndex(mockProjectIndex);

    // Load it back
    const loadedIndex = await diskCache.loadProjectIndex(testProjectPath);

    expect(loadedIndex).toBeTruthy();
    expect(loadedIndex!.projectPath).toBe(testProjectPath);
    expect(loadedIndex!.symbols.size).toBe(1);
    expect(loadedIndex!.types.size).toBe(1);
    
    // Check symbols
    const testTypeSymbols = loadedIndex!.symbols.get('TestType');
    expect(testTypeSymbols).toBeTruthy();
    expect(testTypeSymbols![0].name).toBe('TestType');
    expect(testTypeSymbols![0].kind).toBe('interface');
    
    // Check types
    const testType = loadedIndex!.types.get('TestType');
    expect(testType).toBeTruthy();
    expect(testType!.name).toBe('TestType');
    expect(testType!.properties).toHaveLength(2);
  });

  it('should validate cache correctly when files unchanged', async () => {
    // Save the project index
    await diskCache.saveProjectIndex(mockProjectIndex);

    // Cache should be valid immediately
    const isValid = await diskCache.isCacheValid(testProjectPath);
    expect(isValid).toBe(true);
  });

  it('should invalidate cache when files are modified', async () => {
    // Save the project index
    await diskCache.saveProjectIndex(mockProjectIndex);

    // Wait a bit and modify a file
    await new Promise(resolve => setTimeout(resolve, 100));
    await fs.writeFile(
      path.join(testProjectPath, 'src', 'test.ts'),
      'export interface TestType { id: number; name: string; modified: boolean; }'
    );

    // Cache should be invalid now
    const isValid = await diskCache.isCacheValid(testProjectPath);
    expect(isValid).toBe(false);
  });

  it('should invalidate cache when files are added', async () => {
    // Save the project index
    await diskCache.saveProjectIndex(mockProjectIndex);

    // Add a new TypeScript file
    await fs.writeFile(
      path.join(testProjectPath, 'src', 'new-file.ts'),
      'export const NEW_CONSTANT = "test";'
    );

    // Cache should be invalid due to new file
    const isValid = await diskCache.isCacheValid(testProjectPath);
    expect(isValid).toBe(false);
  });

  it('should clear project cache completely', async () => {
    // Save the project index
    await diskCache.saveProjectIndex(mockProjectIndex);

    // Verify cache files exist
    const cacheDir = path.join(testProjectPath, '.typeref');
    const cacheDirExists = await fs.access(cacheDir).then(() => true).catch(() => false);
    expect(cacheDirExists).toBe(true);

    // Clear cache
    await diskCache.clearProjectCache(testProjectPath);

    // Verify cache directory is removed
    const cacheDirExistsAfter = await fs.access(cacheDir).then(() => true).catch(() => false);
    expect(cacheDirExistsAfter).toBe(false);
  });

  it('should return null for non-existent cache', async () => {
    const loadedIndex = await diskCache.loadProjectIndex(testProjectPath);
    expect(loadedIndex).toBe(null);
  });

  it('should return false for non-existent cache validation', async () => {
    const isValid = await diskCache.isCacheValid(testProjectPath);
    expect(isValid).toBe(false);
  });
});