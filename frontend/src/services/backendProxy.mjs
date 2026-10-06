const forwardedHeaders = ["accept", "content-type", "authorization"];

export async function proxyApi(request, context, env = process.env, fetchBackend = fetch) {
  let base;
  try {
    base = new URL(env.BACKEND_API_ORIGIN);
    if (base.protocol !== "https:" || base.username || base.password ||
        base.pathname !== "/" || base.search || base.hash) throw new Error("Invalid origin");
  } catch {
    return Response.json({ message: "API connection is not configured" }, { status: 503 });
  }
  const { path } = await context.params;
  if (!Array.isArray(path) || path.some((part) => !part || part === "." || part === ".." || part.includes("/") || part.includes("\\"))) {
    return Response.json({ message: "Invalid API path" }, { status: 400 });
  }
  const target = new URL(`/api/${path.map(encodeURIComponent).join("/")}`, base);
  target.search = new URL(request.url).search;
  const headers = new Headers();
  for (const name of forwardedHeaders) {
    if (request.headers.has(name)) headers.set(name, request.headers.get(name));
  }
  try {
    const upstream = await fetchBackend(target, {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
      duplex: "half",
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(30000)]),
    });
    // Do not follow redirects with a user's token or expose upstream host details.
    if (upstream.status >= 300 && upstream.status < 400) {
      await upstream.body?.cancel();
      return Response.json({ message: "Unexpected API redirect" }, { status: 502 });
    }
    const responseHeaders = new Headers({ "cache-control": "no-store" });
    for (const name of ["content-type", "retry-after"]) {
      if (upstream.headers.has(name)) responseHeaders.set(name, upstream.headers.get(name));
    }
    return new Response(request.method === "HEAD" ? null : upstream.body, {
      status: upstream.status, headers: responseHeaders,
    });
  } catch {
    return Response.json({ message: "API is temporarily unavailable" }, { status: 502 });
  }
}
