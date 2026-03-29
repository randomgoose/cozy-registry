export async function handlePlatformHealthRoute(): Promise<Response> {
  return Response.json({
    ok: true,
    service: "cozy-platform",
  });
}
