declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    COLLECTIONS_MCP_TOKEN_SHA256?: string;
    COLLECTIONS_MCP_OWNER_ID?: string;
  }
}
