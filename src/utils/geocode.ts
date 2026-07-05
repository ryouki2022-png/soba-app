// 店名・住所から場所を検索するユーティリティ（OpenStreetMap Nominatim）
//
// Google マップの短縮URLからは情報を取れないため、
// 店名からの検索でも位置情報を登録できるようにする。
// Nominatim は API キー不要・ブラウザから直接呼べる（CORS 許可済み）。

export interface GeoPlace {
  /** 施設名など（取れない場合は表示名の先頭部分） */
  name: string;
  /** 住所を含む表示名 */
  displayName: string;
  lat: number;
  lng: number;
}

const ENDPOINT = "https://nominatim.openstreetmap.org/search";

/** 店名や住所で場所を検索する。見つからなければ空配列。 */
export async function searchPlace(query: string): Promise<GeoPlace[]> {
  const q = query.trim();
  if (!q) return [];

  const url =
    `${ENDPOINT}?format=jsonv2&limit=5&accept-language=ja` +
    `&q=${encodeURIComponent(q)}`;

  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`場所の検索に失敗しました（${res.status}）`);
  }

  const data: unknown = await res.json();
  if (!Array.isArray(data)) return [];

  const out: GeoPlace[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const lat = parseFloat(String(r.lat));
    const lng = parseFloat(String(r.lon));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const displayName = typeof r.display_name === "string" ? r.display_name : "";
    const name =
      typeof r.name === "string" && r.name
        ? r.name
        : displayName.split(",")[0]?.trim() || q;
    out.push({ name, displayName, lat, lng });
  }
  return out;
}

/** 端末の現在地（緯度経度）を取得する */
export function getCurrentPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("この端末では現在地を取得できません"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        const msg =
          err.code === err.PERMISSION_DENIED
            ? "位置情報の利用が許可されていません"
            : "現在地を取得できませんでした";
        reject(new Error(msg));
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });
}
