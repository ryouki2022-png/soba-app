// Google マップのリンクから店名・住所・座標を取り出すユーティリティ

export interface ParsedMaps {
  shopName: string;
  address: string;
  lat: number | null;
  lng: number | null;
}

/**
 * 短縮URL（maps.app.goo.gl / goo.gl/maps / g.co）かどうか。
 * 短縮URLはリダイレクト先をブラウザから解決できない（CORS）ため、
 * 店名・座標の抽出ができない。UI側で代替手段（店名検索）へ誘導する。
 */
export function isShortMapsUrl(url: string): boolean {
  try {
    const host = new URL(url.trim()).hostname;
    return (
      host === "maps.app.goo.gl" ||
      host === "goo.gl" ||
      host === "g.co" ||
      host.endsWith(".app.goo.gl")
    );
  } catch {
    return false;
  }
}

/**
 * Google マップの URL から情報を抽出する。
 *
 * 対応形式（PC・スマホの「共有 → リンクをコピー」やアドレスバーのURL）:
 *   https://www.google.com/maps/place/店名/@35.68,139.76,17z/...
 *   https://www.google.com/maps/search/店名/...
 *   https://www.google.com/maps/dir/出発地/目的地/...
 *   https://maps.google.com/maps?q=店名 （?q=35.6,139.7 は座標として解釈）
 *   https://www.google.com/maps?daddr=... / ?destination=...
 */
export function parseMapsUrl(url: string): ParsedMaps {
  const empty: ParsedMaps = { shopName: "", address: "", lat: null, lng: null };
  if (!url) return empty;

  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return empty;
  }

  let shopName = "";
  let lat: number | null = null;
  let lng: number | null = null;

  const coordText = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/;

  // 名前・座標になりうるクエリ文字列をまとめて調べる
  const queryCandidates = [
    parsed.searchParams.get("q"),
    parsed.searchParams.get("query"),
    parsed.searchParams.get("daddr"),
    parsed.searchParams.get("destination"),
  ].filter((v): v is string => !!v);

  // パターン1: /maps/place/<名前>/ または /maps/search/<名前>/
  const placeMatch = parsed.pathname.match(/\/(?:place|search)\/([^/@]+)/);
  if (placeMatch) {
    const seg = decodeMapsSegment(placeMatch[1]);
    const asCoord = seg.match(coordText);
    if (asCoord) {
      lat = parseFloat(asCoord[1]);
      lng = parseFloat(asCoord[2]);
    } else {
      shopName = seg;
    }
  }

  // パターン2: /maps/dir/出発地/目的地 → 最後のセグメントが目的地
  if (!shopName) {
    const dirMatch = parsed.pathname.match(/\/dir\/(.+?)(?:\/@|$)/);
    if (dirMatch) {
      const segs = dirMatch[1].split("/").filter(Boolean);
      const dest = segs[segs.length - 1];
      if (dest) {
        const seg = decodeMapsSegment(dest);
        if (!coordText.test(seg)) shopName = seg;
      }
    }
  }

  // パターン3: クエリ文字列（?q= など）。座標なら座標、それ以外は名前
  for (const q of queryCandidates) {
    const asCoord = q.match(coordText);
    if (asCoord) {
      if (lat === null) {
        lat = parseFloat(asCoord[1]);
        lng = parseFloat(asCoord[2]);
      }
    } else if (!shopName) {
      shopName = decodeMapsSegment(q);
    }
  }

  // 座標: パスの @lat,lng,zoom もしくは ?ll=lat,lng / !3dlat!4dlng
  // !3d!4d はピンの正確な位置なので @（画面中心）より優先する
  const dm = (parsed.pathname + parsed.search).match(
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,
  );
  if (dm) {
    lat = parseFloat(dm[1]);
    lng = parseFloat(dm[2]);
  }
  if (lat === null) {
    const atMatch = parsed.pathname.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (atMatch) {
      lat = parseFloat(atMatch[1]);
      lng = parseFloat(atMatch[2]);
    }
  }
  if (lat === null) {
    const ll = parsed.searchParams.get("ll");
    if (ll) {
      const [a, b] = ll.split(",");
      if (a && b) {
        lat = parseFloat(a);
        lng = parseFloat(b);
      }
    }
  }

  const latOk = Number.isFinite(lat as number);
  return {
    shopName,
    address: "",
    lat: latOk ? lat : null,
    lng: latOk ? lng : null,
  };
}

/**
 * 「Google マップで開く」ためのリンクを組み立てる。
 * 登録済みURL → 座標 → 店名検索 の順で使えるものを返す。
 * URLを登録していない記録でも地図を開けるようにするためのフォールバック。
 */
export function buildMapsLink(opts: {
  mapsUrl?: string;
  shopName?: string;
  lat?: number | null;
  lng?: number | null;
}): string {
  if (opts.mapsUrl) return opts.mapsUrl;
  if (opts.lat != null && opts.lng != null) {
    return `https://www.google.com/maps/search/?api=1&query=${opts.lat},${opts.lng}`;
  }
  if (opts.shopName) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      opts.shopName,
    )}`;
  }
  return "";
}

/** URL のセグメントを人間が読める文字列に戻す */
function decodeMapsSegment(seg: string): string {
  try {
    return decodeURIComponent(seg.replace(/\+/g, " ")).trim();
  } catch {
    return seg.replace(/\+/g, " ").trim();
  }
}
