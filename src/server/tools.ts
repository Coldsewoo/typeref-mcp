/**
 * MCP tool definitions for TypeRef server
 * Defines the available tools and their schemas
 */

export const TOOLS = [
  {
    name: 'index_project',
    description: 'Index a TypeScript project for type inference and symbol navigation. Must be called before other operations.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the TypeScript project root directory'
        },
        force: {
          type: 'boolean',
          description: 'Force re-indexing even if project is already indexed',
          default: false
        }
      },
      required: ['projectPath']
    }
  },
  {
    name: 'get_type_inference',
    description: 'Get precise type information for a symbol at a specific position in a file',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Absolute path to the TypeScript file'
        },
        position: {
          type: 'number',
          description: 'Character position in the file (0-based)'
        },
        projectPath: {
          type: 'string',
          description: 'Absolute path to the TypeScript project root'
        }
      },
      required: ['filePath', 'position', 'projectPath']
    }
  },
  {
    name: 'get_type_definition',
    description: 'Get complete definition of a type/interface with all properties and methods',
    inputSchema: {
      type: 'object',
      properties: {
        typeName: {
          type: 'string',
          description: 'Name of the type/interface to look up'
        },
        projectPath: {
          type: 'string',
          description: 'Absolute path to the TypeScript project root'
        },
        contextFile: {
          type: 'string',
          description: 'Optional: File path for context-aware type resolution'
        }
      },
      required: ['typeName', 'projectPath']
    }
  },
  {
    name: 'find_symbol',
    description: 'Find symbols by name with optional filtering and fuzzy matching',
    inputSchema: {
      type: 'object',
      properties: {
        symbolName: {
          type: 'string',
          description: 'Name of the symbol to search for'
        },
        projectPath: {
          type: 'string',
          description: 'Absolute path to the TypeScript project root'
        },
        kind: {
          type: 'string',
          enum: ['variable', 'function', 'class', 'interface', 'type', 'enum', 'module', 'namespace', 'property', 'method', 'constructor', 'parameter'],
          description: 'Optional: Filter by symbol kind'
        },
        includePrivate: {
          type: 'boolean',
          description: 'Include non-exported symbols',
          default: false
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of results to return',
          default: 20
        },
        fuzzyMatch: {
          type: 'boolean',
          description: 'Enable fuzzy matching for broader results',
          default: false
        }
      },
      required: ['symbolName', 'projectPath']
    }
  },
  {
    name: 'find_references',
    description: 'Find all references to a symbol across the project',
    inputSchema: {
      type: 'object',
      properties: {
        symbolName: {
          type: 'string',
          description: 'Name of the symbol to find references for'
        },
        filePath: {
          type: 'string',
          description: 'File path where the symbol is defined'
        },
        projectPath: {
          type: 'string',
          description: 'Absolute path to the TypeScript project root'
        }
      },
      required: ['symbolName', 'filePath', 'projectPath']
    }
  },
  {
    name: 'get_available_symbols',
    description: 'Get symbols available in a specific context/scope',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Absolute path to the TypeScript file'
        },
        position: {
          type: 'number',
          description: 'Character position in the file for context'
        },
        projectPath: {
          type: 'string',
          description: 'Absolute path to the TypeScript project root'
        }
      },
      required: ['filePath', 'position', 'projectPath']
    }
  },
  {
    name: 'get_module_info',
    description: 'Get module exports, imports, and dependencies',
    inputSchema: {
      type: 'object',
      properties: {
        modulePath: {
          type: 'string',
          description: 'Absolute path to the module file'
        },
        projectPath: {
          type: 'string',
          description: 'Absolute path to the TypeScript project root'
        }
      },
      required: ['modulePath', 'projectPath']
    }
  },
  {
    name: 'search_types',
    description: 'Search for types/interfaces by name or characteristics',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query for type names'
        },
        projectPath: {
          type: 'string',
          description: 'Absolute path to the TypeScript project root'
        },
        kind: {
          type: 'string',
          enum: ['primitive', 'object', 'array', 'function', 'union', 'intersection', 'generic', 'conditional', 'mapped', 'template', 'tuple', 'unknown'],
          description: 'Optional: Filter by type kind'
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of results to return',
          default: 20
        }
      },
      required: ['query', 'projectPath']
    }
  },
  {
    name: 'get_diagnostics',
    description: 'Get TypeScript compiler diagnostics (errors, warnings) for a file',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Absolute path to the TypeScript file'
        },
        projectPath: {
          type: 'string',
          description: 'Absolute path to the TypeScript project root'
        }
      },
      required: ['filePath', 'projectPath']
    }
  },
  {
    name: 'batch_type_analysis',
    description: 'Perform type analysis on multiple symbols at once for better performance',
    inputSchema: {
      type: 'object',
      properties: {
        requests: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['type_inference', 'type_definition', 'symbol_search'],
                description: 'Type of analysis to perform'
              },
              params: {
                type: 'object',
                description: 'Parameters specific to the analysis type'
              }
            },
            required: ['type', 'params']
          },
          description: 'Array of analysis requests to process'
        },
        projectPath: {
          type: 'string',
          description: 'Absolute path to the TypeScript project root'
        }
      },
      required: ['requests', 'projectPath']
    }
  }
] as const;