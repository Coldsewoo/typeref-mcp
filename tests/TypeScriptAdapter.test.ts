import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import { TypeScriptAdapter } from '../src/adapters/TypeScriptAdapter.js';
import { LogLevel } from '../src/interfaces.js';

// Mock logger and watcher
const mockLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {}
};

const mockWatcher = {
  watch: () => {},
  dispose: () => {}
};

const mockCache = {
  get: () => undefined,
  set: () => {},
  delete: () => {},
  clear: () => {},
  has: () => false,
  size: 0,
  invalidate: () => {}
};

describe('TypeScriptAdapter', () => {
  let adapter: TypeScriptAdapter;
  let testProjectPath: string;

  beforeEach(async () => {
    adapter = new TypeScriptAdapter(mockCache as any, mockWatcher as any, mockLogger as any);
    await adapter.initialize(path.resolve(__dirname, 'fixtures', 'sample-project')); 
    testProjectPath = path.resolve(__dirname, 'fixtures', 'sample-project');
    
    // Ensure test project exists (already created in fixtures)
    const exists = await fs.access(testProjectPath).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });

  afterEach(async () => {
    await adapter.dispose();
    
    // Clean up any cache files
    const cacheDir = path.join(testProjectPath, '.typeref');
    try {
      await fs.rm(cacheDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it('should index a TypeScript project successfully', async () => {
    const index = await adapter.indexProject(testProjectPath);
    
    expect(index).toBeTruthy();
    expect(index.projectPath).toBe(testProjectPath);
    expect(index.symbols.size).toBeGreaterThan(0);
    expect(index.types.size).toBeGreaterThan(0);
    
    // Check for expected symbols
    expect(index.symbols.has('User')).toBe(true);
    expect(index.symbols.has('UserService')).toBe(true);
    expect(index.symbols.has('Status')).toBe(true);
    
    // Check for expected types
    expect(index.types.has('User')).toBe(true);
    expect(index.types.has('Product')).toBe(true);
  });

  it('should auto-load from cache on subsequent queries', async () => {
    // First, index the project
    await adapter.indexProject(testProjectPath);
    
    // Dispose and create new adapter to simulate restart
    await adapter.dispose();
    adapter = new TypeScriptAdapter(mockLogger, 100);
    
    // Query should auto-load from cache
    const symbols = await adapter.findSymbol('User', testProjectPath);
    expect(symbols).toBeTruthy();
    expect(symbols.length).toBeGreaterThan(0);
    expect(symbols[0].name).toBe('User');
  });

  it('should get type inference at specific position', async () => {
    const filePath = path.join(testProjectPath, 'src', 'index.ts');
    const position = 200; // Around where User interface is defined
    
    const typeInfo = await adapter.getTypeInference(filePath, position, testProjectPath);
    expect(typeInfo).toBeTruthy();
    expect(typeInfo!.type).toBeTruthy();
  });

  it('should get type definition for known types', async () => {
    const typeInfo = await adapter.getTypeDefinition('User', testProjectPath);
    
    expect(typeInfo).toBeTruthy();
    expect(typeInfo!.name).toBe('User');
    expect(typeInfo!.kind).toBe('interface');
    expect(typeInfo!.properties).toBeTruthy();
    expect(typeInfo!.properties!.length).toBeGreaterThan(0);
    
    // Check for expected properties
    const propertyNames = typeInfo!.properties!.map(p => p.name);
    expect(propertyNames).toContain('id');
    expect(propertyNames).toContain('name');
    expect(propertyNames).toContain('email');
    expect(propertyNames).toContain('isActive');
  });

  it('should find symbols with filters', async () => {
    const interfaceSymbols = await adapter.findSymbol('User', testProjectPath, { 
      kind: 'interface',
      includePrivate: false,
      maxResults: 10
    });
    
    expect(interfaceSymbols).toBeTruthy();
    expect(interfaceSymbols.length).toBeGreaterThan(0);
    expect(interfaceSymbols[0].kind).toBe('interface');
  });

  it('should search types by query', async () => {
    const types = await adapter.searchTypes({ query: 'User' }, testProjectPath);
    
    expect(types).toBeTruthy();
    expect(types.length).toBeGreaterThan(0);
    
    const userType = types.find(t => t.name === 'User');
    expect(userType).toBeTruthy();
  });

  it('should get module information', async () => {
    const modulePath = path.join(testProjectPath, 'src', 'index.ts');
    const moduleInfo = await adapter.getModuleInfo(modulePath, testProjectPath);
    
    expect(moduleInfo).toBeTruthy();
    expect(moduleInfo!.path).toBe(modulePath);
    expect(moduleInfo!.exports).toBeTruthy();
    expect(moduleInfo!.exports.length).toBeGreaterThan(0);
    
    // Check for expected exports
    const exportNames = moduleInfo!.exports.map(e => e.name);
    expect(exportNames).toContain('User');
    expect(exportNames).toContain('UserService');
    expect(exportNames).toContain('Status');
  });

  it('should get diagnostics for files', async () => {
    const filePath = path.join(testProjectPath, 'src', 'index.ts');
    const diagnostics = await adapter.getDiagnostics(filePath, testProjectPath);
    
    expect(diagnostics).toBeTruthy();
    expect(Array.isArray(diagnostics)).toBe(true);
    // Should have no errors in our test file
    const errors = diagnostics.filter(d => d.severity === 'error');
    expect(errors.length).toBe(0);
  });

  it('should get available symbols in scope', async () => {
    const filePath = path.join(testProjectPath, 'src', 'index.ts');
    const position = 500; // Inside UserService class
    
    const symbols = await adapter.getAvailableSymbols(filePath, position, testProjectPath);
    
    expect(symbols).toBeTruthy();
    expect(Array.isArray(symbols)).toBe(true);
    expect(symbols.length).toBeGreaterThan(0);
  });

  it('should clear disk cache successfully', async () => {
    // First, index the project to create cache
    await adapter.indexProject(testProjectPath);
    
    // Verify cache exists
    const cacheDir = path.join(testProjectPath, '.typeref');
    const cacheExists = await fs.access(cacheDir).then(() => true).catch(() => false);
    expect(cacheExists).toBe(true);
    
    // Clear cache
    await adapter.clearProjectDiskCache(testProjectPath);
    
    // Verify cache is removed
    const cacheExistsAfter = await fs.access(cacheDir).then(() => true).catch(() => false);
    expect(cacheExistsAfter).toBe(false);
  });

  it('should handle non-existent project gracefully', async () => {
    const nonExistentPath = '/non/existent/project';
    
    await expect(adapter.indexProject(nonExistentPath)).rejects.toThrow();
  });

  it('should handle missing TypeScript files gracefully', async () => {
    const emptyProjectPath = path.join(__dirname, 'fixtures', 'empty-project');
    await fs.mkdir(emptyProjectPath, { recursive: true });
    
    try {
      const index = await adapter.indexProject(emptyProjectPath);
      expect(index.symbols.size).toBe(0);
      expect(index.types.size).toBe(0);
    } finally {
      await fs.rm(emptyProjectPath, { recursive: true, force: true });
    }
  });
});