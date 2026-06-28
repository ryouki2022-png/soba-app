// そばの記録を新規作成・編集するフォーム

import { useState } from "react";
import type { SobaDraft, Temperature } from "../types";
import { parseMapsUrl } from "../utils/maps";
import { fileToResizedDataUrl } from "../utils/image";
import { StarRating } from "./StarRating";

interface RecordFormProps {
  initial?: SobaDraft;
  onSubmit: (draft: SobaDraft) => void;
  onCancel: () => void;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyDraft(): SobaDraft {
  return {
    shopName: "",
    menuName: "",
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

export function RecordForm({ initial, onSubmit, onCancel }: RecordFormProps) {
  const [draft, setDraft] = useState<SobaDraft>(initial ?? emptyDraft());
  const [mapsHint, setMapsHint] = useState<string>("");

  const set = <K extends keyof SobaDraft>(key: K, value: SobaDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

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
      <h2 className="form__title">{initial ? "記録を編集" : "そばを記録"}</h2>

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
          required
        />
      </label>

      {/* メニュー名 */}
      <label className="field">
        <span className="field__label">メニュー</span>
        <input
          type="text"
          className="field__input"
          placeholder="例: ざるそば、鴨南蛮"
          value={draft.menuName}
          onChange={(e) => set("menuName", e.target.value)}
        />
      </label>

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
