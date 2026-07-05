// 1件の記録の詳細表示

import type { SobaRecord } from "../types";
import { buildMapsLink } from "../utils/maps";
import { StarRating } from "./StarRating";

interface RecordDetailProps {
  record: SobaRecord;
  onEdit: () => void;
  onDelete: () => void;
  onBack: () => void;
}

export function RecordDetail({
  record,
  onEdit,
  onDelete,
  onBack,
}: RecordDetailProps) {
  // URL未登録でも座標や店名からGoogleマップを開けるようにする
  const mapsLink = buildMapsLink(record);
  return (
    <div className="detail">
      <button type="button" className="detail__back" onClick={onBack}>
        ← 一覧へ
      </button>

      {record.photo && (
        <div className="detail__photo">
          <img src={record.photo} alt={record.shopName} />
        </div>
      )}

      <div className="detail__header">
        <h2 className="detail__shop">{record.shopName}</h2>
        <span className={`badge badge--${record.temperature}`}>
          {record.temperature === "hot" ? "🔥 温かい" : "❄️ 冷たい"}
        </span>
      </div>

      {record.menuItems.length > 0 && (
        <div className="detail__chips">
          {record.menuItems.map((m) => (
            <span key={m} className="chip-tag chip-tag--menu">
              {m}
            </span>
          ))}
        </div>
      )}
      {record.toppings.length > 0 && (
        <div className="detail__chips">
          <span className="detail__chips-label">トッピング:</span>
          {record.toppings.map((t) => (
            <span key={t} className="chip-tag">
              {t}
            </span>
          ))}
        </div>
      )}

      <dl className="detail__grid">
        <div className="detail__row">
          <dt>総合評価</dt>
          <dd>
            <StarRating value={record.rating} readOnly symbol="★" size={22} />
          </dd>
        </div>
        <div className="detail__row">
          <dt>こし</dt>
          <dd>
            <StarRating value={record.koshi} readOnly symbol="●" size={22} />
          </dd>
        </div>
        {record.price != null && (
          <div className="detail__row">
            <dt>値段</dt>
            <dd>¥{record.price.toLocaleString()}</dd>
          </div>
        )}
        <div className="detail__row">
          <dt>食べた日</dt>
          <dd>{record.date}</dd>
        </div>
      </dl>

      {record.memo && <p className="detail__memo">{record.memo}</p>}

      {mapsLink && (
        <a
          className="btn btn--map"
          href={mapsLink}
          target="_blank"
          rel="noreferrer"
        >
          📍 Google マップで開く
          {!record.mapsUrl && (
            <span className="btn--map__note">
              {record.lat != null ? "（登録した位置）" : "（店名で検索）"}
            </span>
          )}
        </a>
      )}

      <div className="detail__actions">
        <button type="button" className="btn btn--ghost" onClick={onEdit}>
          編集
        </button>
        <button
          type="button"
          className="btn btn--danger"
          onClick={() => {
            if (confirm("この記録を削除しますか？")) onDelete();
          }}
        >
          削除
        </button>
      </div>
    </div>
  );
}
