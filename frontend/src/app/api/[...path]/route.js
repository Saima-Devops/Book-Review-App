import { proxyApi } from "../../../services/backendProxy.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request, context) {
  return proxyApi(request, context);
}

export const GET = handle;
export const HEAD = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
