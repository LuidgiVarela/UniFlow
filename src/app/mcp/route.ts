import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createClient } from "@supabase/supabase-js";
import { createUniflowMcpServer } from "@/lib/mcp/uniflow-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function withCors(response: Response) {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Expose-Headers", "MCP-Session-Id, WWW-Authenticate");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function unauthorized(request: Request) {
  const metadataUrl = new URL("/.well-known/oauth-protected-resource", request.url).toString();
  return withCors(new Response("Autenticação necessária.", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Bearer resource_metadata="${metadataUrl}", scope="openid email profile"`,
    },
  }));
}

async function authenticatedClient(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !anonKey) return null;

  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  return client;
}

async function handleMcpRequest(request: Request) {
  const client = await authenticatedClient(request);
  if (!client) return unauthorized(request);

  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
    sessionIdGenerator: undefined,
  });
  const server = createUniflowMcpServer(client, new URL(request.url).origin);
  await server.connect(transport);
  return withCors(await transport.handleRequest(request));
}

export const GET = handleMcpRequest;
export const POST = handleMcpRequest;
export const DELETE = handleMcpRequest;

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Headers": "Authorization, Content-Type, MCP-Protocol-Version, MCP-Session-Id",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
