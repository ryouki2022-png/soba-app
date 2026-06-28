// 複数の項目（メニューやトッピング）をタグとして追加・削除できる入力

import { useState } from "react";

interface TagInputProps {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  /** 入力補完の候補（過去に入力した値など） */
  suggestions?: string[];
  listId?: string;
}

export function TagInput({
  values,
  onChange,
  placeholder,
  suggestions = [],
  listId,
}: TagInputProps) {
  const [text, setText] = useState("");

  const add = (raw: string) => {
    const v = raw.trim();
    if (!v) return;
    // 重複（大文字小文字を無視）は追加しない
    if (values.some((x) => x.toLowerCase() === v.toLowerCase())) {
      setText("");
      return;
    }
    onChange([...values, v]);
    setText("");
  };

  const remove = (i: number) => {
    onChange(values.filter((_, idx) => idx !== i));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(text);
    } else if (e.key === "Backspace" && text === "" && values.length > 0) {
      remove(values.length - 1);
    }
  };

  return (
    <div className="taginput">
      {values.length > 0 && (
        <div className="taginput__tags">
          {values.map((v, i) => (
            <span key={`${v}-${i}`} className="tag">
              {v}
              <button
                type="button"
                className="tag__remove"
                aria-label={`${v}を削除`}
                onClick={() => remove(i)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="taginput__row">
        <input
          type="text"
          className="field__input"
          placeholder={placeholder}
          value={text}
          list={listId}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => add(text)}
        />
        <button
          type="button"
          className="taginput__add"
          onClick={() => add(text)}
          aria-label="追加"
        >
          ＋
        </button>
      </div>
      {listId && suggestions.length > 0 && (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </div>
  );
}
