import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { connectDb } from "./db.js";
import { createApp, assertAuthConfig } from "./app.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

try {
  assertAuthConfig();
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || "127.0.0.1";

await connectDb();
const app = createApp();
app.listen(PORT, HOST, () => {
  console.log(`Bokflöde API på http://${HOST}:${PORT}`);
});
