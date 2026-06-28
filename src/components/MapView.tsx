// 記録を地図上に表示する（Leaflet + OpenStreetMap、APIキー不要）

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import type { SobaRecord } from "../types";

// バンドラ環境でデフォルトアイコンが表示されるようにURLを設定
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

interface MapViewProps {
  records: SobaRecord[];
  onSelect: (id: string) => void;
}

export function MapView({ records, onSelect }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  const located = records.filter((r) => r.lat !== null && r.lng !== null);

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

  // 記録が変わったらマーカーを貼り直す
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const layer = L.layerGroup().addTo(map);
    const bounds: [number, number][] = [];

    for (const r of located) {
      const marker = L.marker([r.lat as number, r.lng as number]);
      const menus = r.menuItems.join("・");
      marker.bindPopup(
        `<strong>${escapeHtml(r.shopName)}</strong><br/>` +
          `${"★".repeat(r.rating)}${menus ? `<br/>${escapeHtml(menus)}` : ""}` +
          `<br/><a href="#" data-id="${r.id}" class="map-popup-link">詳細を見る</a>`,
      );
      marker.on("popupopen", (e) => {
        const el = (e.popup.getElement() as HTMLElement)?.querySelector(
          ".map-popup-link",
        );
        el?.addEventListener("click", (ev) => {
          ev.preventDefault();
          onSelect(r.id);
        });
      });
      marker.addTo(layer);
      bounds.push([r.lat as number, r.lng as number]);
    }

    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    }
    // 表示直後にサイズが確定していない場合の対策
    setTimeout(() => map.invalidateSize(), 100);

    return () => {
      layer.remove();
    };
  }, [records]);

  return (
    <div className="mapview">
      <div ref={containerRef} className="mapview__canvas" />
      {located.length === 0 && (
        <p className="mapview__hint">
          位置情報つきの記録がまだありません。記録に Google マップのリンクを
          貼ると、地図上にピンが表示されます。
        </p>
      )}
      {located.length > 0 && (
        <p className="mapview__count">📍 {located.length} 件を表示中</p>
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
