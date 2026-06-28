// Google マップのリンクから店名・住所・座標を取り出すユーティリティ

export interface ParsedMaps {
  shopName: string;
  address: string;
  lat: number | null;
  lng: number | null;
}

/**
 * Google マップの URL から情報を抽出する。
 *
 * 対応しているのは「共有」や「リンクをコピー」で得られるフルURL形式:
 *   https://www.google.com/maps/place/店名/@35.68,139.76,17z/...
 *   https://maps.google.com/maps?q=店名
 *
 * 短縮URL（maps.app.goo.gl / goo.gl/maps）はリダイレクト先を
 * ブラウザから解決できない（CORS）ため、店名抽出はできない。
 * その場合は空文字を返すので、ユーザーが手入力で補える。
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
  let address = "";

  // パターン1: /maps/place/<名前>/ の形式
  const placeMatch = parsed.pathname.match(/\/place\/([^/@]+)/);
  if (placeMatch) {
    shopName = decodeMapsSegment(placeMatch[1]);
  }

  // パターン2: ?q=<名前> もしくは ?query=<名前>
  if (!shopName) {
    const q = parsed.searchParams.get("q") || parsed.searchParams.get("query");
    if (q && !/^-?\d+\.\d+,/.test(q)) {
      shopName = decodeMapsSegment(q);
    }
  }

  // 座標: パスの @lat,lng,zoom もしくは ?ll=lat,lng / !3dlat!4dlng
  let lat: number | null = null;
  let lng: number | null = null;

  const atMatch = parsed.pathname.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (atMatch) {
    lat = parseFloat(atMatch[1]);
    lng = parseFloat(atMatch[2]);
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
  if (lat === null) {
    const dm = parsed.pathname.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    if (dm) {
      lat = parseFloat(dm[1]);
      lng = parseFloat(dm[2]);
    }
  }

  // 店名が「+」区切りの場合は住所っぽい部分を切り出す手がかりにはしない。
  // place セグメントは店名そのものなので address は空のままにしておく。
  void address;

  return {
    shopName,
    address,
    lat: Number.isFinite(lat as number) ? lat : null,
    lng: Number.isFinite(lng as number) ? lng : null,
  };
}

/** URL のセグメントを人間が読める文字列に戻す */
function decodeMapsSegment(seg: string): string {
  try {
    return decodeURIComponent(seg.replace(/\+/g, " ")).trim();
  } catch {
    return seg.replace(/\+/g, " ").trim();
  }
}
