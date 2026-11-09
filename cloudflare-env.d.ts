declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    NEXO_SUPABASE_URL?: string;
    NEXO_SIGNING_KEY?: string;
    BUCKET?: R2Bucket;
  }
}
