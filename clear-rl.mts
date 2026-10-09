import { getDb } from "./api/queries/connection";
import { rateLimitEvents } from "./db/schema";
import { eq } from "drizzle-orm";
const db = getDb();
await db.delete(rateLimitEvents).where(eq(rateLimitEvents.bucket, "apply"));
console.log("rate limit events cleared");
process.exit(0);
