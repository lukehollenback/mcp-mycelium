declare module '@modelcontextprotocol/sdk/server/index.js' {
  export class Server {
    constructor(serverInfo: any, options?: any);
    setRequestHandler(schema: any, handler: (request: any) => any): void;
    connect(transport: any): Promise<void>;
  }
}

declare module '@modelcontextprotocol/sdk/server/stdio.js' {
  export class StdioServerTransport {
    constructor();
  }
}

declare module '@modelcontextprotocol/sdk/types.js' {
  export const CallToolRequestSchema: {
    type: string;
  };
  
  export const ListToolsRequestSchema: {
    type: string;
  };
  
  export enum ErrorCode {
    InvalidRequest = -32600,
    MethodNotFound = -32601,
    InvalidParams = -32602,
    InternalError = -32603
  }
  
  export class McpError extends Error {
    constructor(code: ErrorCode, message: string, data?: any);
  }
  
  export interface Tool {
    name: string;
    description: string;
    inputSchema?: any;
  }
}