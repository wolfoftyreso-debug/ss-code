# SS Code

Server-side runtime. Live process, real HTTP handlers.

This is the engine room: health, stats, request log, KV, jobs, webhooks, FX quotes, and a stub company registry. The console talks to the same handlers over `/api/ss/*`.

## API

All responses:

```json
{ "ok": true, "request_id": "req_…", "ms": 4, "data": {} }
```

Errors use `ok: false` and `{ code, message }`.

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/ss` | Route catalog |
| GET | `/api/ss/health` | Liveness |
| GET | `/api/ss/stats` | Counters, p95, 60s buckets |
| GET | `/api/ss/logs?limit=` | Recent requests (max 200) |
| POST | `/api/ss/echo` | Echo JSON body |
| GET | `/api/ss/kv` | List keys |
| GET/PUT/DELETE | `/api/ss/kv/:key` | Key-value. PUT body `{ "value": … }` |
| GET | `/api/ss/jobs` | Job list |
| POST | `/api/ss/jobs` | Enqueue `{ type, payload }` — `echo`, `delay`, `fail`, `kv.set` |
| POST | `/api/ss/jobs/drain` | Run queued jobs in this process |
| GET/POST | `/api/ss/webhooks` | Inbox / ingest |
| GET | `/api/ss/fx/quote?from=EUR&to=SEK&amount=100` | Deterministic mid |
| GET | `/api/ss/company/:orgnr` | Stub registry. Try `5590000001` |
| POST | `/api/ss/reset` | Reseed the in-process store |

State is **in-process**. It is not a database. HTTP is not a queue — drain jobs explicitly.

## Layout

```
src/lib/ss/runtime.ts    Store, jobs, KV, seed
src/lib/ss/dispatch.ts   HTTP matcher
src/lib/ss/catalog.ts    Route inventory + source
```
