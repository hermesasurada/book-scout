/// <reference types="@cloudflare/workers-types" />

// Bindings and vars this app reads from `cloudflare:workers` env.
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
  }
}
