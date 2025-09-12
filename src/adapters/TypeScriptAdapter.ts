/**
 * TypeScript language adapter using ts-morph and TypeScript compiler API
 * Provides professional-grade type inference and symbol navigation
 */

import { Project, SourceFile, Node, Symbol, Type, SyntaxKind } from 'ts-morph';
import * as ts from 'typescript';
import * as path from 'path';
import * as fs from 'fs/promises';

import { BaseLanguageAdapter } from '../core/BaseLanguageAdapter.js';
import {
  CacheManager,
  FileWatcher,
  Logger,
  DiagnosticInfo,
  DiagnosticSeverity,
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
  SymbolKind,
  TypeKind,
  SourceLocation,
  PropertyInfo,
  MethodInfo,
  ParameterInfo,
  ExportInfo,
  ImportInfo,
} from '../types.js';

export class TypeScriptAdapter extends BaseLanguageAdapter {
  private projects = new Map<string, Project>();
  
  static readonly CONFIG: LanguageConfig = {
    name: 'typescript',
    fileExtensions: ['.ts', '.tsx'],
    configFiles: ['tsconfig.json'],
    excludePatterns: ['node_modules/**', '**/*.d.ts', 'dist/**', 'build/**'],
  };

  constructor(cache: CacheManager, watcher: FileWatcher, logger: Logger) {
    super(TypeScriptAdapter.CONFIG, cache, watcher, logger);
  }

  async indexProject(projectPath: string, force = false): Promise<ProjectIndex> {
    this.validateProjectPath(projectPath);
    
    const cacheKey = this.getCacheKey(projectPath, 'index');
    const cached = this.cache.get<ProjectIndex>(cacheKey);
    
    if (cached && !force) {
      this.logger.info(`Using cached index for project: ${projectPath}`);
      this.setProjectIndex(projectPath, cached);
      return cached;
    }

    this.logger.info(`Indexing TypeScript project: ${projectPath}`);
    
    try {
      // Initialize ts-morph project
      const project = await this.createProject(projectPath);
      this.projects.set(projectPath, project);
      
      // Build project index
      const index = await this.buildProjectIndex(project, projectPath);
      
      // Cache and store
      this.cache.set(cacheKey, index, 10 * 60 * 1000); // 10 minutes TTL
      this.setProjectIndex(projectPath, index);
      
      this.logger.info(`Indexed ${index.symbols.size} symbols and ${index.types.size} types`);
      return index;
      
    } catch (error) {
      this.logger.error(`Failed to index project ${projectPath}:`, error);
      throw error;
    }
  }

  async getTypeInference(
    filePath: string,
    position: number,
    projectPath: string
  ): Promise<TypeInferenceResult | null> {
    this.validateProjectPath(projectPath);
    
    const cacheKey = this.getCacheKey(projectPath, 'type-inference', filePath, position.toString());
    const cached = this.cache.get<TypeInferenceResult>(cacheKey);
    
    if (cached) {
      return cached;
    }

    try {
      const project = this.projects.get(projectPath);
      if (!project) {
        throw new Error(`Project not indexed: ${projectPath}`);
      }

      const sourceFile = project.getSourceFile(filePath);
      if (!sourceFile) {
        return null;
      }

      // Get node at position
      const node = sourceFile.getDescendantAtPos(position);
      if (!node) {
        return null;
      }

      // Get type information
      const type = node.getType();
      const symbol = node.getSymbol();
      
      const result: TypeInferenceResult = {
        type: type.getText(),
        kind: this.mapTypeToKind(type),
        documentation: symbol?.getJsDocTags().map(tag => tag.getText()).join('\n'),
        location: this.getSourceLocation(node),
      };

      // Add additional type information
      if (type.isObject()) {
        result.properties = this.extractProperties(type);
      }
      
      if (type.getCallSignatures().length > 0) {
        result.callSignatures = type.getCallSignatures().map(sig => sig.getDeclaration()?.getText() || '');
      }

      this.cache.set(cacheKey, result);
      return result;
      
    } catch (error) {
      this.logger.error(`Type inference failed for ${filePath}:${position}:`, error);
      return null;
    }
  }

  async getTypeDefinition(
    typeName: string,
    projectPath: string,
    contextFile?: string
  ): Promise<TypeInfo | null> {
    this.validateProjectPath(projectPath);
    
    const cacheKey = this.getCacheKey(projectPath, 'type-definition', typeName, contextFile || '');
    const cached = this.cache.get<TypeInfo>(cacheKey);
    
    if (cached) {
      return cached;
    }

    try {
      const project = this.projects.get(projectPath);
      if (!project) {
        throw new Error(`Project not indexed: ${projectPath}`);
      }

      // Find type declaration
      const sourceFiles = contextFile 
        ? [project.getSourceFile(contextFile)].filter((f): f is SourceFile => f !== undefined)
        : project.getSourceFiles();

      for (const sourceFile of sourceFiles) {
        // Check interfaces
        const interfaces = sourceFile.getInterfaces().filter(iface => iface.getName() === typeName);
        for (const iface of interfaces) {
          const typeInfo = this.extractInterfaceInfo(iface);
          this.cache.set(cacheKey, typeInfo);
          return typeInfo;
        }

        // Check type aliases
        const typeAliases = sourceFile.getTypeAliases().filter(alias => alias.getName() === typeName);
        for (const alias of typeAliases) {
          const typeInfo = this.extractTypeAliasInfo(alias);
          this.cache.set(cacheKey, typeInfo);
          return typeInfo;
        }

        // Check classes
        const classes = sourceFile.getClasses().filter(cls => cls.getName() === typeName);
        for (const cls of classes) {
          const typeInfo = this.extractClassInfo(cls);
          this.cache.set(cacheKey, typeInfo);
          return typeInfo;
        }

        // Check enums
        const enums = sourceFile.getEnums().filter(e => e.getName() === typeName);
        for (const enumDecl of enums) {
          const typeInfo = this.extractEnumInfo(enumDecl);
          this.cache.set(cacheKey, typeInfo);
          return typeInfo;
        }
      }

      return null;
      
    } catch (error) {
      this.logger.error(`Type definition lookup failed for ${typeName}:`, error);
      return null;
    }
  }

  async findSymbol(
    symbolName: string,
    projectPath: string,
    options: SymbolSearchOptions = { query: '' }
  ): Promise<SymbolInfo[]> {
    this.validateProjectPath(projectPath);
    
    const index = this.getProjectIndex(projectPath);
    if (!index) {
      throw new Error(`Project not indexed: ${projectPath}`);
    }

    const symbols = index.symbols.get(symbolName) || [];
    let results = [...symbols];

    // Apply filters
    if (options.kind) {
      results = results.filter(s => s.kind === options.kind);
    }
    
    if (!options.includePrivate) {
      results = results.filter(s => s.isExported);
    }

    // Apply fuzzy matching if requested
    if (options.fuzzyMatch && symbolName.length > 2) {
      const fuzzyResults = this.performFuzzySearch(symbolName, index);
      results = [...results, ...fuzzyResults];
    }

    // Limit results
    if (options.maxResults && results.length > options.maxResults) {
      results = results.slice(0, options.maxResults);
    }

    return results;
  }

  async findReferences(
    symbolName: string,
    filePath: string,
    projectPath: string
  ): Promise<ReferenceInfo[]> {
    this.validateProjectPath(projectPath);
    
    const cacheKey = this.getCacheKey(projectPath, 'references', symbolName, filePath);
    const cached = this.cache.get<ReferenceInfo[]>(cacheKey);
    
    if (cached) {
      return cached;
    }

    try {
      const project = this.projects.get(projectPath);
      if (!project) {
        throw new Error(`Project not indexed: ${projectPath}`);
      }

      const sourceFile = project.getSourceFile(filePath);
      if (!sourceFile) {
        return [];
      }

      const references: ReferenceInfo[] = [];

      // Find symbol declaration first
      const symbol = this.findSymbolInFile(sourceFile, symbolName);
      if (!symbol) {
        return [];
      }

      // Get all source files for reference search
      const sourceFiles = project.getSourceFiles();
      
      for (const file of sourceFiles) {
        const fileReferences = this.findSymbolReferencesInFile(file, symbolName, symbol);
        references.push(...fileReferences);
      }

      this.cache.set(cacheKey, references);
      return references;
      
    } catch (error) {
      this.logger.error(`Reference search failed for ${symbolName}:`, error);
      return [];
    }
  }

  async getAvailableSymbols(
    filePath: string,
    position: number,
    projectPath: string
  ): Promise<SymbolInfo[]> {
    this.validateProjectPath(projectPath);
    
    const cacheKey = this.getCacheKey(projectPath, 'available-symbols', filePath, position.toString());
    const cached = this.cache.get<SymbolInfo[]>(cacheKey);
    
    if (cached) {
      return cached;
    }

    try {
      const project = this.projects.get(projectPath);
      if (!project) {
        throw new Error(`Project not indexed: ${projectPath}`);
      }

      const sourceFile = project.getSourceFile(filePath);
      if (!sourceFile) {
        return [];
      }

      const symbols: SymbolInfo[] = [];
      
      // Get local symbols in scope
      const localSymbols = this.getLocalSymbolsInScope(sourceFile, position);
      symbols.push(...localSymbols);
      
      // Get imported symbols
      const importedSymbols = this.getImportedSymbols(sourceFile);
      symbols.push(...importedSymbols);
      
      // Get global symbols (built-ins)
      const globalSymbols = this.getGlobalSymbols(sourceFile);
      symbols.push(...globalSymbols);

      this.cache.set(cacheKey, symbols);
      return symbols;
      
    } catch (error) {
      this.logger.error(`Available symbols lookup failed for ${filePath}:`, error);
      return [];
    }
  }

  async getModuleInfo(
    modulePath: string,
    projectPath: string
  ): Promise<ModuleInfo | null> {
    this.validateProjectPath(projectPath);
    
    const cacheKey = this.getCacheKey(projectPath, 'module-info', modulePath);
    const cached = this.cache.get<ModuleInfo>(cacheKey);
    
    if (cached) {
      return cached;
    }

    try {
      const project = this.projects.get(projectPath);
      if (!project) {
        throw new Error(`Project not indexed: ${projectPath}`);
      }

      const sourceFile = project.getSourceFile(modulePath);
      if (!sourceFile) {
        return null;
      }

      const moduleInfo: ModuleInfo = {
        path: modulePath,
        exports: this.extractExports(sourceFile),
        imports: this.extractImports(sourceFile),
        dependencies: this.extractDependencies(sourceFile),
      };

      this.cache.set(cacheKey, moduleInfo);
      return moduleInfo;
      
    } catch (error) {
      this.logger.error(`Module info lookup failed for ${modulePath}:`, error);
      return null;
    }
  }

  async searchTypes(
    options: TypeSearchOptions,
    projectPath: string
  ): Promise<TypeInfo[]> {
    this.validateProjectPath(projectPath);
    
    const index = this.getProjectIndex(projectPath);
    if (!index) {
      throw new Error(`Project not indexed: ${projectPath}`);
    }

    const results: TypeInfo[] = [];
    const query = options.query.toLowerCase();

    for (const [typeName, typeInfo] of index.types) {
      // Match by name
      if (typeName.toLowerCase().includes(query)) {
        results.push(typeInfo);
        continue;
      }

      // Match by kind if specified
      if (options.kind && typeInfo.kind === options.kind) {
        results.push(typeInfo);
        continue;
      }
    }

    // Limit results
    if (options.maxResults && results.length > options.maxResults) {
      return results.slice(0, options.maxResults);
    }

    return results;
  }

  async getDiagnostics(
    filePath: string,
    projectPath: string
  ): Promise<DiagnosticInfo[]> {
    this.validateProjectPath(projectPath);
    
    try {
      const project = this.projects.get(projectPath);
      if (!project) {
        throw new Error(`Project not indexed: ${projectPath}`);
      }

      const sourceFile = project.getSourceFile(filePath);
      if (!sourceFile) {
        return [];
      }

      // Get TypeScript diagnostics
      const diagnostics = sourceFile.getPreEmitDiagnostics();
      
      return diagnostics.map(diagnostic => ({
        filePath,
        line: diagnostic.getLineNumber() || 1,
        column: diagnostic.getStart() || 0,
        message: diagnostic.getMessageText().toString(),
        severity: this.mapDiagnosticSeverity(diagnostic.getCategory()),
        code: diagnostic.getCode(),
        source: 'typescript',
      }));
      
    } catch (error) {
      this.logger.error(`Diagnostics lookup failed for ${filePath}:`, error);
      return [];
    }
  }

  // Private helper methods

  private async createProject(projectPath: string): Promise<Project> {
    const tsconfigPath = path.join(projectPath, 'tsconfig.json');
    
    // Check if tsconfig exists
    try {
      await fs.access(tsconfigPath);
      return new Project({
        tsConfigFilePath: tsconfigPath,
        skipAddingFilesFromTsConfig: false,
        skipFileDependencyResolution: false,
      });
    } catch {
      // Create project without tsconfig
      this.logger.warn(`No tsconfig.json found in ${projectPath}, using default configuration`);
      return new Project({
        useInMemoryFileSystem: true,
        compilerOptions: {
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          strict: true,
          skipLibCheck: true,
        },
      });
    }
  }

  private async buildProjectIndex(project: Project, projectPath: string): Promise<ProjectIndex> {
    const symbols = new Map<string, SymbolInfo[]>();
    const types = new Map<string, TypeInfo>();
    const modules = new Map<string, ModuleInfo>();
    const dependencies = new Map<string, string[]>();

    const sourceFiles = project.getSourceFiles().filter(file => 
      this.shouldIncludeFile(file.getFilePath())
    );

    for (const sourceFile of sourceFiles) {
      // Extract symbols
      const fileSymbols = this.extractSymbolsFromFile(sourceFile);
      for (const symbol of fileSymbols) {
        const existing = symbols.get(symbol.name) || [];
        symbols.set(symbol.name, [...existing, symbol]);
      }

      // Extract types
      const fileTypes = this.extractTypesFromFile(sourceFile);
      for (const type of fileTypes) {
        types.set(type.name, type);
      }

      // Extract module info
      const moduleInfo: ModuleInfo = {
        path: sourceFile.getFilePath(),
        exports: this.extractExports(sourceFile),
        imports: this.extractImports(sourceFile),
        dependencies: this.extractDependencies(sourceFile),
      };
      modules.set(sourceFile.getFilePath(), moduleInfo);
      dependencies.set(sourceFile.getFilePath(), moduleInfo.dependencies);
    }

    return {
      projectPath,
      symbols,
      types,
      modules,
      dependencies,
      lastIndexed: new Date(),
    };
  }

  private extractSymbolsFromFile(sourceFile: SourceFile): SymbolInfo[] {
    const symbols: SymbolInfo[] = [];

    // Extract various symbol types
    sourceFile.forEachDescendant(node => {
      if (Node.hasName(node)) {
        const symbol = this.nodeToSymbolInfo(node, sourceFile);
        if (symbol) {
          symbols.push(symbol);
        }
      }
    });

    return symbols;
  }

  private extractTypesFromFile(sourceFile: SourceFile): TypeInfo[] {
    const types: TypeInfo[] = [];

    // Interfaces
    sourceFile.getInterfaces().forEach(iface => {
      types.push(this.extractInterfaceInfo(iface));
    });

    // Type aliases
    sourceFile.getTypeAliases().forEach(alias => {
      types.push(this.extractTypeAliasInfo(alias));
    });

    // Classes
    sourceFile.getClasses().forEach(cls => {
      types.push(this.extractClassInfo(cls));
    });

    // Enums
    sourceFile.getEnums().forEach(enumDecl => {
      types.push(this.extractEnumInfo(enumDecl));
    });

    return types;
  }

  private nodeToSymbolInfo(node: Node, sourceFile: SourceFile): SymbolInfo | null {
    if (!Node.hasName(node)) return null;

    const name = node.getName?.() || '';
    if (!name) return null;

    return {
      name,
      kind: this.mapNodeToSymbolKind(node),
      type: this.getNodeType(node),
      location: this.getSourceLocation(node),
      documentation: this.getNodeDocumentation(node),
      isExported: Node.isExportable(node) && node.getModifiers().some(mod => mod.getKind() === SyntaxKind.ExportKeyword),
      module: sourceFile.getFilePath(),
      signature: this.getNodeSignature(node),
    };
  }

  private extractInterfaceInfo(node: any): TypeInfo {
    return {
      name: node.getName(),
      kind: TypeKind.Object,
      properties: node.getProperties().map((prop: any) => this.extractPropertyInfo(prop)),
      methods: node.getMethods().map((method: any) => this.extractMethodInfo(method)),
      extends: node.getExtends().map((ext: any) => ext.getText()),
      location: this.getSourceLocation(node),
      documentation: this.getNodeDocumentation(node),
    };
  }

  private extractTypeAliasInfo(node: any): TypeInfo {
    return {
      name: node.getName(),
      kind: TypeKind.Generic, // Default, could be more specific
      properties: [],
      location: this.getSourceLocation(node),
      documentation: this.getNodeDocumentation(node),
    };
  }

  private extractClassInfo(node: any): TypeInfo {
    return {
      name: node.getName() || 'Anonymous',
      kind: TypeKind.Object,
      properties: node.getProperties().map((prop: any) => this.extractPropertyInfo(prop)),
      methods: node.getMethods().map((method: any) => this.extractMethodInfo(method)),
      extends: node.getExtends() ? [node.getExtends().getText()] : [],
      implements: node.getImplements().map((impl: any) => impl.getText()),
      location: this.getSourceLocation(node),
      documentation: this.getNodeDocumentation(node),
    };
  }

  private extractEnumInfo(node: any): TypeInfo {
    return {
      name: node.getName(),
      kind: TypeKind.Primitive,
      properties: node.getMembers().map((member: any) => ({
        name: member.getName(),
        type: 'number | string',
        optional: false,
        readonly: true,
        documentation: this.getNodeDocumentation(member),
      })),
      location: this.getSourceLocation(node),
      documentation: this.getNodeDocumentation(node),
    };
  }

  private extractPropertyInfo(prop: any): PropertyInfo {
    return {
      name: prop.getName(),
      type: this.getNodeType(prop),
      optional: prop.hasQuestionToken?.() || false,
      readonly: prop.isReadonly?.() || false,
      documentation: this.getNodeDocumentation(prop),
    };
  }

  private extractMethodInfo(method: any): MethodInfo {
    return {
      name: method.getName(),
      signature: method.getText(),
      returnType: this.getNodeType(method),
      parameters: method.getParameters().map((param: any) => this.extractParameterInfo(param)),
      documentation: this.getNodeDocumentation(method),
    };
  }

  private extractParameterInfo(param: any): ParameterInfo {
    return {
      name: param.getName(),
      type: this.getNodeType(param),
      optional: param.hasQuestionToken?.() || false,
      defaultValue: param.getDefaultValue?.()?.getText(),
    };
  }

  private extractExports(sourceFile: SourceFile): ExportInfo[] {
    const exports: ExportInfo[] = [];

    // Named exports
    sourceFile.getExportDeclarations().forEach(exportDecl => {
      exportDecl.getNamedExports().forEach(namedExport => {
        exports.push({
          name: namedExport.getName(),
          type: 'unknown', // Could be improved with type analysis
          kind: SymbolKind.Variable,
          isDefault: false,
          documentation: this.getNodeDocumentation(namedExport),
        });
      });
    });

    // Default export
    const defaultExport = sourceFile.getDefaultExportSymbol();
    if (defaultExport) {
      exports.push({
        name: 'default',
        type: 'unknown',
        kind: SymbolKind.Variable,
        isDefault: true,
      });
    }

    return exports;
  }

  private extractImports(sourceFile: SourceFile): ImportInfo[] {
    const imports: ImportInfo[] = [];

    sourceFile.getImportDeclarations().forEach(importDecl => {
      const moduleSpecifier = importDecl.getModuleSpecifierValue();

      // Named imports
      importDecl.getNamedImports().forEach(namedImport => {
        imports.push({
          name: namedImport.getName(),
          localName: namedImport.getAliasNode()?.getText() || namedImport.getName(),
          source: moduleSpecifier,
          isDefault: false,
          isNamespace: false,
        });
      });

      // Default import
      const defaultImport = importDecl.getDefaultImport();
      if (defaultImport) {
        imports.push({
          name: 'default',
          localName: defaultImport.getText(),
          source: moduleSpecifier,
          isDefault: true,
          isNamespace: false,
        });
      }

      // Namespace import
      const namespaceImport = importDecl.getNamespaceImport();
      if (namespaceImport) {
        imports.push({
          name: '*',
          localName: namespaceImport.getText(),
          source: moduleSpecifier,
          isDefault: false,
          isNamespace: true,
        });
      }
    });

    return imports;
  }

  private extractDependencies(sourceFile: SourceFile): string[] {
    const dependencies: string[] = [];

    sourceFile.getImportDeclarations().forEach(importDecl => {
      dependencies.push(importDecl.getModuleSpecifierValue());
    });

    return dependencies;
  }

  // Helper methods for type mapping and utilities

  private mapTypeToKind(type: Type): TypeKind {
    if (type.isString() || type.isNumber() || type.isBoolean()) {
      return TypeKind.Primitive;
    }
    if (type.isArray()) {
      return TypeKind.Array;
    }
    if (type.isUnion()) {
      return TypeKind.Union;
    }
    if (type.isIntersection()) {
      return TypeKind.Intersection;
    }
    if (type.getCallSignatures().length > 0) {
      return TypeKind.Function;
    }
    return TypeKind.Object;
  }

  private mapNodeToSymbolKind(node: Node): SymbolKind {
    if (Node.isVariableDeclaration(node)) return SymbolKind.Variable;
    if (Node.isFunctionDeclaration(node)) return SymbolKind.Function;
    if (Node.isClassDeclaration(node)) return SymbolKind.Class;
    if (Node.isInterfaceDeclaration(node)) return SymbolKind.Interface;
    if (Node.isTypeAliasDeclaration(node)) return SymbolKind.Type;
    if (Node.isEnumDeclaration(node)) return SymbolKind.Enum;
    if (Node.isMethodDeclaration(node)) return SymbolKind.Method;
    if (Node.isPropertyDeclaration(node)) return SymbolKind.Property;
    return SymbolKind.Variable;
  }

  private mapDiagnosticSeverity(category: ts.DiagnosticCategory): DiagnosticSeverity {
    switch (category) {
      case ts.DiagnosticCategory.Error:
        return DiagnosticSeverity.Error;
      case ts.DiagnosticCategory.Warning:
        return DiagnosticSeverity.Warning;
      case ts.DiagnosticCategory.Message:
        return DiagnosticSeverity.Information;
      case ts.DiagnosticCategory.Suggestion:
        return DiagnosticSeverity.Hint;
      default:
        return DiagnosticSeverity.Information;
    }
  }

  private getSourceLocation(node: Node): SourceLocation {
    const sourceFile = node.getSourceFile();
    const start = node.getStart();
    const end = node.getEnd();
    const startLineAndColumn = sourceFile.getLineAndColumnAtPos(start);
    const endLineAndColumn = sourceFile.getLineAndColumnAtPos(end);

    return {
      filePath: sourceFile.getFilePath(),
      line: startLineAndColumn.line,
      column: startLineAndColumn.column,
      endLine: endLineAndColumn.line,
      endColumn: endLineAndColumn.column,
    };
  }

  private getNodeType(node: Node): string {
    try {
      return node.getType().getText();
    } catch {
      return 'unknown';
    }
  }

  private getNodeDocumentation(node: Node): string | undefined {
    try {
      const jsDoc = (node as any).getJsDocs?.();
      return jsDoc?.map((doc: any) => doc.getDescription()).join('\n') || undefined;
    } catch {
      return undefined;
    }
  }

  private getNodeSignature(node: Node): string | undefined {
    try {
      if (Node.isFunctionDeclaration(node) || Node.isMethodDeclaration(node)) {
        return node.getText();
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  private extractProperties(type: Type): PropertyInfo[] {
    const properties: PropertyInfo[] = [];
    
    try {
      const symbol = type.getSymbol();
      if (symbol) {
        const declarations = symbol.getDeclarations();
        for (const decl of declarations) {
          if (Node.isInterfaceDeclaration(decl) || Node.isClassDeclaration(decl)) {
            const props = decl.getProperties();
            for (const prop of props) {
              properties.push(this.extractPropertyInfo(prop));
            }
          }
        }
      }
    } catch (error) {
      this.logger.debug(`Failed to extract properties:`, error);
    }

    return properties;
  }

  private performFuzzySearch(query: string, index: ProjectIndex): SymbolInfo[] {
    const results: SymbolInfo[] = [];
    const queryLower = query.toLowerCase();

    for (const [name, symbolList] of index.symbols) {
      if (name.toLowerCase().includes(queryLower)) {
        results.push(...symbolList);
      }
    }

    return results;
  }

  private findSymbolInFile(_sourceFile: SourceFile, _symbolName: string): Symbol | null {
    // Implementation for finding symbol in file
    // This is a simplified version - real implementation would be more thorough
    return null;
  }

  private findSymbolReferencesInFile(
    _sourceFile: SourceFile,
    _symbolName: string,
    _symbol: Symbol
  ): ReferenceInfo[] {
    // Implementation for finding references in file
    // This is a simplified version - real implementation would use TypeScript's findReferences API
    return [];
  }

  private getLocalSymbolsInScope(_sourceFile: SourceFile, _position: number): SymbolInfo[] {
    // Implementation for getting local symbols in scope
    return [];
  }

  private getImportedSymbols(_sourceFile: SourceFile): SymbolInfo[] {
    // Implementation for getting imported symbols
    return [];
  }

  private getGlobalSymbols(_sourceFile: SourceFile): SymbolInfo[] {
    // Implementation for getting global symbols
    return [];
  }
}