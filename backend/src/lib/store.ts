import path from "node:path";
import { readJsonFile, writeJsonFile } from "./jsonFile.js";
import type { PricePoint, Product } from "../types.js";

type DbShape = {
  products: Product[];
  prices: PricePoint[];
};

const dbPath = path.resolve(process.cwd(), "..", "data", "db.json");

function normalizeSite(labelOrUrl: string): "naver" | "coupang" | "oliveyoung" {
  const s = `${labelOrUrl}`.toLowerCase();
  if (s.includes("coupang") || s.includes("쿠팡")) return "coupang";
  if (s.includes("olive") || s.includes("올리브")) return "oliveyoung";
  return "naver";
}

function migrateProduct(raw: any): Product {
  const now = new Date().toISOString();

  const createdAt = typeof raw?.createdAt === "string" ? raw.createdAt : now;
  const updatedAt = typeof raw?.updatedAt === "string" ? raw.updatedAt : now;

  // competitors: legacy -> new
  const competitors = Array.isArray(raw?.competitors) ? raw.competitors : [];
  const migratedCompetitors = competitors
    .map((c: any) => {
      // legacy: {id,label,url,parser,selector}
      if (c && typeof c === "object") {
        if (c.site && (c.site === "naver" || c.site === "coupang" || c.site === "oliveyoung")) {
          return {
            site: c.site,
            url: String(c.url ?? ""),
            selector: c.selector ? String(c.selector) : undefined
          };
        }
        const url = String(c.url ?? "");
        const label = String(c.label ?? "");
        return {
          site: normalizeSite(label || url),
          url,
          selector: c.selector ? String(c.selector) : undefined
        };
      }
      return null;
    })
    .filter(Boolean) as Product["competitors"];

  const excludeKeywordRaw = raw?.excludeKeyword;
  const excludeKeyword = Array.isArray(excludeKeywordRaw)
    ? excludeKeywordRaw.map((x: any) => String(x)).filter(Boolean)
    : typeof excludeKeywordRaw === "string"
      ? excludeKeywordRaw
          .split(/[,\n]/)
          .map((x: string) => x.trim())
          .filter(Boolean)
      : [];

  const migrated: Product = {
    id: String(raw?.id ?? ""),
    sku: raw?.sku != null ? String(raw.sku) : undefined,
    name: String(raw?.name ?? ""),
    brand: raw?.brand != null ? String(raw.brand) : undefined,
    volume: raw?.volume != null ? String(raw.volume) : undefined,
    barcode: raw?.barcode != null ? String(raw.barcode) : undefined,
    ourPrice:
      raw?.ourPrice == null || raw.ourPrice === ""
        ? undefined
        : Number.isFinite(Number(raw.ourPrice))
          ? Number(raw.ourPrice)
          : undefined,
    searchKeyword: raw?.searchKeyword != null ? String(raw.searchKeyword) : undefined,
    excludeKeyword,
    targetPricePolicy: raw?.targetPricePolicy != null ? String(raw.targetPricePolicy) : undefined,
    managerId: raw?.managerId != null ? String(raw.managerId) : undefined,
    competitors: migratedCompetitors,
    createdAt,
    updatedAt
  };

  return migrated;
}

async function readDb(): Promise<DbShape> {
  const raw = await readJsonFile<any>(dbPath, { products: [], prices: [] });

  const productsRaw: unknown[] = Array.isArray(raw?.products) ? raw.products : [];
  const pricesRaw: unknown[] = Array.isArray(raw?.prices) ? raw.prices : [];

  const migratedProducts: Product[] = productsRaw
    .map((row) => migrateProduct(row))
    .filter((p: Product) => Boolean(p.id && p.name));

  const db: DbShape = {
    products: migratedProducts,
    prices: pricesRaw as PricePoint[]
  };

  // 한 번이라도 스키마가 달라졌다면 저장(자동 마이그레이션)
  const shouldRewrite =
    JSON.stringify(raw?.products ?? []) !== JSON.stringify(db.products) ||
    JSON.stringify(raw?.prices ?? []) !== JSON.stringify(db.prices);
  if (shouldRewrite) await writeDb(db);

  return db;
}

async function writeDb(db: DbShape): Promise<void> {
  await writeJsonFile(dbPath, db);
}

export const store = {
  async listProducts() {
    const db = await readDb();
    return db.products;
  },
  async getProduct(id: string) {
    const db = await readDb();
    return db.products.find((p: Product) => p.id === id) ?? null;
  },
  async upsertProduct(product: Product) {
    const db = await readDb();
    const idx = db.products.findIndex((p: Product) => p.id === product.id);
    if (idx >= 0) db.products[idx] = product;
    else db.products.unshift(product);
    await writeDb(db);
    return product;
  },
  async bulkUpsertProducts(products: Product[]) {
    const db = await readDb();
    const byId = new Map(db.products.map((p: Product) => [p.id, p] as const));
    for (const p of products) byId.set(p.id, p);
    db.products = [...byId.values()].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    await writeDb(db);
    return products;
  },
  async deleteProduct(id: string) {
    const db = await readDb();
    db.products = db.products.filter((p: Product) => p.id !== id);
    db.prices = db.prices.filter((x) => x.productId !== id);
    await writeDb(db);
  },
  async clearAll() {
    const db = await readDb();
    db.products = [];
    db.prices = [];
    await writeDb(db);
    return { ok: true };
  },
  async addPrices(points: PricePoint[]) {
    const db = await readDb();
    db.prices.unshift(...points);
    db.prices = db.prices.slice(0, 5000);
    await writeDb(db);
  },
  async listLatestPricesByProduct(productId: string) {
    const db = await readDb();
    const points = db.prices.filter((x: PricePoint) => x.productId === productId);
    const latestByCompetitor = new Map<string, PricePoint>();
    for (const p of points) {
      if (!latestByCompetitor.has(p.competitorId)) latestByCompetitor.set(p.competitorId, p);
    }
    return [...latestByCompetitor.values()];
  },
  async listRecentPrices(limit = 200) {
    const db = await readDb();
    return db.prices.slice(0, limit);
  }
};

