import type { RouteDef } from "./types";

export const SERVICE = {
  name: "ss-code",
  version: "1.0.0",
  title: "SS Code",
} as const;

export const ROUTES: RouteDef[] = [
  { id: "health", method: "GET", path: "/api/ss/health", title: "Health", summary: "Process liveness. No dependencies.", source: "" },
  { id: "stats", method: "GET", path: "/api/ss/stats", title: "Stats", summary: "In-process counters, p95, and traffic buckets.", source: "" },
  { id: "logs", method: "GET", path: "/api/ss/logs", title: "Request log", summary: "Recent requests. Query ?limit=50 (max 200).", source: "" },
  { id: "echo", method: "POST", path: "/api/ss/echo", title: "Echo", summary: "Returns the JSON body and selected request headers.", source: "" },
  { id: "kv-list", method: "GET", path: "/api/ss/kv", title: "KV list", summary: "List keys in the in-process store.", source: "" },
  { id: "kv-get", method: "GET", path: "/api/ss/kv/:key", title: "KV get", summary: "Read one key. 404 if missing.", source: "" },
  { id: "kv-put", method: "PUT", path: "/api/ss/kv/:key", title: "KV put", summary: "Write a key. Body: { value }.", source: "" },
  { id: "kv-del", method: "DELETE", path: "/api/ss/kv/:key", title: "KV delete", summary: "Delete a key. Idempotent.", source: "" },
  { id: "jobs-list", method: "GET", path: "/api/ss/jobs", title: "Jobs list", summary: "Background jobs.", source: "" },
  { id: "jobs-enqueue", method: "POST", path: "/api/ss/jobs", title: "Enqueue job", summary: "Body: { type, payload }. Types: echo, delay, fail, kv.set.", source: "" },
  { id: "jobs-drain", method: "POST", path: "/api/ss/jobs/drain", title: "Drain queue", summary: "Run queued jobs in this process. HTTP is not a queue.", source: "" },
  { id: "webhooks-list", method: "GET", path: "/api/ss/webhooks", title: "Webhook inbox", summary: "Payloads received by POST /api/ss/webhooks.", source: "" },
  { id: "webhooks-post", method: "POST", path: "/api/ss/webhooks", title: "Ingest webhook", summary: "Verify presence, persist, ack.", source: "" },
  { id: "fx-quote", method: "GET", path: "/api/ss/fx/quote", title: "FX quote", summary: "Deterministic mid. ?from=EUR&to=SEK&amount=100", source: "" },
  { id: "company", method: "GET", path: "/api/ss/company/:orgnr", title: "Company lookup", summary: "Stub registry. Try 5590000001.", source: "" },
];

export function findRoute(id: string): RouteDef | undefined {
  return ROUTES.find((r) => r.id === id);
}

export function methodTone(method: string): "get" | "post" | "put" | "del" {
  if (method === "POST") return "post";
  if (method === "PUT" || method === "PATCH") return "put";
  if (method === "DELETE") return "del";
  return "get";
}
