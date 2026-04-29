// lib/mcp.ts
// Model Context Protocol integration
//
// 兩種 transport，依環境自動切換：
//   - LOCAL dev: 接 official @modelcontextprotocol/server-filesystem (stdio)
//                可以 demo「列出 sandbox 目錄」「讀某個檔」
//   - PRODUCTION (Vercel): 接我們自己寫的 HTTP MCP endpoint /api/mcp
//                          因為 Vercel serverless 不能跑長連線 stdio
//
// Demo 時 README 會教助教兩種模式都能跑。

import { experimental_createMCPClient as createMCPClient } from 'ai';

type MCPClient = Awaited<ReturnType<typeof createMCPClient>>;

export async function getMCPClient(): Promise<MCPClient | null> {
  const mode = process.env.MCP_MODE; // 'stdio' | 'http' | undefined
  try {
    if (mode === 'stdio' && process.env.NODE_ENV !== 'production') {
      // 本地：stdio
      const { Experimental_StdioMCPTransport } = await import(
        'ai/mcp-stdio'
      );
      const transport = new Experimental_StdioMCPTransport({
        command: 'npx',
        args: [
          '-y',
          '@modelcontextprotocol/server-filesystem',
          process.env.MCP_FS_ROOT || process.cwd() + '/sandbox',
        ],
      });
      return await createMCPClient({ transport });
    }

    if (mode === 'http' || process.env.NODE_ENV === 'production') {
      // 雲端：HTTP（同 app 的 /api/mcp）
      const url =
        process.env.MCP_HTTP_URL ||
        (process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}/api/mcp`
          : 'http://localhost:3000/api/mcp');
      return await createMCPClient({
        transport: { type: 'sse', url },
      });
    }
  } catch (e) {
    console.error('[MCP] failed to connect:', e);
    return null;
  }
  return null;
}
