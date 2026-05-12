import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import express from "express";
import cors from "cors";
import { productsRouter } from "./routes/products.js";
import { pricesRouter } from "./routes/prices.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();

app.use(cors({ origin: true }));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// 디버깅용: 비밀값은 노출하지 않고 "존재 여부"만 확인
app.get("/health/env", (_req, res) => {
  res.json({
    ok: true,
    hasNaverClientId: Boolean(process.env.NAVER_CLIENT_ID),
    hasNaverClientSecret: Boolean(process.env.NAVER_CLIENT_SECRET)
  });
});

app.use("/api/products", productsRouter);
app.use("/api/prices", pricesRouter);

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[backend] listening on http://localhost:${port}`);
});

