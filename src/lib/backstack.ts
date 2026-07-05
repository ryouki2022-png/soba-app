// スマホ・ブラウザの「戻る」ボタンを画面内ナビゲーションと連動させる仕組み。
//
// 詳細画面やサブアプリを開いたときに履歴を1つ積み、
// 「戻る」が押されたらアプリを閉じる代わりに前の画面へ戻す。
// 複数の階層（ランチャー → そばアプリ → 詳細画面）が同時に
// 開いていても、後に開いたものから順に閉じる。

import { useEffect, useRef } from "react";

type Handler = () => void;

const handlers: Handler[] = [];
// UIのボタンで閉じた際に残る「消費されていない履歴エントリ」の数。
// 次の pushState で再利用するか、popstate 時に黙って読み飛ばす。
let stale = 0;
let listening = false;

function ensureListener() {
  if (listening) return;
  listening = true;
  window.addEventListener("popstate", () => {
    if (stale > 0) {
      // UI操作で閉じた画面の残骸エントリ。何もせず消費する。
      stale--;
      return;
    }
    const h = handlers.pop();
    if (h) h();
    // handlers が空なら通常のブラウザバックに任せる
  });
}

function pushHandler(h: Handler) {
  ensureListener();
  handlers.push(h);
  if (stale > 0) {
    // 残骸エントリを再利用（履歴を無駄に深くしない）
    stale--;
    history.replaceState({ kirokunote: handlers.length }, "");
  } else {
    history.pushState({ kirokunote: handlers.length }, "");
  }
}

function removeHandler(h: Handler) {
  const i = handlers.indexOf(h);
  if (i === -1) return; // popstate 側で既に処理済み
  handlers.splice(i, 1);
  stale++;
}

/**
 * active の間、「戻る」ボタンで onClose が呼ばれるようにする。
 * 例: useBackClose(view.name !== "main", () => setView({ name: "main" }))
 */
export function useBackClose(active: boolean, onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!active) return;
    const handler = () => closeRef.current();
    pushHandler(handler);
    return () => removeHandler(handler);
  }, [active]);
}
