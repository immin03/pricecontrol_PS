import type { Product } from "../types.js";

export type NaverCandidate = {
  mallName: string;
  title: string;
  price: number;
  shippingFee: number;
  effectivePrice: number;
  trustScore: number;
  link: string;
  excludedReason?: "HARD_FILTER_EXCLUDE_KEYWORD" | "VOLUME_MISMATCH" | "TOKEN_MISMATCH" | "LOW_SCORE" | "PASSED";
  matchedExcludeKeyword?: string;
  excludedMessage?: string;
  missingTokens?: string[];
  isPassed: boolean;
};

export type NaverPriceResult = {
  productId: string;
  site: "naver";
  // 가격 분석 결과
  marketPrice: number | null;
  lowestPrice: number | null;
  filteredLowestPrice: number | null;
  ourPrice: number;
  diff: number | null;
  status: "정상" | "조정필요" | "긴급조정" | "조회실패";

  // 참고용 메타
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

type NaverShopItem = {
  title?: string;
  link?: string;
  lprice?: string | number;
  mallName?: string;
  // 네이버 응답에 항상 있는 필드는 아니지만, 요구사항에 맞게 존재 시 사용
  reviewCount?: number | string;
  purchaseCnt?: number | string;
  shippingCost?: number | string;
};

type NaverShopResponse = {
  items?: NaverShopItem[];
};

function stripTags(html: string) {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function includesIgnoreCase(haystack: string, needle: string) {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

// 2. 정규화 함수 (상품명/후보 title 비교용)
export function normalizeText(text: string) {
  const noTags = stripTags(String(text ?? ""));
  return noTags
    .toLowerCase()
    .replace(/[()（）\[\]{}]/g, "")
    .replace(/\s+/g, "")
    .replace(/[^0-9a-z가-힣]/g, "");
}

function normalizeCoreToken(rawToken: string) {
  // 실무형 "표기 흔들림" 보정만 적용 (유사어/부분유사도 매칭 금지)
  // 예: "가글액" vs "가글"
  const t = normalizeText(rawToken);
  if (!t) return "";
  if (t === "가글액") return "가글";
  return t;
}

type UnitGroup = "BOTTLE" | "DAY" | "PILL" | "SACHET";
type UnitSpec = { n: number; group: UnitGroup };

const VOLUME_TOKEN_RE =
  /^(\d+)\s*(개|병|회분|일|일분|정|포|스틱)$/;

function isVolumeToken(token: string) {
  const t = token.trim();
  if (!t) return false;
  if (/^1\s*개월$/.test(t)) return true;
  if (/^한\s*달$/.test(t) || /^한달$/.test(t)) return true;
  return VOLUME_TOKEN_RE.test(t);
}

function extractCoreTokens(productName: string) {
  // 3. 핵심 제품명 토큰: 용량 표현을 제외한 토큰(공백 기준)
  return productName
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => !isVolumeToken(t))
    .map((raw) => ({ raw, norm: normalizeCoreToken(raw) }))
    .filter((x) => x.norm);
}

function extractUnitSpec(productNameOrTitle: string): UnitSpec | null {
  // 4. 용량/단위 필터: 숫자+단위 추출
  const text = String(productNameOrTitle ?? "");

  // month synonyms -> DAY(30)
  if (/1\s*개월|한\s*달|한달/.test(text)) return { n: 30, group: "DAY" };

  const patterns: Array<{ re: RegExp; group: UnitGroup }> = [
    { re: /(\d+)\s*(개|병|회분)/, group: "BOTTLE" },
    { re: /(\d+)\s*(일분|일)/, group: "DAY" },
    { re: /(\d+)\s*정/, group: "PILL" },
    { re: /(\d+)\s*(포|스틱)/, group: "SACHET" }
  ];
  for (const p of patterns) {
    const m = text.match(p.re);
    if (!m) continue;
    const n = Number(m[1]);
    if (!Number.isFinite(n) || n <= 0) continue;
    return { n, group: p.group };
  }
  return null;
}

function isCompatibleUnitGroup(productGroup: UnitGroup, titleGroup: UnitGroup) {
  // 4-B: DAY는 BOTTLE과 호환
  if (productGroup === titleGroup) return true;
  if (productGroup === "DAY" && titleGroup === "BOTTLE") return true;
  if (productGroup === "BOTTLE" && titleGroup === "DAY") return true;
  return false;
}

function matchesVolume(productName: string, title: string) {
  const productSpec = extractUnitSpec(productName);
  if (!productSpec) return true; // 상품명에 용량이 없으면 용량 필터 미적용

  const titleSpec = extractUnitSpec(title);
  if (!titleSpec) return false;

  if (productSpec.n !== titleSpec.n) return false;
  return isCompatibleUnitGroup(productSpec.group, titleSpec.group);
}

function toNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[,]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function getShippingCost(item: NaverShopItem): number {
  const fromField = toNumber(item.shippingCost);
  if (fromField != null) return Math.max(0, Math.floor(fromField));
  const mallName = String(item.mallName ?? "");
  if (includesIgnoreCase(mallName, "무료")) return 0;
  return 3000;
}

function hardFilterReason(
  product: Product,
  item: NaverShopItem
): {
  reason: NaverCandidate["excludedReason"];
  matchedExcludeKeyword?: string;
  message: string;
  missingTokens?: string[];
} | null {
  const title = stripTags(String(item.title ?? ""));
  const mallName = String(item.mallName ?? "");

  const productName = String(product.name ?? "");

  // 5-1) 핵심 토큰 필터 (용량 제외)
  const coreTokens = extractCoreTokens(productName);
  const normTitle = normalizeText(title);
  const missing = coreTokens.filter((t) => !normTitle.includes(t.norm)).map((t) => t.raw);
  if (missing.length > 0) return { reason: "TOKEN_MISMATCH", message: "상품명 불일치", missingTokens: missing };

  // 5-2) 용량/단위 필터
  if (!matchesVolume(productName, title)) return { reason: "VOLUME_MISMATCH", message: "용량 불일치" };

  // 5-3) 배송비 하드 필터
  // - 배송비가 3,600원 이상이면 장난질 케이스가 많아 비교 대상에서 제외
  const shippingFee = getShippingCost(item);
  if (shippingFee >= 3600) {
    return {
      reason: "HARD_FILTER_EXCLUDE_KEYWORD",
      matchedExcludeKeyword: "배송비 3600+",
      message: "배송비가 3,600원 이상이라 제외"
    };
  }

  // 5-4) 하드 제외 키워드
  const hardKeywords = ["체험팩", "낱개", "소분", "샘플", "미개봉 중고", "리필", "해외배송"];
  const matchedHard = hardKeywords.find((kw) => includesIgnoreCase(title, kw));
  if (matchedHard) {
    return {
      reason: "HARD_FILTER_EXCLUDE_KEYWORD",
      matchedExcludeKeyword: matchedHard,
      message: `${matchedHard} 키워드 포함으로 제외`
    };
  }

  // NOTE:
  // - "7일" / "7병" / "7일 증정" 등은 정상 상품에도 흔히 포함될 수 있어
  //   어떤 경우에도 하드필터로 제외하지 않습니다.

  // reviewCount < 5 (응답에 없으면 하드필터 적용 안 함)
  const reviewCount = toNumber(item.reviewCount);
  if (reviewCount != null && reviewCount < 5) {
    return { reason: "HARD_FILTER_EXCLUDE_KEYWORD", message: "리뷰 수가 너무 적어 제외 (reviewCount<5)" };
  }

  // purchaseCnt 존재 시 < 10
  const purchaseCnt = toNumber(item.purchaseCnt);
  if (purchaseCnt != null && purchaseCnt < 10) {
    return { reason: "HARD_FILTER_EXCLUDE_KEYWORD", message: "구매 수가 너무 적어 제외 (purchaseCnt<10)" };
  }

  // mallName banned tokens
  const banned = ["개인셀러", "중고나라", "구매대행"];
  const bannedMatched = banned.find((b) => includesIgnoreCase(mallName, b));
  if (bannedMatched) {
    return { reason: "HARD_FILTER_EXCLUDE_KEYWORD", message: `판매처(${bannedMatched})로 제외` };
  }

  return null;
}

function calcTrustScore(product: Product, item: NaverShopItem, lprice: number): number {
  let score = 0;
  const mallName = String(item.mallName ?? "");

  if (product.brand && includesIgnoreCase(mallName, product.brand)) score += 30;

  const purchaseCnt = toNumber(item.purchaseCnt);
  if (purchaseCnt != null && purchaseCnt >= 100) score += 25;

  const reviewCount = toNumber(item.reviewCount);
  if (reviewCount != null && reviewCount >= 50) score += 20;

  const trustedTokens = [
    "공식",
    "스토어",
    "본사",
    "직영",
    "정품",
    "브랜드",
    "올리브영",
    "쿠팡",
    "네이버",
    "스마트스토어"
  ];
  if (trustedTokens.some((t) => includesIgnoreCase(mallName, t))) score += 15;

  // reseller suspicion by price deviation from ourPrice
  if (typeof product.ourPrice === "number" && Number.isFinite(product.ourPrice) && product.ourPrice > 0) {
    if (lprice < product.ourPrice * 0.7) score -= 40;
    else if (lprice < product.ourPrice * 0.85) score -= 10;
  }

  return score;
}

async function fetchItemsFromOpenApi(keyword: string): Promise<NaverShopItem[]> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 환경변수가 필요합니다.");

  const url = `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(
    keyword
  )}&display=100&sort=sim`;

  const response = await fetch(url, {
    headers: {
      "X-Naver-Client-Id": clientId,
      "X-Naver-Client-Secret": clientSecret
    }
  });

  const bodyText = await response.text();
  if (!response.ok) throw new Error(`OPENAPI_HTTP_${response.status}: ${bodyText}`);

  const data = JSON.parse(bodyText) as NaverShopResponse;
  return Array.isArray(data?.items) ? data.items : [];
}

export async function fetchNaverLowestPrice(
  product: Product,
  opts?: { includeCandidates?: boolean }
): Promise<NaverPriceResult> {
  const fetchedAt = new Date().toISOString();

  const ourPrice = typeof product.ourPrice === "number" && Number.isFinite(product.ourPrice) ? product.ourPrice : 0;
  const keyword = (product.name ?? "").trim();
  if (!keyword) {
    return {
      productId: product.id,
      site: "naver",
      ourPrice,
      marketPrice: null,
      lowestPrice: null,
      filteredLowestPrice: null,
      diff: null,
      status: "조회실패",
      totalCandidates: 0,
      filteredCount: 0,
      fetchedAt,
      error: "NO_RESULT",
      message: "상품명이 비어 있어 네이버 검색을 할 수 없습니다."
    };
  }

  let items: NaverShopItem[] = [];
  try {
    items = await fetchItemsFromOpenApi(keyword);
  } catch (e) {
    return {
      productId: product.id,
      site: "naver",
      ourPrice,
      marketPrice: null,
      lowestPrice: null,
      filteredLowestPrice: null,
      diff: null,
      status: "조회실패",
      totalCandidates: 0,
      filteredCount: 0,
      fetchedAt,
      error: "API_ERROR",
      message: e instanceof Error ? e.message : "네이버 가격 조회 실패"
    };
  }

  const totalCandidates = items.length;
  if (totalCandidates === 0) {
    const result: NaverPriceResult = {
      productId: product.id,
      site: "naver",
      ourPrice,
      marketPrice: null,
      lowestPrice: null,
      filteredLowestPrice: null,
      diff: null,
      status: "조회실패",
      totalCandidates,
      filteredCount: 0,
      fetchedAt,
      error: "NO_RESULT",
      message: "네이버 검색 결과가 없습니다."
    };
    if (opts?.includeCandidates) result._allCandidates = [];
    return result;
  }

  const candidates: NaverCandidate[] = [];
  let filteredCount = 0;

  // 후보 필터 (요구사항 기준: token -> volume -> hard keyword)
  for (const it of items) {
    const mallName = String(it.mallName ?? "");
    const title = stripTags(String(it.title ?? ""));
    const link = String(it.link ?? "");
    const lprice = toNumber(it.lprice) ?? 0;

    const shippingCost = getShippingCost(it);
    const effectivePrice = lprice + shippingCost;

    const hard = hardFilterReason(product, it);
    if (hard) {
      filteredCount += 1;
      candidates.push({
        mallName,
        title,
        price: lprice,
        shippingFee: shippingCost,
        effectivePrice,
        trustScore: 0,
        link,
        excludedReason: hard.reason ?? "HARD_FILTER_EXCLUDE_KEYWORD",
        matchedExcludeKeyword: hard.matchedExcludeKeyword,
        excludedMessage: hard.message,
        missingTokens: hard.missingTokens,
        isPassed: false
      });
      continue;
    }

    const trustScore = calcTrustScore(product, it, lprice);
    candidates.push({
      mallName,
      title,
      price: lprice,
      shippingFee: shippingCost,
      effectivePrice,
      trustScore,
      link,
      excludedReason: "PASSED",
      excludedMessage: "통과",
      isPassed: true
    });
  }

  const passed = candidates.filter((c) => c.excludedReason === "PASSED");

  // 서버 콘솔 요약 로그
  try {
    const top = [...candidates]
      .sort((a, b) => a.effectivePrice - b.effectivePrice)
      .slice(0, 5);
    // eslint-disable-next-line no-console
    console.log("[naver filter summary]");
    // eslint-disable-next-line no-console
    console.log("total:", totalCandidates);
    // eslint-disable-next-line no-console
    console.log("passed:", passed.length);
    // eslint-disable-next-line no-console
    console.log("excluded:", totalCandidates - passed.length);
    // eslint-disable-next-line no-console
    console.log("top candidates:");
    top.forEach((c, i) => {
      // eslint-disable-next-line no-console
      console.log(
        `${i + 1}. ${c.mallName} / ${c.title} / ${c.price} / ${c.trustScore} / ${c.excludedReason} / ${
          c.excludedMessage ?? ""
        }`
      );
    });
  } catch {
    // ignore logging errors
  }

  if (passed.length === 0) {
    const result: NaverPriceResult = {
      productId: product.id,
      site: "naver",
      ourPrice,
      marketPrice: null,
      lowestPrice: null,
      filteredLowestPrice: null,
      diff: null,
      status: "조회실패",
      totalCandidates,
      filteredCount,
      fetchedAt,
      error: "NO_MATCHED_PRODUCT",
      message: "상품명과 용량이 일치하는 네이버 후보가 없습니다."
    };
    if (opts?.includeCandidates) result._allCandidates = candidates;
    return result;
  }

  // 6. 조회 결과 선택: PASSED 후보 중 배송비 포함가 최저
  const selectedCandidate = [...passed].sort((a, b) => a.effectivePrice - b.effectivePrice)[0]!;

  const selectedEffective = selectedCandidate.effectivePrice;
  const diff = ourPrice > 0 ? ourPrice - selectedEffective : null;
  const status: "정상" | "조정필요" | "긴급조정" =
    ourPrice <= selectedEffective ? "정상" : ourPrice > selectedEffective * 1.1 ? "긴급조정" : "조정필요";

  const result: NaverPriceResult = {
    productId: product.id,
    site: "naver",
    marketPrice: null,
    lowestPrice: selectedCandidate.price,
    filteredLowestPrice: selectedCandidate.effectivePrice,
    ourPrice,
    diff,
    status,
    selected: {
      mallName: selectedCandidate.mallName,
      title: selectedCandidate.title,
      link: selectedCandidate.link,
      effectivePrice: selectedCandidate.effectivePrice,
      shippingFee: selectedCandidate.shippingFee,
      price: selectedCandidate.price,
      trustScore: selectedCandidate.trustScore
    },
    totalCandidates,
    filteredCount,
    fetchedAt
  };
  if (opts?.includeCandidates) result._allCandidates = candidates;
  return result;
}

