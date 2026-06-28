// お店の詳細：集計＋その店で食べた全記録

import type { StoreSummary } from "../utils/stores";
import { RecordCard } from "./RecordCard";

interface StoreDetailProps {
  store: StoreSummary;
  onBack: () => void;
  onSelectRecord: (id: string) => void;
  onAddVisit: () => void;
}

function priceText(s: StoreSummary): string {
  if (s.minPrice == null) return "-";
  if (s.maxPrice == null || s.minPrice === s.maxPrice) {
    return `¥${s.minPrice.toLocaleString()}`;
  }
  return `¥${s.minPrice.toLocaleString()}〜${s.maxPrice.toLocaleString()}`;
}

export function StoreDetail({
  store,
  onBack,
  onSelectRecord,
  onAddVisit,
}: StoreDetailProps) {
  return (
    <div className="detail">
      <button type="button" className="detail__back" onClick={onBack}>
        ← お店一覧へ
      </button>

      <h2 className="detail__shop">🏪 {store.name}</h2>
      <p className="detail__menu">
        訪問 {store.count} 回 ・ 最終 {store.lastVisit}
      </p>

      {/* 集計 */}
      <div className="stats" style={{ marginTop: 16 }}>
        <div className="stat">
          <span className="stat__value">{store.avgRating.toFixed(1)}</span>
          <span className="stat__label">平均評価</span>
        </div>
        <div className="stat">
          <span className="stat__value">{store.avgKoshi.toFixed(1)}</span>
          <span className="stat__label">平均こし</span>
        </div>
        <div className="stat">
          <span className="stat__value">{priceText(store)}</span>
          <span className="stat__label">値段帯</span>
        </div>
      </div>

      <div className="store-detail__tempbar">
        {store.hotCount > 0 && <span>🔥 温かい {store.hotCount}回</span>}
        {store.coldCount > 0 && <span>❄️ 冷たい {store.coldCount}回</span>}
      </div>

      {store.mapsUrl && (
        <a
          className="btn btn--map"
          href={store.mapsUrl}
          target="_blank"
          rel="noreferrer"
        >
          📍 Google マップで開く
        </a>
      )}

      <button type="button" className="btn btn--primary store-detail__add" onClick={onAddVisit}>
        ＋ この店でまた記録する
      </button>

      <h3 className="store-detail__history">これまでの記録</h3>
      <div className="list">
        {store.visits.map((r) => (
          <RecordCard
            key={r.id}
            record={r}
            onClick={() => onSelectRecord(r.id)}
          />
        ))}
      </div>
    </div>
  );
}
