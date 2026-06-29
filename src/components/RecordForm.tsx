// そばの記録を新規作成・編集するフォーム

import { useMemo, useState } from "react";
import type { SobaDraft, SobaRecord, Temperature } from "../types";
import { parseMapsUrl } from "../utils/maps";
import { fileToResizedDataUrl } from "../utils/image";
import { findStore, normalizeName } from "../utils/stores";
import { todayStr } from "../lib/date";
import { StarRating } from "./StarRating";
import { TagInput } from "./TagInput";

interface RecordFormProps {
  /** 編集時の初期値、または新規時の一部プリフィル */
  initial?: Partial<SobaDraft>;
  /** 編集モードか（見出しの切り替え用） */
  isEdit?: boolean;
  /** 過去の記録（店名から過去訪問を引くため） */
  allRecords?: SobaRecord[];
  /** 過去訪問の照合から除外する記録ID（編集中の自分自身） */
  excludeId?: string;
  onSubmit: (draft: SobaDraft) => void;
  onCancel: () => void;
}

function today(): string {
  return todayStr();
}

/** 重複を除いた値の配列（大文字小文字を無視） */
function uniqueValues(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of items) {
    const k = v.toLowerCase();
    if (v && !seen.has(k)) {
      seen.add(k);
      out.push(v);
    }
  }
  return out;
}

function emptyDraft(): SobaDraft {
  return {
    shopName: "",
    menuItems: [],
    toppings: [],
    mapsUrl: "",
    address: "",
    lat: null,
    lng: null,
    temperature: "cold",
    koshi: 3,
    price: null,
    rating: 3,
    memo: "",
    photo: "",
    date: today(),
  };
}

export function RecordForm({
  initial,
  isEdit = false,
  allRecords = [],
  excludeId,
  onSubmit,
  onCancel,
}: RecordFormProps) {
  const [draft, setDraft] = useState<SobaDraft>({ ...emptyDraft(), ...initial });
  const [mapsHint, setMapsHint] = useState<string>("");

  const set = <K extends keyof SobaDraft>(key: K, value: SobaDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  // 自分自身を除いた過去の記録
  const pastRecords = useMemo(
    () => allRecords.filter((r) => r.id !== excludeId),
    [allRecords, excludeId],
  );

  // 既存の店名候補（入力補完用）
  const storeNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const r of pastRecords) {
      const key = normalizeName(r.shopName);
      if (key && !names.has(key)) names.set(key, r.shopName);
    }
    return [...names.values()];
  }, [pastRecords]);

  // 入力中の店名に一致する過去のお店
  const matchedStore = useMemo(
    () => findStore(pastRecords, draft.shopName),
    [pastRecords, draft.shopName],
  );

  // 過去に入力したメニュー・トッピングの候補（入力補完用）
  const menuSuggestions = useMemo(
    () => uniqueValues(pastRecords.flatMap((r) => r.menuItems)),
    [pastRecords],
  );
  const toppingSuggestions = useMemo(
    () => uniqueValues(pastRecords.flatMap((r) => r.toppings)),
    [pastRecords],
  );

  // 店名入力後：過去のマップリンクを引き継ぐ
  const handleShopBlur = () => {
    const store = findStore(pastRecords, draft.shopName);
    if (!store) return;
    setDraft((d) => ({
      ...d,
      mapsUrl: d.mapsUrl || store.mapsUrl,
      lat: d.lat ?? store.lat,
      lng: d.lng ?? store.lng,
    }));
  };

  const handleMapsBlur = () => {
    if (!draft.mapsUrl) {
      setMapsHint("");
      return;
    }
    const parsed = parseMapsUrl(draft.mapsUrl);
    if (parsed.shopName || parsed.lat !== null) {
      setDraft((d) => ({
        ...d,
        // すでに店名が入っている場合は上書きしない
        shopName: d.shopName || parsed.shopName,
        address: parsed.address || d.address,
        lat: parsed.lat ?? d.lat,
        lng: parsed.lng ?? d.lng,
      }));
      setMapsHint(
        parsed.shopName
          ? `「${parsed.shopName}」を読み取りました`
          : "位置情報を読み取りました",
      );
    } else {
      setMapsHint(
        "このリンクからは店名を自動取得できませんでした（短縮URLなど）。店名を手入力してください。",
      );
    }
  };

  const handlePhoto = async (file: File | undefined) => {
    if (!file) return;
    try {
      const dataUrl = await fileToResizedDataUrl(file);
      set("photo", dataUrl);
    } catch (e) {
      console.error(e);
      alert("写真の読み込みに失敗しました");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.shopName.trim()) {
      alert("店名を入力してください");
      return;
    }
    onSubmit({ ...draft, shopName: draft.shopName.trim() });
  };

  return (
    <form className="form" onSubmit={handleSubmit}>
      <h2 className="form__title">{isEdit ? "記録を編集" : "そばを記録"}</h2>

      {/* Google マップリンク */}
      <label className="field">
        <span className="field__label">📍 Google マップのリンク</span>
        <input
          type="url"
          className="field__input"
          placeholder="https://maps.google.com/..."
          value={draft.mapsUrl}
          onChange={(e) => set("mapsUrl", e.target.value)}
          onBlur={handleMapsBlur}
          inputMode="url"
        />
        {mapsHint && <span className="field__hint">{mapsHint}</span>}
      </label>

      {/* 店名 */}
      <label className="field">
        <span className="field__label">店名 *</span>
        <input
          type="text"
          className="field__input"
          placeholder="例: 神田まつや"
          value={draft.shopName}
          onChange={(e) => set("shopName", e.target.value)}
          onBlur={handleShopBlur}
          list="store-names"
          required
        />
        {storeNames.length > 0 && (
          <datalist id="store-names">
            {storeNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        )}
      </label>

      {/* 過去の訪問ヒント（同じ店に2回目以降） */}
      {matchedStore && (
        <div className="past-visits">
          <div className="past-visits__head">
            🏪 この店は過去 {matchedStore.count} 回 ・ 平均 ★
            {matchedStore.avgRating.toFixed(1)}
            {matchedStore.mapsUrl && draft.mapsUrl === matchedStore.mapsUrl && (
              <span className="past-visits__autofill">
                （前回のマップリンクを引き継ぎました）
              </span>
            )}
          </div>
          <ul className="past-visits__list">
            {matchedStore.visits.slice(0, 3).map((v) => (
              <li key={v.id}>
                <span className="past-visits__date">{v.date}</span>
                <span>{v.temperature === "hot" ? "🔥" : "❄️"}</span>
                <span className="past-visits__menu">
                  {v.menuItems.length ? v.menuItems.join("・") : "（メニュー未記入）"}
                </span>
                <span className="past-visits__rating">{"★".repeat(v.rating)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* メニュー（複数可） */}
      <div className="field">
        <span className="field__label">メニュー（複数OK）</span>
        <TagInput
          values={draft.menuItems}
          onChange={(v) => set("menuItems", v)}
          placeholder="例: ざるそば（入力して＋）"
          suggestions={menuSuggestions}
          listId="menu-suggestions"
        />
      </div>

      {/* トッピング（複数可） */}
      <div className="field">
        <span className="field__label">トッピング（複数OK）</span>
        <TagInput
          values={draft.toppings}
          onChange={(v) => set("toppings", v)}
          placeholder="例: 海苔、温泉卵（入力して＋）"
          suggestions={toppingSuggestions}
          listId="topping-suggestions"
        />
      </div>

      {/* 温かい / 冷たい */}
      <div className="field">
        <span className="field__label">温度</span>
        <div className="segmented">
          {(["hot", "cold"] as Temperature[]).map((t) => (
            <button
              key={t}
              type="button"
              className={`segmented__btn${
                draft.temperature === t ? " segmented__btn--active" : ""
              } segmented__btn--${t}`}
              onClick={() => set("temperature", t)}
            >
              {t === "hot" ? "🔥 温かい" : "❄️ 冷たい"}
            </button>
          ))}
        </div>
      </div>

      {/* こし */}
      <div className="field">
        <span className="field__label">こしの強さ</span>
        <StarRating
          value={draft.koshi}
          onChange={(v) => set("koshi", v)}
          symbol="●"
        />
      </div>

      {/* 値段 */}
      <label className="field">
        <span className="field__label">値段（円）</span>
        <input
          type="number"
          className="field__input"
          placeholder="例: 850"
          min={0}
          value={draft.price ?? ""}
          onChange={(e) =>
            set("price", e.target.value === "" ? null : Number(e.target.value))
          }
          inputMode="numeric"
        />
      </label>

      {/* 総合評価 */}
      <div className="field">
        <span className="field__label">総合評価</span>
        <StarRating
          value={draft.rating}
          onChange={(v) => set("rating", v)}
          symbol="★"
        />
      </div>

      {/* 写真 */}
      <div className="field">
        <span className="field__label">写真</span>
        {draft.photo && (
          <div className="photo-preview">
            <img src={draft.photo} alt="そばの写真" />
            <button
              type="button"
              className="photo-preview__remove"
              onClick={() => set("photo", "")}
            >
              削除
            </button>
          </div>
        )}
        <input
          type="file"
          accept="image/*"
          className="field__file"
          onChange={(e) => handlePhoto(e.target.files?.[0])}
        />
      </div>

      {/* 日付 */}
      <label className="field">
        <span className="field__label">食べた日</span>
        <input
          type="date"
          className="field__input"
          value={draft.date}
          onChange={(e) => set("date", e.target.value)}
        />
      </label>

      {/* メモ */}
      <label className="field">
        <span className="field__label">メモ・感想</span>
        <textarea
          className="field__input field__textarea"
          placeholder="つゆの味、香り、雰囲気など"
          rows={3}
          value={draft.memo}
          onChange={(e) => set("memo", e.target.value)}
        />
      </label>

      <div className="form__actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          キャンセル
        </button>
        <button type="submit" className="btn btn--primary">
          保存する
        </button>
      </div>
    </form>
  );
}
