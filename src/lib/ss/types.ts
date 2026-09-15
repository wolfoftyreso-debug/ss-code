export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type JobState =
  | "QUEUED"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "RETRYING";

export type LogEntry = {
  id: string;
  ts: number;
  method: string;
  path: string;
  status: number;
  ms: number;
  requestId: string;
};

export type KvRecord = {
  key: string;
  value: unknown;
  updatedAt: number;
};

export type JobRecord = {
  id: string;
  type: string;
  payload: unknown;
  state: JobState;
  createdAt: number;
  updatedAt: number;
  attempts: number;
  result?: unknown;
  error?: string;
};

export type WebhookRecord = {
  id: string;
  ts: number;
  path: string;
  headers: Record<string, string>;
  body: unknown;
};

export type RouteDef = {
  id: string;
  method: HttpMethod;
  path: string;
  title: string;
  summary: string;
  source: string;
  sample?: {
    body?: string;
    query?: string;
  };
};

export type RuntimeStats = {
  startedAt: number;
  uptimeMs: number;
  requests: number;
  errors: number;
  p95Ms: number;
  kvKeys: number;
  jobsQueued: number;
  webhooks: number;
  buckets: { t: number; n: number; errors: number }[];
};

export type Envelope<T = unknown> = {
  ok: boolean;
  request_id: string;
  ms: number;
  data?: T;
  error?: { code: string; message: string };
};
