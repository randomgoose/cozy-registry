import {
  authorizationServerMetadata,
  requestOrigin,
} from "../../src/metadata.js";

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Max-Age": "86400",
      },
    });
  }
  if (req.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  const origin = requestOrigin(req);
  const body = JSON.stringify(authorizationServerMetadata(origin));
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
