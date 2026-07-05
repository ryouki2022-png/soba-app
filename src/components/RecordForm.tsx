// そばの記録を新規作成・編集するフォーム

import { useMemo, useState } from "react";
import type { SobaDraft, SobaRecord, Temperature } from "../types";
import { isShortMapsUrl, parseMapsUrl } from "../utils/maps";
import { getCurrentPosition, searchPlace, type GeoPlace } from "../utils/geocode";
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

  // 店名からの場所検索（Nominatim）
  const [geoResults, setGeoResults] = useState<GeoPlace[] | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoHint, setGeoHint] = useState("");

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

  // 店名入力後：過去のマップリンク・位置情報を引き継ぐ
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

  // マップURLの解析。貼り付けた瞬間に反映されるよう onChange から呼ぶ
  const applyMapsUrl = (url: string) => {
    set("mapsUrl", url);
    if (!url.trim()) {
      setMapsHint("");
      return;
    }
    if (isShortMapsUrl(url)) {
      setMapsHint(
        "短縮リンク（maps.app.goo.gl など）からは店名・位置を読み取れません。" +
          "リンクはこのまま保存できます。位置情報は店名を入れて「🔎 場所を検索」で設定できます。",
      );
      return;
    }
    const parsed = parseMapsUrl(url);
    if (parsed.shopName || parsed.lat !== null) {
      setDraft((d) => ({
        ...d,
        mapsUrl: url,
        // すでに店名が入っている場合は上書きしない
        shopName: d.shopName || parsed.shopName,
        address: parsed.address || d.address,
        lat: parsed.lat ?? d.lat,
        lng: parsed.lng ?? d.lng,
      }));
      setMapsHint(
        parsed.shopName && parsed.lat !== null
          ? `「${parsed.shopName}」と位置情報を読み取りました ✓`
          : parsed.shopName
            ? `「${parsed.shopName}」を読み取りました（位置情報なし）`
            : "位置情報を読み取りました ✓",
      );
    } else {
      setMapsHint(
        "このリンクからは情報を読み取れませんでした。店名を入れて「🔎 場所を検索」で位置を設定できます。",
      );
    }
  };

  // 店名で場所を検索（短縮URLしか無い場合の代替手段）
  const handleGeoSearch = async () => {
    const q = draft.shopName.trim();
    if (!q) {
      setGeoHint("先に店名を入力してください");
      return;
    }
    setGeoLoading(true);
    setGeoHint("");
    setGeoResults(null);
    try {
      const results = await searchPlace(q);
      if (results.length === 0) {
        setGeoHint(
          "見つかりませんでした。「店名 + 地名」（例: まつや 神田）で試すか、下の「現在地を使う」もどうぞ。",
        );
      } else {
        setGeoResults(results);
      }
    } catch (e) {
      console.error(e);
      setGeoHint("検索できませんでした。通信環境を確認してもう一度お試しください。");
    } finally {
      setGeoLoading(false);
    }
  };

  const pickGeoResult = (p: GeoPlace) => {
    setDraft((d) => ({
      ...d,
      lat: p.lat,
      lng: p.lng,
      address: d.address || p.displayName,
    }));
    setGeoResults(null);
    setGeoHint(`「${p.name}」の位置を設定しました ✓`);
  };

  // お店で記録するときにその場で位置を付けられるように
  const handleUseCurrentLocation = async () => {
    setGeoLoading(true);
    setGeoHint("");
    try {
      const pos = await getCurrentPosition();
      setDraft((d) => ({ ...d, lat: pos.lat, lng: pos.lng }));
      setGeoResults(null);
      setGeoHint("現在地を位置情報として設定しました ✓");
    } catch (e) {
      setGeoHint(e instanceof Error ? e.message : "現在地を取得できませんでした");
    } finally {
      setGeoLoading(false);
    }
  };

  const clearLocation = () => {
    setDraft((d) => ({ ...d, lat: null, lng: null }));
    setGeoHint("");
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

  const hasLocation = draft.lat != null && draft.lng != null;

  return (
    <form className="form" onSubmit={handleSubmit}>
      <h2 className="form__title">{isEdit ? "記録を編集" : "そばを記録"}</h2>

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

      {/* 場所・地図 */}
      <div className="field">
        <span className="field__label">📍 場所（マップに表示するための情報）</span>

        {/* 位置情報のステータス */}
        <div className={`loc-status${hasLocation ? " loc-status--ok" : ""}`}>
          {hasLocation ? (
            <>
              <span className="loc-status__text">✓ 位置情報あり（マップにピンが立ちます）</span>
              <button
                type="button"
                className="loc-status__clear"
                onClick={clearLocation}
              >
                削除
              </button>
            </>
          ) : (
            <span className="loc-status__text">
              位置情報なし — 下のどれかで設定できます
            </span>
          )}
        </div>

        <div className="loc-actions">
          <button
            type="button"
            className="btn btn--ghost loc-actions__btn"
            onClick={handleGeoSearch}
            disabled={geoLoading}
          >
            {geoLoading ? "検索中…" : "🔎 店名で場所を検索"}
          </button>
          <button
            type="button"
            className="btn btn--ghost loc-actions__btn"
            onClick={handleUseCurrentLocation}
            disabled={geoLoading}
          >
            📍 現在地を使う
          </button>
        </div>
        {geoHint && <span className="field__hint">{geoHint}</span>}

        {/* 検索結果の候補 */}
        {geoResults && geoResults.length > 0 && (
          <ul className="geo-results">
            {geoResults.map((p, i) => (
              <li key={`${p.lat}-${p.lng}-${i}`}>
                <button
                  type="button"
                  className="geo-results__item"
                  onClick={() => pickGeoResult(p)}
                >
                  <span className="geo-results__name">{p.name}</span>
                  <span className="geo-results__addr">{p.displayName}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Google マップリンク（任意） */}
        <input
          type="url"
          className="field__input loc-url"
          placeholder="Google マップのリンクを貼ると自動入力（任意）"
          value={draft.mapsUrl}
          onChange={(e) => applyMapsUrl(e.target.value)}
          inputMode="url"
        />
        {mapsHint && <span className="field__hint">{mapsHint}</span>}
      </div>

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
