// lib/mcp.ts
// Temporarily disabled — AI SDK v6 split MCP into @ai-sdk/mcp package.
// Cloud HTTP MCP server at /api/mcp still works as a real MCP endpoint;
// we just don't auto-connect a client to it from chat route.
// To re-enable: install `@ai-sdk/mcp` and update imports.

export async function getMCPClient(): Promise<null> {
  return null;
}