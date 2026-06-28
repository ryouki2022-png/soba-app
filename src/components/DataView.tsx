// データ一覧（表）とバックアップ／復元の画面

import { useRef } from "react";
import type { SobaRecord } from "../types";
import {
  exportCsv,
  exportJson,
  mergeRecords,
  parseImportedJson,
} from "../utils/dataIO";

interface DataViewProps {
  records: SobaRecord[];
  onBack: () => void;
  onImported: (records: SobaRecord[]) => void;
  onSelect: (id: string) => void;
}

export function DataView({
  records,
  onBack,
  onImported,
  onSelect,
}: DataViewProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await file.text();
      const imported = parseImportedJson(text);
      const merged = mergeRecords(records, imported);
      onImported(merged);
      alert(`${imported.length}件を読み込みました（合計${merged.length}件）`);
    } catch (e) {
      console.error(e);
      alert("読み込みに失敗しました。正しいバックアップファイル（.json）を選んでください。");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="data">
      <button type="button" className="detail__back" onClick={onBack}>
        ← 一覧へ
      </button>

      <h2 className="data__title">📋 データ一覧</h2>
      <p className="data__count">全 {records.length} 件</p>

      {records.length === 0 ? (
        <p className="data__empty">まだ記録がありません。</p>
      ) : (
        <div className="data__table-wrap">
          <table className="data__table">
            <thead>
              <tr>
                <th>日付</th>
                <th>店名</th>
                <th>メニュー</th>
                <th>温度</th>
                <th>こし</th>
                <th>値段</th>
                <th>評価</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id} onClick={() => onSelect(r.id)}>
                  <td>{r.date}</td>
                  <td className="data__shop">{r.shopName}</td>
                  <td>{r.menuName || "-"}</td>
                  <td>{r.temperature === "hot" ? "🔥" : "❄️"}</td>
                  <td>{"●".repeat(r.koshi)}</td>
                  <td>{r.price != null ? `¥${r.price.toLocaleString()}` : "-"}</td>
                  <td className="data__rating">{"★".repeat(r.rating)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="data__io">
        <h3 className="data__io-title">バックアップ・復元</h3>
        <p className="data__io-note">
          記録はこの端末のブラウザ内だけに保存されています。機種変更や履歴削除に備えて、
          ときどき書き出して保存しておくと安心です。
        </p>
        <div className="data__io-btns">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => exportJson(records)}
            disabled={records.length === 0}
          >
            💾 バックアップ（JSON）
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => exportCsv(records)}
            disabled={records.length === 0}
          >
            📄 CSVで書き出し
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => fileRef.current?.click()}
          >
            📥 復元（読み込み）
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => handleImport(e.target.files?.[0])}
          />
        </div>
      </section>
    </div>
  );
}
