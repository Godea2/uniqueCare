import { getRequestListener } from "@hono/node-server";
import app from "./boot.mjs";

const listener = getRequestListener(app.fetch);

export default function handler(req, res) {
  const url = req.url ?? "";
  if (url.startsWith("/api/index.js")) {
    const forwarded = req.headers["x-forwarded-uri"] ?? req.headers["x-invoke-path"];
    if (
      typeof forwarded === "string" &&
      forwarded.startsWith("/api/") &&
      !forwarded.startsWith("/api/index.js")
    ) {
      req.url = forwarded;
    }
  }
  return listener(req, res);
}
