// 記録したお店を地図＋一覧で表示する（Leaflet + OpenStreetMap、APIキー不要）
//
// ピンは「お店単位」（同じ店の記録が重ならない）。
// 地図の下に登録済みのお店一覧を表示し、タップで地図が移動する。
// 位置情報のないお店も一覧に出して、登録漏れに気づけるようにする。

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import type { StoreSummary } from "../utils/stores";

// バンドラ環境でデフォルトアイコンが表示されるようにURLを設定。
// Leaflet 内部の URL 自動解決（_getIconUrl）が誤ったパスを返すため
// 先に無効化しないとピンの画像が壊れる。
delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

interface MapViewProps {
  stores: StoreSummary[];
  onSelectStore: (key: string) => void;
}

export function MapView({ stores, onSelectStore }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());

  const located = stores.filter((s) => s.lat !== null && s.lng !== null);
  const unlocated = stores.filter((s) => s.lat === null || s.lng === null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [35.681, 139.767], // 東京駅あたりを初期表示
      zoom: 11,
      scrollWheelZoom: true,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // お店が変わったらマーカーを貼り直す
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const layer = L.layerGroup().addTo(map);
    const bounds: [number, number][] = [];
    const markers = markersRef.current;
    markers.clear();

    for (const s of located) {
      const marker = L.marker([s.lat as number, s.lng as number]);
      const latestMenus = s.visits[0]?.menuItems.join("・") ?? "";
      marker.bindPopup(
        `<strong>${escapeHtml(s.name)}</strong><br/>` +
          `${"★".repeat(Math.round(s.avgRating))} ${s.avgRating.toFixed(1)} ・ ${s.count}回` +
          `${latestMenus ? `<br/>${escapeHtml(latestMenus)}` : ""}` +
          `<br/><a href="#" data-key="${escapeHtml(s.key)}" class="map-popup-link">お店ページを見る</a>`,
      );
      marker.on("popupopen", (e) => {
        const el = (e.popup.getElement() as HTMLElement)?.querySelector(
          ".map-popup-link",
        );
        el?.addEventListener("click", (ev) => {
          ev.preventDefault();
          onSelectStore(s.key);
        });
      });
      marker.addTo(layer);
      markers.set(s.key, marker);
      bounds.push([s.lat as number, s.lng as number]);
    }

    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    }
    // 表示直後にサイズが確定していない場合の対策
    setTimeout(() => map.invalidateSize(), 100);

    return () => {
      layer.remove();
      markers.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stores]);

  // 一覧タップ → 地図をその店へ移動してポップアップを開く
  const focusStore = (key: string) => {
    const map = mapRef.current;
    const marker = markersRef.current.get(key);
    if (!map || !marker) return;
    map.setView(marker.getLatLng(), Math.max(map.getZoom(), 15), {
      animate: true,
    });
    marker.openPopup();
    containerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="mapview">
      <div ref={containerRef} className="mapview__canvas" />
      {located.length === 0 && (
        <p className="mapview__hint">
          位置情報つきのお店がまだありません。記録するときに「🔎 店名で場所を検索」
          や「📍 現在地を使う」、Google マップのリンク貼り付けで位置を登録すると、
          ここにピンが表示されます。
        </p>
      )}
      {located.length > 0 && (
        <p className="mapview__count">📍 {located.length} 店舗を表示中</p>
      )}

      {/* 登録済みのお店一覧 */}
      {stores.length > 0 && (
        <div className="map-list">
          <h3 className="map-list__title">登録したお店（{stores.length}）</h3>
          {located.map((s) => (
            <div key={s.key} className="map-list__row">
              <button
                type="button"
                className="map-list__main"
                onClick={() => focusStore(s.key)}
              >
                <span className="map-list__name">📍 {s.name}</span>
                <span className="map-list__meta">
                  ★{s.avgRating.toFixed(1)} ・ {s.count}回 ・ 最終 {s.lastVisit}
                </span>
              </button>
              <button
                type="button"
                className="map-list__detail"
                onClick={() => onSelectStore(s.key)}
                aria-label={`${s.name}のお店ページ`}
              >
                詳細
              </button>
            </div>
          ))}
          {unlocated.map((s) => (
            <div key={s.key} className="map-list__row map-list__row--noloc">
              <button
                type="button"
                className="map-list__main"
                onClick={() => onSelectStore(s.key)}
              >
                <span className="map-list__name">🏪 {s.name}</span>
                <span className="map-list__meta">
                  <span className="map-list__badge">位置情報なし</span>
                  {s.count}回 ・ 最終 {s.lastVisit}
                </span>
              </button>
              <button
                type="button"
                className="map-list__detail"
                onClick={() => onSelectStore(s.key)}
                aria-label={`${s.name}のお店ページ`}
              >
                詳細
              </button>
            </div>
          ))}
          {unlocated.length > 0 && (
            <p className="map-list__hint">
              「位置情報なし」のお店は、記録を編集して場所を設定すると地図に表示されます。
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
