import { Router } from "express";
import { z } from "zod";
import { store } from "../lib/store.js";
import { id } from "../lib/id.js";
import { fetchPrice } from "../crawlers/generic.js";
import type { PricePoint } from "../types.js";
import { fetchNaverLowestPrice } from "../services/naverShopping.js";

export const pricesRouter = Router();

pricesRouter.get("/recent", async (req, res) => {
  const limit = Number(req.query.limit ?? 200);
  const items = await store.listRecentPrices(Number.isFinite(limit) ? limit : 200);
  res.json(items);
});

pricesRouter.get("/latest/:productId", async (req, res) => {
  const items = await store.listLatestPricesByProduct(req.params.productId);
  res.json(items);
});

const refreshSchema = z.object({
  productId: z.string()
});

pricesRouter.post("/refresh", async (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const product = await store.getProduct(parsed.data.productId);
  if (!product) return res.status(404).json({ message: "product not found" });

  const fetchedAt = new Date().toISOString();

  const points: PricePoint[] = [];

  for (const c of product.competitors) {
    try {
      const price = await fetchPrice(c);
      points.push({
        id: id("price"),
        productId: product.id,
        competitorId: c.site,
        competitorLabel: c.site,
        url: c.url,
        price,
        currency: "KRW",
        fetchedAt,
        status: "ok"
      });
    } catch (e) {
      points.push({
        id: id("price"),
        productId: product.id,
        competitorId: c.site,
        competitorLabel: c.site,
        url: c.url,
        price: null,
        currency: "KRW",
        fetchedAt,
        status: "error",
        errorMessage: e instanceof Error ? e.message : "unknown error"
      });
    }
  }

  await store.addPrices(points);
  res.json({ ok: true, points });
});

pricesRouter.get("/naver/:productId", async (req, res) => {
  const product = await store.getProduct(req.params.productId);
  if (!product) return res.status(404).json({ message: "product not found" });

  // 기본: OpenAPI 기반(빠르고 안정적)
  const result = await fetchNaverLowestPrice(product);

  const point: PricePoint = {
    id: id("price"),
    productId: product.id,
    competitorId: "naver",
    competitorLabel: result.selected?.mallName || "naver",
    url: result.selected?.link || "",
    price: result.error ? null : result.marketPrice,
    rawPrice: result.error ? undefined : result.lowestPrice ?? undefined,
    shippingFee: result.error ? undefined : result.selected?.shippingFee,
    effectivePrice: result.error ? undefined : result.marketPrice ?? undefined,
    trustScore: result.error ? undefined : result.selected?.trustScore,
    currency: "KRW",
    fetchedAt: result.fetchedAt,
    status: result.error ? "error" : "ok",
    errorMessage: result.error ? `${result.error}${result.message ? `: ${result.message}` : ""}` : undefined
  };

  await store.addPrices([point]);
  res.json(result);
});

pricesRouter.get("/naver/:productId/candidates", async (req, res) => {
  const product = await store.getProduct(req.params.productId);
  if (!product) return res.status(404).json({ message: "product not found" });

  // 기본: OpenAPI 기반 후보
  const result = await fetchNaverLowestPrice(product, { includeCandidates: true });

  const point: PricePoint = {
    id: id("price"),
    productId: product.id,
    competitorId: "naver",
    competitorLabel: result.selected?.mallName || "naver",
    url: result.selected?.link || "",
    price: result.error ? null : result.marketPrice,
    rawPrice: result.error ? undefined : result.lowestPrice ?? undefined,
    shippingFee: result.error ? undefined : result.selected?.shippingFee,
    effectivePrice: result.error ? undefined : result.marketPrice ?? undefined,
    trustScore: result.error ? undefined : result.selected?.trustScore,
    currency: "KRW",
    fetchedAt: result.fetchedAt,
    status: result.error ? "error" : "ok",
    errorMessage: result.error ? `${result.error}${result.message ? `: ${result.message}` : ""}` : undefined
  };

  await store.addPrices([point]);
  // MD 디버깅 전용: 후보 리스트를 항상 확인 가능하도록 보장
  res.json({
    ...result,
    _allCandidates: result._allCandidates ?? []
  });
});

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

pricesRouter.post("/refresh-all", async (_req, res) => {
  const products = await store.listProducts();

  const results = [];
  let success = 0;
  let noTrustedSeller = 0;
  let errors = 0;

  for (let i = 0; i < products.length; i += 1) {
    const p = products[i]!;
    const r = await fetchNaverLowestPrice(p);
    results.push(r);

    const point: PricePoint = {
      id: id("price"),
      productId: p.id,
      competitorId: "naver",
      competitorLabel: r.selected?.mallName || "naver",
      url: r.selected?.link || "",
      price: r.error ? null : r.marketPrice,
      rawPrice: r.error ? undefined : r.lowestPrice ?? undefined,
      shippingFee: r.error ? undefined : r.selected?.shippingFee,
      effectivePrice: r.error ? undefined : r.marketPrice ?? undefined,
      trustScore: r.error ? undefined : r.selected?.trustScore,
      currency: "KRW",
      fetchedAt: r.fetchedAt,
      status: r.error ? "error" : "ok",
      errorMessage: r.error ? `${r.error}${r.message ? `: ${r.message}` : ""}` : undefined
    };
    await store.addPrices([point]);

    if (!r.error) success += 1;
    else if (r.error === "NO_TRUSTED_SELLER") noTrustedSeller += 1;
    else errors += 1;

    if (i < products.length - 1) await sleep(500);
  }

  res.json({
    total: products.length,
    success,
    noTrustedSeller,
    errors,
    results
  });
});

