export type Product = {
  id: string;
  sku?: string;
  name: string;
  brand?: string;
  volume?: string;
  barcode?: string;
  ourPrice?: number;
  searchKeyword?: string;
  excludeKeyword: string[];
  targetPricePolicy?: string;
  managerId?: string;
  competitors: CompetitorTarget[];
  createdAt: string;
  updatedAt: string;
};

export type CompetitorTarget = {
  site: "naver" | "coupang" | "oliveyoung";
  url: string;
  selector?: string;
};

export type PricePoint = {
  id: string;
  productId: string;
  competitorId: string; // competitor key (site or legacy id)
  competitorLabel: string; // UI 표시용 (site 등)
  url: string;
  price: number | null;
  currency: "KRW";
  fetchedAt: string;
  status: "ok" | "error";
  errorMessage?: string;

  // optional metadata (예: 네이버 쇼핑)
  rawPrice?: number;
  shippingFee?: number;
  effectivePrice?: number;
  trustScore?: number;
};

