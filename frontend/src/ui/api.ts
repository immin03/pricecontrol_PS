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
  competitorId: string;
  competitorLabel: string;
  url: string;
  price: number | null;
  currency: "KRW";
  fetchedAt: string;
  status: "ok" | "error";
  errorMessage?: string;
};

export type NaverCandidate = {
  title: string;
  mallName: string;
  price: number;
  shippingFee: number;
  effectivePrice: number;
  trustScore: number;
  excludedReason?:
    | "HARD_FILTER_EXCLUDE_KEYWORD"
    | "VOLUME_MISMATCH"
    | "TOKEN_MISMATCH"
    | "LOW_SCORE"
    | "PASSED";
  matchedExcludeKeyword?: string;
  excludedMessage?: string;
  missingTokens?: string[];
  isPassed: boolean;
  link: string;
};

export type NaverPriceResult = {
  productId: string;
  site: "naver";
  marketPrice: number | null;
  lowestPrice: number | null;
  filteredLowestPrice: number | null;
  ourPrice: number;
  diff: number | null;
  status: "정상" | "조정필요" | "긴급조정" | "조회실패";
  selected?: {
    mallName: string;
    title: string;
    link: string;
    effectivePrice: number;
    shippingFee: number;
    price: number;
    trustScore: number;
  };
  totalCandidates: number;
  filteredCount: number;
  fetchedAt: string;
  error?: "NO_TRUSTED_SELLER" | "API_ERROR" | "NO_RESULT" | "NO_MATCHED_PRODUCT";
  message?: string;
  _allCandidates?: NaverCandidate[];
};

export type RefreshAllResponse = {
  total: number;
  success: number;
  noTrustedSeller: number;
  errors: number;
  results: NaverPriceResult[];
};

export type UploadProductsResponse = {
  ok: true;
  totalRows: number;
  inserted: number;
  updated: number;
  failed: number;
};

function apiBase() {
  const base = (import.meta as any)?.env?.VITE_API_BASE_URL as string | undefined;
  if (!base) return "";
  return base.replace(/\/+$/, "");
}

function withBase(path: string) {
  const base = apiBase();
  if (!base) return path;
  if (!path.startsWith("/")) return `${base}/${path}`;
  return `${base}${path}`;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(withBase(path), {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(init?.headers ?? {})
      }
    });
  } catch {
    const hint =
      apiBase() === ""
        ? "백엔드에 연결할 수 없습니다. `backend` 폴더에서 `npm run dev`로 서버(기본 http://localhost:4000)를 켠 뒤 다시 시도하세요."
        : `API 서버에 연결할 수 없습니다. VITE_API_BASE_URL(${apiBase()})이 올바른지 확인하세요.`;
    throw new Error(hint);
  }
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as T;
}

export const backend = {
  listProducts: () => api<Product[]>("/api/products"),
  upsertProduct: (p: Partial<Product> & Pick<Product, "name" | "competitors">) =>
    api<Product>("/api/products", { method: "POST", body: JSON.stringify(p) }),
  deleteProduct: (id: string) => api<{ ok: true }>(`/api/products/${id}`, { method: "DELETE" }),
  clearAllProducts: () =>
    api<{ ok: true }>("/api/products", { method: "DELETE", body: JSON.stringify({ confirm: "DELETE" }) }),
  refreshPrices: (productId: string) =>
    api<{ ok: true; points: PricePoint[] }>("/api/prices/refresh", {
      method: "POST",
      body: JSON.stringify({ productId })
    }),
  refreshAllNaver: () => api<RefreshAllResponse>("/api/prices/refresh-all", { method: "POST" }),
  naverPrice: (productId: string) => api<NaverPriceResult>(`/api/prices/naver/${productId}`),
  naverCandidates: (productId: string) =>
    api<NaverPriceResult>(`/api/prices/naver/${productId}/candidates`),
  uploadProductsXlsx: async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    let res: Response;
    try {
      res = await fetch(withBase("/api/products/upload"), { method: "POST", body: fd });
    } catch {
      throw new Error(
        apiBase() === ""
          ? "업로드 실패: 백엔드에 연결할 수 없습니다. backend에서 `npm run dev`를 실행했는지 확인하세요."
          : "업로드 실패: API 서버에 연결할 수 없습니다. VITE_API_BASE_URL을 확인하세요."
      );
    }
    if (!res.ok) throw new Error(await res.text());
    return (await res.json()) as UploadProductsResponse;
  },
  downloadUploadTemplateXlsx: async () => {
    let res: Response;
    try {
      res = await fetch(withBase("/api/products/upload-template"));
    } catch {
      throw new Error(
        apiBase() === ""
          ? "양식 다운로드 실패: 백엔드가 꺼져 있을 수 있습니다. backend에서 `npm run dev`를 실행하세요."
          : "양식 다운로드 실패: API 서버 연결을 확인하세요."
      );
    }
    if (!res.ok) throw new Error(await res.text());
    return await res.blob();
  },
  latestPrices: (productId: string) => api<PricePoint[]>(`/api/prices/latest/${productId}`),
  recentPrices: (limit = 200) => api<PricePoint[]>(`/api/prices/recent?limit=${limit}`)
};

