// お店ごとにまとめたカード一覧

import type { StoreSummary } from "../utils/stores";

interface StoreListProps {
  stores: StoreSummary[];
  onSelect: (key: string) => void;
}

function priceLabel(s: StoreSummary): string {
  if (s.minPrice == null) return "";
  if (s.maxPrice == null || s.minPrice === s.maxPrice) {
    return `¥${s.minPrice.toLocaleString()}`;
  }
  return `¥${s.minPrice.toLocaleString()}〜${s.maxPrice.toLocaleString()}`;
}

export function StoreList({ stores, onSelect }: StoreListProps) {
  return (
    <div className="list">
      {stores.map((s) => (
        <button
          key={s.key}
          type="button"
          className="store-card"
          onClick={() => onSelect(s.key)}
        >
          <div className="store-card__top">
            <h3 className="store-card__name">🏪 {s.name}</h3>
            <span className="store-card__count">{s.count}回</span>
          </div>
          <div className="store-card__meta">
            <span className="store-card__rating">
              {"★".repeat(Math.round(s.avgRating))}
              <span className="store-card__avg"> {s.avgRating.toFixed(1)}</span>
            </span>
            {priceLabel(s) && (
              <span className="store-card__price">{priceLabel(s)}</span>
            )}
            <span className="store-card__temp">
              {s.hotCount > 0 && `🔥${s.hotCount}`}
              {s.coldCount > 0 && ` ❄️${s.coldCount}`}
            </span>
          </div>
          <div className="store-card__last">最終訪問: {s.lastVisit}</div>
        </button>
      ))}
    </div>
  );
}
