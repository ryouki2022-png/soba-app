// 星による評価入力・表示コンポーネント

interface StarRatingProps {
  value: number;
  onChange?: (value: number) => void;
  max?: number;
  /** 表示専用（クリック不可） */
  readOnly?: boolean;
  /** 星の文字（評価は★、こしは●など使い分け可能） */
  symbol?: string;
  size?: number;
}

export function StarRating({
  value,
  onChange,
  max = 5,
  readOnly = false,
  symbol = "★",
  size = 28,
}: StarRatingProps) {
  return (
    <div className="star-rating" style={{ fontSize: size }}>
      {Array.from({ length: max }, (_, i) => {
        const n = i + 1;
        const active = n <= value;
        return (
          <button
            key={n}
            type="button"
            className={`star${active ? " star--active" : ""}${
              readOnly ? " star--readonly" : ""
            }`}
            aria-label={`${n}点`}
            disabled={readOnly}
            onClick={() => {
              if (readOnly || !onChange) return;
              // 同じ星をもう一度押したら1つ下げる（誤タップの取り消し）
              onChange(value === n ? n - 1 : n);
            }}
          >
            {symbol}
          </button>
        );
      })}
    </div>
  );
}
