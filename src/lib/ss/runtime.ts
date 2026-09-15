import type {
  JobRecord,
  JobState,
  KvRecord,
  LogEntry,
  RuntimeStats,
  WebhookRecord,
} from "./types";

const startedAt = Date.now();
const logs: LogEntry[] = [];
const kv = new Map<string, KvRecord>();
const jobs: JobRecord[] = [];
const webhooks: WebhookRecord[] = [];
let seq = 0;
let seeded = false;

const KEY_RE = /^[A-Za-z0-9._-]{1,80}$/;
const MAX_LOGS = 200;
const MAX_JOBS = 80;
const MAX_HOOKS = 80;

export function newId(prefix: string): string {
  seq += 1;
  return `${prefix}_${startedAt.toString(36)}_${seq.toString(36)}`;
}

export function now(): number {
  return Date.now();
}

export function getStartedAt(): number {
  return startedAt;
}

export function recordLog(entry: Omit<LogEntry, "id">): LogEntry {
  const row: LogEntry = { id: newId("log"), ...entry };
  logs.unshift(row);
  if (logs.length > MAX_LOGS) logs.length = MAX_LOGS;
  return row;
}

export function listLogs(limit = 50): LogEntry[] {
  const n = Math.min(200, Math.max(1, limit));
  return logs.slice(0, n);
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)));
  return sorted[idx] ?? 0;
}

export function getStats(): RuntimeStats {
  const errors = logs.filter((l) => l.status >= 400).length;
  const windowMs = 60_000;
  const t0 = Date.now() - windowMs;
  const buckets: RuntimeStats["buckets"] = [];
  const step = 5_000;
  for (let t = t0; t < Date.now(); t += step) {
    const slice = logs.filter((l) => l.ts >= t && l.ts < t + step);
    buckets.push({
      t,
      n: slice.length,
      errors: slice.filter((l) => l.status >= 400).length,
    });
  }
  return {
    startedAt,
    uptimeMs: Date.now() - startedAt,
    requests: logs.length,
    errors,
    p95Ms: Math.round(percentile(logs.map((l) => l.ms), 0.95)),
    kvKeys: kv.size,
    jobsQueued: jobs.filter((j) => j.state === "QUEUED").length,
    webhooks: webhooks.length,
    buckets,
  };
}

export function assertKey(key: string): void {
  if (!KEY_RE.test(key)) {
    throw Object.assign(new Error("Key must match [A-Za-z0-9._-]{1,80}"), {
      status: 400,
      code: "BAD_KEY",
    });
  }
}

export function kvList(): KvRecord[] {
  return [...kv.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function kvGet(key: string): KvRecord {
  const rec = kv.get(key);
  if (!rec) {
    throw Object.assign(new Error(`No key '${key}'`), {
      status: 404,
      code: "NOT_FOUND",
    });
  }
  return rec;
}

export function kvPut(key: string, value: unknown): KvRecord {
  assertKey(key);
  const rec: KvRecord = { key, value, updatedAt: Date.now() };
  kv.set(key, rec);
  return rec;
}

export function kvDelete(key: string): { deleted: boolean; key: string } {
  return { deleted: kv.delete(key), key };
}

export function jobsList(): JobRecord[] {
  return jobs.slice().sort((a, b) => b.createdAt - a.createdAt);
}

export function jobsGet(id: string): JobRecord {
  const job = jobs.find((j) => j.id === id);
  if (!job) {
    throw Object.assign(new Error("No job"), {
      status: 404,
      code: "NOT_FOUND",
    });
  }
  return job;
}

export function jobsEnqueue(type: string, payload: unknown): JobRecord {
  const allowed = ["echo", "delay", "fail", "kv.set"];
  if (!allowed.includes(type)) {
    throw Object.assign(
      new Error(`Unknown job type '${type}'. Allowed: ${allowed.join(", ")}`),
      { status: 400, code: "BAD_TYPE" },
    );
  }
  const job: JobRecord = {
    id: newId("job"),
    type,
    payload,
    state: "QUEUED",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    attempts: 0,
  };
  jobs.unshift(job);
  if (jobs.length > MAX_JOBS) jobs.length = MAX_JOBS;
  return job;
}

function setJob(job: JobRecord, patch: Partial<JobRecord>): JobRecord {
  Object.assign(job, patch, { updatedAt: Date.now() });
  return job;
}

export async function runJob(job: JobRecord): Promise<JobRecord> {
  setJob(job, { state: "RUNNING", attempts: job.attempts + 1 });
  try {
    if (job.type === "fail") {
      throw new Error("forced failure");
    }
    if (job.type === "delay") {
      await new Promise((r) => setTimeout(r, 25));
    }
    if (job.type === "kv.set") {
      const p = (job.payload ?? {}) as { key?: string; value?: unknown };
      if (!p.key) throw new Error("kv.set requires { key, value }");
      kvPut(p.key, p.value ?? null);
    }
    return setJob(job, {
      state: "SUCCEEDED",
      result: { type: job.type, payload: job.payload },
      error: undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const next: JobState = job.attempts >= 3 ? "FAILED" : "RETRYING";
    return setJob(job, {
      state: next === "RETRYING" ? "QUEUED" : next,
      error: message,
    });
  }
}

export async function jobsDrain(): Promise<{ ran: number; jobs: JobRecord[] }> {
  const queued = jobs.filter((j) => j.state === "QUEUED");
  const ran: JobRecord[] = [];
  for (const job of queued) ran.push(await runJob(job));
  return { ran: ran.length, jobs: ran };
}

export function webhooksList(): WebhookRecord[] {
  return webhooks.slice(0, 100);
}

export function webhooksIngest(
  path: string,
  headers: Record<string, string>,
  body: unknown,
): WebhookRecord {
  const rec: WebhookRecord = {
    id: newId("wh"),
    ts: Date.now(),
    path,
    headers,
    body,
  };
  webhooks.unshift(rec);
  if (webhooks.length > MAX_HOOKS) webhooks.length = MAX_HOOKS;
  return rec;
}

const MID: Record<string, number> = {
  EUR: 1,
  USD: 1.08,
  GBP: 0.84,
  SEK: 11.24,
  NOK: 11.62,
  DKK: 7.46,
};

export function fxQuote(from: string, to: string, amount: number) {
  const a = MID[from.toUpperCase()];
  const b = MID[to.toUpperCase()];
  if (a == null || b == null) {
    throw Object.assign(
      new Error(`Unknown pair ${from}/${to}. Known: ${Object.keys(MID).join(", ")}`),
      { status: 400, code: "BAD_PAIR" },
    );
  }
  if (!Number.isFinite(amount) || amount < 0) {
    throw Object.assign(new Error("amount must be a non-negative number"), {
      status: 400,
      code: "BAD_AMOUNT",
    });
  }
  const rate = b / a;
  return {
    from: from.toUpperCase(),
    to: to.toUpperCase(),
    amount,
    rate: Math.round(rate * 1e6) / 1e6,
    converted: Math.round(amount * rate * 1e4) / 1e4,
    as_of: new Date().toISOString(),
    source: "ss-code mid (deterministic)",
  };
}

const REG: Record<
  string,
  { name: string; seat: string; status: string; form: string }
> = {
  "5590000001": {
    name: "Wavult Group AB",
    seat: "Stockholm",
    status: "active",
    form: "AB",
  },
  "5590000002": {
    name: "Landvex AB",
    seat: "Stockholm",
    status: "active",
    form: "AB",
  },
  "5590000003": {
    name: "quiXzoom AB",
    seat: "Stockholm",
    status: "active",
    form: "AB",
  },
  "5560001234": {
    name: "Demobolaget AB",
    seat: "Göteborg",
    status: "active",
    form: "AB",
  },
};

export function companyLookup(orgnr: string) {
  const id = orgnr.replace(/\D/g, "");
  const row = REG[id];
  if (!row) {
    throw Object.assign(new Error(`No company for ${orgnr}`), {
      status: 404,
      code: "NOT_FOUND",
    });
  }
  return { orgnr: id, ...row };
}

export function resetProcess(): void {
  logs.length = 0;
  kv.clear();
  jobs.length = 0;
  webhooks.length = 0;
  seeded = false;
  seed();
}

export function seed(): void {
  if (seeded) return;
  seeded = true;

  kvPut("env", "preview");
  kvPut("region", "eu-north-1");
  kvPut("gateway.base", "https://wavult.example/v1");

  jobsEnqueue("echo", { note: "seed" });
  jobsEnqueue("delay", { wait_ms: 25 });

  webhooksIngest(
    "/api/ss/webhooks",
    { "content-type": "application/json" },
    { event: "process.boot", service: "ss-code" },
  );

  const t = Date.now();
  const methods = ["GET", "GET", "GET", "POST", "PUT"] as const;
  const paths = [
    "/api/ss/health",
    "/api/ss/stats",
    "/api/ss/kv",
    "/api/ss/fx/quote",
    "/api/ss/echo",
  ];
  for (let i = 0; i < 36; i++) {
    const status = i % 17 === 0 ? 404 : 200;
    recordLog({
      ts: t - (36 - i) * 1600,
      method: methods[i % methods.length] ?? "GET",
      path: paths[i % paths.length] ?? "/api/ss/health",
      status,
      ms: 4 + ((i * 7) % 38),
      requestId: newId("req"),
    });
  }
}

seed();
