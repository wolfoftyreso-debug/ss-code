import { ROUTES, SERVICE } from "./catalog";
import {
  companyLookup,
  fxQuote,
  getStartedAt,
  getStats,
  jobsDrain,
  jobsEnqueue,
  jobsGet,
  jobsList,
  kvDelete,
  kvGet,
  kvList,
  kvPut,
  listLogs,
  newId,
  recordLog,
  resetProcess,
  webhooksIngest,
  webhooksList,
} from "./runtime";

type HttpError = Error & { status?: number; code?: string };

function pickHeaders(req: Request, names: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of names) {
    const v = req.headers.get(name);
    if (v) out[name] = v;
  }
  return out;
}

async function readJson(req: Request): Promise<unknown> {
  const text = await req.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    const err: HttpError = Object.assign(new Error("Body is not JSON"), {
      status: 400,
      code: "BAD_JSON",
    });
    throw err;
  }
}

function envelope(
  requestId: string,
  ms: number,
  status: number,
  body: unknown,
): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-request-id": requestId,
      "x-ss-ms": String(ms),
      "cache-control": "no-store",
    },
  });
}

function match(
  pattern: string,
  path: string,
): Record<string, string> | null {
  const pp = pattern.split("/").filter(Boolean);
  const sp = path.split("/").filter(Boolean);
  if (pp.length !== sp.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pp.length; i++) {
    const a = pp[i] ?? "";
    const b = sp[i] ?? "";
    if (a.startsWith(":")) params[a.slice(1)] = decodeURIComponent(b);
    else if (a !== b) return null;
  }
  return params;
}

async function run(
  method: string,
  path: string,
  req: Request,
  url: URL,
): Promise<{ status: number; data: unknown }> {
  if (method === "GET" && path === "") {
    return {
      status: 200,
      data: {
        service: SERVICE.name,
        version: SERVICE.version,
        routes: ROUTES.map((r) => ({
          id: r.id,
          method: r.method,
          path: r.path,
          title: r.title,
          summary: r.summary,
        })),
      },
    };
  }

  if (method === "GET" && path === "health") {
    return {
      status: 200,
      data: {
        status: "ok",
        service: SERVICE.name,
        version: SERVICE.version,
        uptime_ms: Date.now() - getStartedAt(),
      },
    };
  }

  if (method === "GET" && path === "stats") {
    return { status: 200, data: getStats() };
  }

  if (method === "GET" && path === "logs") {
    const limit = Number(url.searchParams.get("limit") ?? "50");
    return { status: 200, data: listLogs(Number.isFinite(limit) ? limit : 50) };
  }

  if (method === "POST" && path === "echo") {
    const body = await readJson(req);
    return {
      status: 200,
      data: {
        method: req.method,
        path: url.pathname,
        headers: pickHeaders(req, ["content-type", "user-agent", "x-request-id"]),
        body,
      },
    };
  }

  if (method === "GET" && path === "kv") {
    return { status: 200, data: kvList() };
  }

  const kvOne = match("kv/:key", path);
  if (kvOne) {
    const key = kvOne.key ?? "";
    if (method === "GET") return { status: 200, data: kvGet(key) };
    if (method === "DELETE") return { status: 200, data: kvDelete(key) };
    if (method === "PUT") {
      const body = (await readJson(req)) as { value?: unknown };
      if (!("value" in body)) {
        const err: HttpError = Object.assign(new Error("Body must include { value }"), {
          status: 400,
          code: "BAD_BODY",
        });
        throw err;
      }
      return { status: 200, data: kvPut(key, body.value) };
    }
  }

  if (method === "GET" && path === "jobs") {
    return { status: 200, data: jobsList() };
  }

  if (method === "POST" && path === "jobs") {
    const body = (await readJson(req)) as { type?: string; payload?: unknown };
    if (!body.type) {
      const err: HttpError = Object.assign(new Error("Body must include { type }"), {
        status: 400,
        code: "BAD_BODY",
      });
      throw err;
    }
    return { status: 201, data: jobsEnqueue(body.type, body.payload ?? {}) };
  }

  if (method === "POST" && path === "jobs/drain") {
    return { status: 200, data: await jobsDrain() };
  }

  const jobOne = match("jobs/:id", path);
  if (jobOne && method === "GET") {
    return { status: 200, data: jobsGet(jobOne.id ?? "") };
  }

  if (method === "GET" && path === "webhooks") {
    return { status: 200, data: webhooksList() };
  }

  if (method === "POST" && path === "webhooks") {
    const body = await readJson(req);
    const rec = webhooksIngest(
      url.pathname,
      pickHeaders(req, ["content-type", "x-webhook-id", "user-agent"]),
      body,
    );
    return { status: 202, data: { accepted: true, id: rec.id } };
  }

  if (method === "GET" && path === "fx/quote") {
    const from = url.searchParams.get("from") ?? "EUR";
    const to = url.searchParams.get("to") ?? "SEK";
    const amount = Number(url.searchParams.get("amount") ?? "1");
    return { status: 200, data: fxQuote(from, to, amount) };
  }

  const co = match("company/:orgnr", path);
  if (co && method === "GET") {
    return { status: 200, data: companyLookup(co.orgnr ?? "") };
  }

  if (method === "POST" && path === "reset") {
    resetProcess();
    return { status: 200, data: { reset: true, stats: getStats() } };
  }

  const err: HttpError = Object.assign(new Error(`No handler for ${method} /api/ss/${path}`), {
    status: 404,
    code: "NOT_FOUND",
  });
  throw err;
}

export async function dispatch(ctx: { request: Request }): Promise<Response> {
  const req = ctx.request;
  const url = new URL(req.url);
  const requestId = req.headers.get("x-request-id") || newId("req");
  const started = Date.now();
  const method = req.method.toUpperCase();
  const path = url.pathname.replace(/^\/api\/ss\/?/, "");

  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        allow: "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "x-request-id": requestId,
      },
    });
  }

  try {
    const { status, data } = await run(method, path, req, url);
    const ms = Date.now() - started;
    recordLog({
      ts: Date.now(),
      method,
      path: url.pathname,
      status,
      ms,
      requestId,
    });
    return envelope(requestId, ms, status, {
      ok: true,
      request_id: requestId,
      ms,
      data,
    });
  } catch (e) {
    const err = e as HttpError;
    const status = err.status ?? 500;
    const ms = Date.now() - started;
    recordLog({
      ts: Date.now(),
      method,
      path: url.pathname,
      status,
      ms,
      requestId,
    });
    return envelope(requestId, ms, status, {
      ok: false,
      request_id: requestId,
      ms,
      error: {
        code: err.code ?? "INTERNAL",
        message: err.message || "Internal error",
      },
    });
  }
}
