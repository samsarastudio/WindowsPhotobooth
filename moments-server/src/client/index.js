import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
dotenv.config({
  path: path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../.env.client",
  ),
});
const { createClientApp } = await import("./server.js");
const service = createClientApp();
const port = Number(process.env.CLIENT_PORT || 3022);
const server = service.app.listen(
  port,
  process.env.CLIENT_HOST || "127.0.0.1",
  () =>
    console.log(
      `Moments Client Gallery listening at http://${process.env.CLIENT_HOST || "127.0.0.1"}:${port}`,
    ),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () =>
    server.close(() => {
      service.close();
      process.exit(0);
    }),
  );
