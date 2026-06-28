import { useEffect, useMemo, useState } from "react";
import "./App.css";
import type { SobaDraft, SobaRecord, Temperature } from "./types";
import { createId, loadRecords, saveRecords } from "./storage";
import { groupByStore } from "./utils/stores";
import { RecordCard } from "./components/RecordCard";
import { RecordForm } from "./components/RecordForm";
import { RecordDetail } from "./components/RecordDetail";
import { DataView } from "./components/DataView";
import { StoreList } from "./components/StoreList";
import { StoreDetail } from "./components/StoreDetail";

type View =
  | { name: "list" }
  | { name: "create"; prefill?: Partial<SobaDraft> }
  | { name: "detail"; id: string }
  | { name: "edit"; id: string }
  | { name: "storeDetail"; key: string }
  | { name: "data" };

type Filter = "all" | Temperature;
type HomeTab = "records" | "stores";

export default function App() {
  const [records, setRecords] = useState<SobaRecord[]>([]);
  const [view, setView] = useState<View>({ name: "list" });
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [tab, setTab] = useState<HomeTab>("records");

  // 初回読み込み
  useEffect(() => {
    setRecords(loadRecords());
  }, []);

  // 変更があれば保存
  const persist = (next: SobaRecord[]) => {
    setRecords(next);
    saveRecords(next);
  };

  const handleCreate = (draft: SobaDraft) => {
    const record: SobaRecord = {
      ...draft,
      id: createId(),
      createdAt: new Date().toISOString(),
    };
    persist([record, ...records]);
    setView({ name: "detail", id: record.id });
  };

  const handleUpdate = (id: string, draft: SobaDraft) => {
    persist(records.map((r) => (r.id === id ? { ...r, ...draft } : r)));
    setView({ name: "detail", id });
  };

  const handleDelete = (id: string) => {
    persist(records.filter((r) => r.id !== id));
    setView({ name: "list" });
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return records.filter((r) => {
      if (filter !== "all" && r.temperature !== filter) return false;
      if (!q) return true;
      return (
        r.shopName.toLowerCase().includes(q) ||
        r.menuName.toLowerCase().includes(q) ||
        r.memo.toLowerCase().includes(q)
      );
    });
  }, [records, query, filter]);

  const stores = useMemo(() => groupByStore(records), [records]);

  const stats = useMemo(() => {
    const count = records.length;
    const avg = count === 0 ? 0 : records.reduce((s, r) => s + r.rating, 0) / count;
    return { count, avg, shops: stores.length };
  }, [records, stores]);

  const findRecord = (id: string) => records.find((r) => r.id === id);

  // --- 画面ごとの描画 ---

  if (view.name === "create") {
    return (
      <Shell>
        <RecordForm
          initial={view.prefill}
          allRecords={records}
          onSubmit={handleCreate}
          onCancel={() => setView({ name: "list" })}
        />
      </Shell>
    );
  }

  if (view.name === "edit") {
    const rec = findRecord(view.id);
    if (!rec) return <Shell>{notFound(() => setView({ name: "list" }))}</Shell>;
    const { id, createdAt, ...draft } = rec;
    void id;
    void createdAt;
    return (
      <Shell>
        <RecordForm
          initial={draft}
          isEdit
          allRecords={records}
          excludeId={rec.id}
          onSubmit={(d) => handleUpdate(rec.id, d)}
          onCancel={() => setView({ name: "detail", id: rec.id })}
        />
      </Shell>
    );
  }

  if (view.name === "data") {
    return (
      <Shell>
        <DataView
          records={records}
          onBack={() => setView({ name: "list" })}
          onImported={(next) => persist(next)}
          onSelect={(id) => setView({ name: "detail", id })}
        />
      </Shell>
    );
  }

  if (view.name === "storeDetail") {
    const store = stores.find((s) => s.key === view.key);
    if (!store) return <Shell>{notFound(() => setView({ name: "list" }))}</Shell>;
    return (
      <Shell>
        <StoreDetail
          store={store}
          onBack={() => setView({ name: "list" })}
          onSelectRecord={(id) => setView({ name: "detail", id })}
          onAddVisit={() =>
            setView({
              name: "create",
              prefill: {
                shopName: store.name,
                mapsUrl: store.mapsUrl,
                lat: store.lat,
                lng: store.lng,
              },
            })
          }
        />
      </Shell>
    );
  }

  if (view.name === "detail") {
    const rec = findRecord(view.id);
    if (!rec) return <Shell>{notFound(() => setView({ name: "list" }))}</Shell>;
    return (
      <Shell>
        <RecordDetail
          record={rec}
          onEdit={() => setView({ name: "edit", id: rec.id })}
          onDelete={() => handleDelete(rec.id)}
          onBack={() => setView({ name: "list" })}
        />
      </Shell>
    );
  }

  // 一覧（記録 / お店別タブ）
  return (
    <Shell>
      <header className="hero">
        <div className="hero__bar">
          <h1 className="hero__title">🍜 そば記録</h1>
          <button
            type="button"
            className="hero__data-btn"
            onClick={() => setView({ name: "data" })}
          >
            📋 データ
          </button>
        </div>
        <p className="hero__sub">食べたそばを記録しよう</p>
        <div className="stats">
          <Stat label="記録数" value={`${stats.count}`} />
          <Stat label="お店" value={`${stats.shops}`} />
          <Stat label="平均評価" value={stats.count ? stats.avg.toFixed(1) : "-"} />
        </div>
      </header>

      {/* 記録 / お店別 タブ */}
      <div className="tabs">
        <button
          type="button"
          className={`tabs__btn${tab === "records" ? " tabs__btn--active" : ""}`}
          onClick={() => setTab("records")}
        >
          🍜 記録
        </button>
        <button
          type="button"
          className={`tabs__btn${tab === "stores" ? " tabs__btn--active" : ""}`}
          onClick={() => setTab("stores")}
        >
          🏪 お店別
        </button>
      </div>

      {records.length === 0 ? (
        <div className="empty">
          <div className="empty__icon">🥢</div>
          <p className="empty__text">まだ記録がありません</p>
          <p className="empty__hint">右下のボタンから最初のそばを記録しましょう</p>
        </div>
      ) : tab === "stores" ? (
        <StoreList
          stores={stores}
          onSelect={(key) => setView({ name: "storeDetail", key })}
        />
      ) : (
        <>
          <div className="toolbar">
            <input
              type="search"
              className="toolbar__search"
              placeholder="店名・メニュー・メモで検索"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="toolbar__filters">
              {(
                [
                  ["all", "すべて"],
                  ["hot", "🔥 温かい"],
                  ["cold", "❄️ 冷たい"],
                ] as [Filter, string][]
              ).map(([f, label]) => (
                <button
                  key={f}
                  type="button"
                  className={`chip${filter === f ? " chip--active" : ""}`}
                  onClick={() => setFilter(f)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="empty">
              <p className="empty__text">条件に合う記録がありません</p>
            </div>
          ) : (
            <div className="list">
              {filtered.map((r) => (
                <RecordCard
                  key={r.id}
                  record={r}
                  onClick={() => setView({ name: "detail", id: r.id })}
                />
              ))}
            </div>
          )}
        </>
      )}

      <button
        type="button"
        className="fab"
        aria-label="記録を追加"
        onClick={() => setView({ name: "create" })}
      >
        ＋
      </button>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="app">{children}</div>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span className="stat__value">{value}</span>
      <span className="stat__label">{label}</span>
    </div>
  );
}

function notFound(onBack: () => void) {
  return (
    <div className="empty">
      <p className="empty__text">記録が見つかりませんでした</p>
      <button type="button" className="btn btn--ghost" onClick={onBack}>
        一覧へ戻る
      </button>
    </div>
  );
}
