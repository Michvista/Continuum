import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import { prisma } from "./db";
import { authRouter } from "./routes/auth";
import { patientsRouter } from "./routes/patients";
import { fragmentsRouter } from "./routes/fragments";
import { recallRouter } from "./routes/recall";
import { graphRouter } from "./routes/graph";
import { uploadsRouter } from "./routes/uploads";
import { resyncRouter } from "./routes/resync";

const app = express();
app.use(cors()); 
app.use(express.json({ limit: "5mb" }));
app.use(morgan("dev"));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRouter);
app.use("/api/patients", patientsRouter);
app.use("/api/fragments", fragmentsRouter);
app.use("/api/recall", recallRouter);
app.use("/api/graph", graphRouter);
app.use("/api/uploads", uploadsRouter);
app.use("/api/admin", resyncRouter); // local-only admin/dev utilities

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function start() {
  try {
    const maxAttempts = 5;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        // $connect() doesn't run a query on its own, so follow it with a tiny
        // real query. That is what actually proves Neon is reachable and the
        // schema/migrations match, not just that the URL parsed correctly.
        await prisma.$connect();
        await prisma.$queryRaw`SELECT 1`;
        console.log("✅ Connected to the database");
        break;
      } catch (err) {
        if (attempt === maxAttempts) throw err;
        const waitMs = 1500 * attempt;
        console.warn(
          `⚠️  Database connect attempt ${attempt} failed; retrying in ${waitMs}ms...`,
        );
        await sleep(waitMs);
      }
    }
  } catch (err) {
    console.error("❌ Could not connect to the database:", err);
    console.error(
      "   Check DATABASE_URL in backend/.env and that you've run `npx prisma migrate dev`.",
    );
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`Continuum backend listening on http://localhost:${PORT}`);
  });
}

start();
