import { NextRequest } from "next/server";

const backendBaseUrl =
  process.env.NEXT_PUBLIC_RAILPOINT_API_BASE_URL ?? "http://127.0.0.1:4000";

async function proxyRequest(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const targetUrl = new URL(path.join("/"), `${backendBaseUrl}/`);
  targetUrl.search = request.nextUrl.search;

  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) {
    headers.set("content-type", contentType);
  }

  const accept = request.headers.get("accept");
  if (accept) {
    headers.set("accept", accept);
  }

  const body =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await request.text();

  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
    });

    const responseHeaders = new Headers();
    const responseContentType = response.headers.get("content-type");
    if (responseContentType) {
      responseHeaders.set("content-type", responseContentType);
    }

    return new Response(await response.text(), {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to reach Railpoint API";

    return Response.json(
      { error: `Could not reach the backend API. ${message}` },
      { status: 502 },
    );
  }
}

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyRequest(request, context);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyRequest(request, context);
}
