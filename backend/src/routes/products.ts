import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import * as XLSX from "xlsx";
import { id } from "../lib/id.js";
import { store } from "../lib/store.js";
import type { Product } from "../types.js";

export const productsRouter = Router();

const competitorSchema = z.object({
  site: z.enum(["naver", "coupang", "oliveyoung"]),
  url: z.string().url(),
  selector: z.string().optional()
});

const upsertSchema = z.object({
  id: z.string().optional(),
  sku: z.string().optional(),
  name: z.string().min(1),
  brand: z.string().optional(),
  volume: z.string().optional(),
  barcode: z.string().optional(),
  ourPrice: z.number().optional(),
  searchKeyword: z.string().optional(),
  excludeKeyword: z.array(z.string()).optional(),
  targetPricePolicy: z.string().optional(),
  managerId: z.string().optional(),
  competitors: z.array(competitorSchema).default([])
});

productsRouter.get("/", async (_req, res) => {
  const items = await store.listProducts();
  res.json(items);
});

productsRouter.get("/upload-template", async (_req, res) => {
  // 실무용 업로드 양식: 순번/제품명/가격, 200행 빈칸
  const aoa: Array<Array<string | number>> = [["순번", "제품명", "가격"]];
  for (let i = 1; i <= 200; i += 1) aoa.push([i, "", ""]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 8 }, { wch: 48 }, { wch: 14 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "업로드양식");

  const buf = XLSX.write(wb, { bookType: "xlsx", type: "buffer" }) as unknown as Buffer;
  res.setHeader("content-type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("content-disposition", 'attachment; filename="products_upload_template_200.xlsx"');
  res.send(buf);
});

const clearAllSchema = z.object({
  confirm: z.literal("DELETE")
});

// 전체 삭제(2단계 확인용): body에 {"confirm":"DELETE"} 가 있어야만 실행
productsRouter.delete("/", async (req, res) => {
  const parsed = clearAllSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'confirm 값이 필요합니다. body: {"confirm":"DELETE"}' });

  await store.clearAll();
  res.json({ ok: true });
});

productsRouter.get("/:id", async (req, res) => {
  const p = await store.getProduct(req.params.id);
  if (!p) return res.status(404).json({ message: "not found" });
  res.json(p);
});

productsRouter.post("/", async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const now = new Date().toISOString();
  const body = parsed.data;

  const existing = body.id ? await store.getProduct(body.id) : null;

  const product: Product = {
    id: body.id ?? id("prod"),
    sku: body.sku,
    name: body.name,
    brand: body.brand,
    volume: body.volume,
    barcode: body.barcode,
    ourPrice: body.ourPrice,
    searchKeyword: body.searchKeyword ?? body.name,
    excludeKeyword: body.excludeKeyword ?? [],
    targetPricePolicy: body.targetPricePolicy,
    managerId: body.managerId,
    competitors: body.competitors,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };

  await store.upsertProduct(product);
  res.json(product);
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }
});

function normalizeHeader(s: unknown) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[()]/g, "");
}

function toStringOrUndef(v: any): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s ? s : undefined;
}

function toNumberOrUndef(v: any): number | undefined {
  if (v == null || v === "") return undefined;
  // 엑셀/문자 혼합 입력 대응: "12,300원", "12300", 12300 모두 허용
  const n = Number(String(v).replace(/[,]/g, "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

function parseExcludeKeywords(v: any): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  const s = String(v ?? "").trim();
  if (!s) return [];
  return s
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

productsRouter.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "file is required (field: file)" });

  const wb = XLSX.read(req.file.buffer, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return res.status(400).json({ message: "empty workbook" });
  const ws = wb.Sheets[sheetName];

  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" });
  if (!rows.length) return res.status(400).json({ message: "empty sheet" });

  // 실무 단순화 업로드: "제품명", "판매가" 2개 컬럼 우선 사용
  const existing = await store.listProducts();
  const byName = new Map(existing.map((p) => [p.name, p] as const));

  const mapped: Product[] = [];
  let inserted = 0;
  let updated = 0;
  let failed = 0;
  const now = new Date().toISOString();

  for (const r of rows) {
    // 키 정규화
    const byKey = new Map<string, any>();
    for (const [k, v] of Object.entries(r)) byKey.set(normalizeHeader(k), v);

    const name = toStringOrUndef(byKey.get("제품명") ?? byKey.get("productname") ?? byKey.get("name") ?? byKey.get("상품명"));
    const ourPrice = toNumberOrUndef(
      byKey.get("판매가") ??
        byKey.get("가격") ??
        byKey.get("ourprice") ??
        byKey.get("우리판매가") ??
        byKey.get("price")
    );
    if (!name || ourPrice == null) {
      failed += 1;
      continue;
    }

    const prev = byName.get(name);

    mapped.push({
      id: prev?.id ?? id("prod"),
      sku: prev?.sku,
      name,
      brand: prev?.brand,
      volume: prev?.volume,
      barcode: prev?.barcode,
      ourPrice,
      searchKeyword: name,
      excludeKeyword: prev?.excludeKeyword ?? [],
      targetPricePolicy: prev?.targetPricePolicy,
      managerId: prev?.managerId,
      competitors: [],
      createdAt: prev?.createdAt ?? now,
      updatedAt: now
    });

    if (prev) updated += 1;
    else inserted += 1;
  }

  if (!mapped.length) return res.status(400).json({ message: "no valid rows" });

  await store.bulkUpsertProducts(mapped);
  res.json({
    ok: true,
    totalRows: rows.length,
    inserted,
    updated,
    failed
  });
});

productsRouter.delete("/:id", async (req, res) => {
  await store.deleteProduct(req.params.id);
  res.json({ ok: true });
});

