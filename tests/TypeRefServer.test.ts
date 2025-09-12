import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import { TypeRefServer } from '../src/server/TypeRefServer.js';
import { LogLevel } from '../src/interfaces.js';

describe('TypeRefServer Integration', () => {
  let server: TypeRefServer;
  let testProjectPath: string;

  beforeEach(async () => {
    server = new TypeRefServer({
      logLevel: LogLevel.Error, // Quiet during tests
      enableWatcher: false,
      maxCacheSize: 100
    });
    
    // Adapters are automatically initialized in constructor
    
    testProjectPath = path.resolve(__dirname, 'fixtures', 'sample-project');
    
    // Ensure test project exists
    const exists = await fs.access(testProjectPath).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });

  afterEach(async () => {
    await server.stop();
    
    // Clean up cache files
    const cacheDir = path.join(testProjectPath, '.typeref');
    try {
      await fs.rm(cacheDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it('should handle index_project tool call', async () => {
    const result = await (server as any).handleToolCall('index_project', {
      projectPath: testProjectPath,
      force: false
    });

    expect(result).toBeTruthy();
    expect(result.success).toBe(true);
    expect(result.fileCount).toBeGreaterThan(0);
    expect(result.symbolCount).toBeGreaterThan(0);
    expect(result.typeCount).toBeGreaterThan(0);
  });

  it('should handle get_type_inference tool call', async () => {
    // First index the project
    await (server as any).handleToolCall('index_project', {
      projectPath: testProjectPath,
      force: false
    });

    const filePath = path.join(testProjectPath, 'src', 'index.ts');
    const result = await (server as any).handleToolCall('get_type_inference', {
      filePath,
      position: 200,
      projectPath: testProjectPath
    });

    expect(result).toBeTruthy();
    if (result) {
      expect(result.type).toBeTruthy();
      expect(result.location).toBeTruthy();
    }
  });

  it('should handle get_type_definition tool call', async () => {
    // First index the project
    await (server as any).handleToolCall('index_project', {
      projectPath: testProjectPath,
      force: false
    });

    const result = await (server as any).handleToolCall('get_type_definition', {
      typeName: 'User',
      projectPath: testProjectPath
    });

    expect(result).toBeTruthy();
    expect(result.name).toBe('User');
    expect(result.kind).toBe('interface');
    expect(result.properties).toBeTruthy();
    expect(result.properties.length).toBeGreaterThan(0);
  });

  it('should handle find_symbol tool call', async () => {
    // First index the project
    await (server as any).handleToolCall('index_project', {
      projectPath: testProjectPath,
      force: false
    });

    const result = await (server as any).handleToolCall('find_symbol', {
      symbolName: 'UserService',
      projectPath: testProjectPath,
      kind: 'class',
      includePrivate: false,
      maxResults: 10
    });

    expect(result).toBeTruthy();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].name).toBe('UserService');
    expect(result[0].kind).toBe('class');
  });

  it('should handle search_types tool call', async () => {
    // First index the project
    await (server as any).handleToolCall('index_project', {
      projectPath: testProjectPath,
      force: false
    });

    const result = await (server as any).handleToolCall('search_types', {
      query: 'User',
      projectPath: testProjectPath,
      maxResults: 10
    });

    expect(result).toBeTruthy();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    
    const userType = result.find((t: any) => t.name === 'User');
    expect(userType).toBeTruthy();
  });

  it('should handle get_module_info tool call', async () => {
    // First index the project
    await (server as any).handleToolCall('index_project', {
      projectPath: testProjectPath,
      force: false
    });

    const modulePath = path.join(testProjectPath, 'src', 'index.ts');
    const result = await (server as any).handleToolCall('get_module_info', {
      modulePath,
      projectPath: testProjectPath
    });

    expect(result).toBeTruthy();
    expect(result.path).toBe(modulePath);
    expect(result.exports).toBeTruthy();
    expect(Array.isArray(result.exports)).toBe(true);
    expect(result.exports.length).toBeGreaterThan(0);
  });

  it('should handle get_diagnostics tool call', async () => {
    // First index the project
    await (server as any).handleToolCall('index_project', {
      projectPath: testProjectPath,
      force: false
    });

    const filePath = path.join(testProjectPath, 'src', 'index.ts');
    const result = await (server as any).handleToolCall('get_diagnostics', {
      filePath,
      projectPath: testProjectPath
    });

    expect(result).toBeTruthy();
    expect(Array.isArray(result)).toBe(true);
    
    // Should have no errors in our test file
    const errors = result.filter((d: any) => d.severity === 'error');
    expect(errors.length).toBe(0);
  });

  it('should handle get_available_symbols tool call', async () => {
    // First index the project
    await (server as any).handleToolCall('index_project', {
      projectPath: testProjectPath,
      force: false
    });

    const filePath = path.join(testProjectPath, 'src', 'index.ts');
    const result = await (server as any).handleToolCall('get_available_symbols', {
      filePath,
      position: 500,
      projectPath: testProjectPath
    });

    expect(result).toBeTruthy();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('should handle clear_project_cache tool call', async () => {
    // First index the project to create cache
    await (server as any).handleToolCall('index_project', {
      projectPath: testProjectPath,
      force: false
    });

    // Verify cache exists
    const cacheDir = path.join(testProjectPath, '.typeref');
    const cacheExists = await fs.access(cacheDir).then(() => true).catch(() => false);
    expect(cacheExists).toBe(true);

    // Clear cache
    const result = await (server as any).handleToolCall('clear_project_cache', {
      projectPath: testProjectPath
    });

    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
    expect(result).toContain('Cache cleared');

    // Verify cache is removed
    const cacheExistsAfter = await fs.access(cacheDir).then(() => true).catch(() => false);
    expect(cacheExistsAfter).toBe(false);
  });

  it('should handle batch_type_analysis tool call', async () => {
    // First index the project
    await (server as any).handleToolCall('index_project', {
      projectPath: testProjectPath,
      force: false
    });

    const requests = [
      {
        type: 'type_definition',
        params: { typeName: 'User' }
      },
      {
        type: 'type_definition',
        params: { typeName: 'Product' }
      }
    ];

    const result = await (server as any).handleToolCall('batch_type_analysis', {
      requests,
      projectPath: testProjectPath
    });

    expect(result).toBeTruthy();
    expect(result.results).toBeTruthy();
    expect(Array.isArray(result.results)).toBe(true);
    expect(result.results.length).toBe(2);
    
    // Both requests should succeed
    expect(result.results[0].success).toBe(true);
    expect(result.results[1].success).toBe(true);
    
    expect(result.results[0].data.name).toBe('User');
    expect(result.results[1].data.name).toBe('Product');
  });

  it('should auto-load from cache after restart simulation', async () => {
    // First index the project
    const indexResult = await (server as any).handleToolCall('index_project', {
      projectPath: testProjectPath,
      force: false
    });
    expect(indexResult.success).toBe(true);

    // Stop and restart server to simulate restart
    await server.stop();
    server = new TypeRefServer({
      logLevel: LogLevel.Error,
      enableWatcher: false,
      maxCacheSize: 100
    });

    // Query should auto-load from cache without explicit indexing
    const result = await (server as any).handleToolCall('find_symbol', {
      symbolName: 'User',
      projectPath: testProjectPath
    });

    expect(result).toBeTruthy();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].name).toBe('User');
  });

  it('should handle unknown tool gracefully', async () => {
    await expect((server as any).handleToolCall('unknown_tool', {})).rejects.toThrow('Unknown tool');
  });

  it('should handle invalid project path gracefully', async () => {
    const result = await (server as any).handleToolCall('index_project', {
      projectPath: '/non/existent/project'
    });
    
    // Should return empty results gracefully instead of throwing
    expect(result).toBeTruthy();
    expect(result.success).toBe(true);
    expect(result.fileCount).toBe(0);
    expect(result.symbolCount).toBe(0);
    expect(result.typeCount).toBe(0);
  });
});