const bucketPath = "/storage/v1/object/sign/subject-materials/";

function contentDisposition(filename: string) {
  const fallback = filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  return `inline; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function isAllowedSource(source: URL) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return false;
  const allowedOrigin = new URL(supabaseUrl).origin;
  return source.origin === allowedOrigin && source.pathname.includes(bucketPath);
}

export async function GET(request: Request, context: { params: Promise<{ filename: string }> }) {
  const sourceParam = new URL(request.url).searchParams.get("source");
  if (!sourceParam) return new Response("Arquivo não informado.", { status: 400 });

  let source: URL;
  try {
    source = new URL(sourceParam);
  } catch {
    return new Response("Link inválido.", { status: 400 });
  }

  if (!isAllowedSource(source)) {
    return new Response("Origem do arquivo não permitida.", { status: 400 });
  }

  const response = await fetch(source, { cache: "no-store" });
  if (!response.ok || !response.body) {
    return new Response("Não foi possível abrir o arquivo.", { status: response.status || 502 });
  }

  const { filename } = await context.params;
  const decodedFilename = decodeURIComponent(filename);
  return new Response(response.body, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": contentDisposition(decodedFilename),
      "Content-Type": response.headers.get("content-type") ?? "application/octet-stream",
    },
  });
}
