/**
 * Core types and interfaces for TypeRef-MCP
 */

export interface SymbolInfo {
  name: string;
  kind: SymbolKind;
  type: string;
  location: SourceLocation;
  documentation?: string;
  isExported: boolean;
  module?: string;
  signature?: string;
}

export interface TypeInfo {
  name: string;
  kind: TypeKind;
  properties: PropertyInfo[];
  methods?: MethodInfo[];
  extends?: string[];
  implements?: string[];
  location: SourceLocation;
  documentation?: string;
  typeParameters?: TypeParameterInfo[];
}

export interface PropertyInfo {
  name: string;
  type: string;
  optional: boolean;
  readonly: boolean;
  documentation?: string;
}

export interface MethodInfo {
  name: string;
  signature: string;
  returnType: string;
  parameters: ParameterInfo[];
  documentation?: string;
  overloads?: string[];
}

export interface ParameterInfo {
  name: string;
  type: string;
  optional: boolean;
  defaultValue?: string;
}

export interface TypeParameterInfo {
  name: string;
  constraint?: string;
  defaultType?: string;
}

export interface SourceLocation {
  filePath: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
}

export interface ReferenceInfo {
  location: SourceLocation;
  context: string;
  referenceType: ReferenceType;
}

export interface ModuleInfo {
  path: string;
  exports: ExportInfo[];
  imports: ImportInfo[];
  dependencies: string[];
}

export interface ExportInfo {
  name: string;
  type: string;
  kind: SymbolKind;
  isDefault: boolean;
  documentation?: string;
}

export interface ImportInfo {
  name: string;
  localName: string;
  source: string;
  isDefault: boolean;
  isNamespace: boolean;
}

export interface ProjectIndex {
  projectPath: string;
  symbols: Map<string, SymbolInfo[]>;
  types: Map<string, TypeInfo>;
  modules: Map<string, ModuleInfo>;
  dependencies: Map<string, string[]>;
  lastIndexed: Date;
}

export interface TypeInferenceResult {
  type: string;
  kind: TypeKind;
  documentation?: string;
  location?: SourceLocation;
  properties?: PropertyInfo[];
  callSignatures?: string[];
}

export interface SymbolSearchOptions {
  query: string;
  kind?: SymbolKind;
  includePrivate?: boolean;
  maxResults?: number;
  fuzzyMatch?: boolean;
}

export interface TypeSearchOptions {
  query: string;
  kind?: TypeKind;
  includeInternal?: boolean;
  maxResults?: number;
}

export enum SymbolKind {
  Variable = 'variable',
  Function = 'function',
  Class = 'class',
  Interface = 'interface',
  Type = 'type',
  Enum = 'enum',
  Module = 'module',
  Namespace = 'namespace',
  Property = 'property',
  Method = 'method',
  Constructor = 'constructor',
  Parameter = 'parameter',
}

export enum TypeKind {
  Primitive = 'primitive',
  Object = 'object',
  Interface = 'interface',
  Array = 'array',
  Function = 'function',
  Union = 'union',
  Intersection = 'intersection',
  Generic = 'generic',
  Conditional = 'conditional',
  Mapped = 'mapped',
  Template = 'template',
  Tuple = 'tuple',
  Unknown = 'unknown',
}

export enum ReferenceType {
  Definition = 'definition',
  Usage = 'usage',
  TypeAnnotation = 'type_annotation',
  Extends = 'extends',
  Implements = 'implements',
  Import = 'import',
  Export = 'export',
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export interface LanguageConfig {
  name: string;
  fileExtensions: string[];
  configFiles: string[];
  excludePatterns: string[];
}

// MCP Tool Response Types
export interface TypeInferenceResponse {
  symbol: string;
  type: string;
  kind: TypeKind;
  location?: SourceLocation;
  documentation?: string;
  signature?: string;
}

export interface SymbolNavigationResponse {
  symbol: string;
  definitions: SourceLocation[];
  references: ReferenceInfo[];
  type: string;
  documentation?: string;
}

export interface ModuleAnalysisResponse {
  path: string;
  exports: ExportInfo[];
  imports: ImportInfo[];
  dependencies: string[];
}

export interface ProjectAnalysisResponse {
  success: boolean;
  projectPath: string;
  fileCount: number;
  symbolCount: number;
  typeCount: number;
  lastIndexed: Date;
  errors?: string[];
}