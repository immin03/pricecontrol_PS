import axios from "axios";
import * as cheerio from "cheerio";
import { parseKrwPrice } from "../lib/priceParse.js";
import type { CompetitorTarget } from "../types.js";

export async function fetchPrice(target: CompetitorTarget): Promise<number | null> {
  const html = await axios
    .get<string>(target.url, {
      timeout: 15000,
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
      }
    })
    .then((r) => r.data);

  const $ = cheerio.load(html);

  if (target.selector) {
    const t = $(target.selector).first().text();
    return parseKrwPrice(t);
  }

  // 아주 범용적인 fallback: meta 태그/페이지 텍스트에서 가격처럼 보이는 숫자를 찾음
  const meta =
    $("meta[property='product:price:amount']").attr("content") ??
    $("meta[name='twitter:data1']").attr("content") ??
    $("meta[itemprop='price']").attr("content") ??
    "";
  const metaPrice = parseKrwPrice(meta);
  if (metaPrice != null) return metaPrice;

  const bodyText = $("body").text();
  const m = bodyText.replace(/\s+/g, " ").match(/([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{4,})\s*원/);
  return m ? parseKrwPrice(m[0]) : null;
}

