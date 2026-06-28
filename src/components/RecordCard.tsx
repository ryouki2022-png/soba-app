// 一覧に表示する1件分のカード

import type { SobaRecord } from "../types";

interface RecordCardProps {
  record: SobaRecord;
  onClick: () => void;
}

export function RecordCard({ record, onClick }: RecordCardProps) {
  return (
    <button type="button" className="card" onClick={onClick}>
      <div className="card__thumb">
        {record.photo ? (
          <img src={record.photo} alt={record.shopName} />
        ) : (
          <span className="card__thumb-placeholder">🍜</span>
        )}
        <span
          className={`card__temp card__temp--${record.temperature}`}
          title={record.temperature === "hot" ? "温かい" : "冷たい"}
        >
          {record.temperature === "hot" ? "🔥" : "❄️"}
        </span>
      </div>
      <div className="card__body">
        <div className="card__top">
          <h3 className="card__shop">{record.shopName}</h3>
          <span className="card__rating">{"★".repeat(record.rating)}</span>
        </div>
        {(record.menuItems.length > 0 || record.toppings.length > 0) && (
          <p className="card__menu">
            {record.menuItems.join("・")}
            {record.toppings.length > 0 && (
              <span className="card__toppings">
                {record.menuItems.length > 0 ? " + " : ""}
                {record.toppings.join("・")}
              </span>
            )}
          </p>
        )}
        <div className="card__meta">
          {record.price != null && (
            <span className="card__price">¥{record.price.toLocaleString()}</span>
          )}
          <span className="card__date">{record.date}</span>
        </div>
      </div>
    </button>
  );
}
