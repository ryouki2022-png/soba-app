// そば記録アプリの型定義

/** 温度（温かい / 冷たい） */
export type Temperature = "hot" | "cold";

/** そば1杯分の記録 */
export interface SobaRecord {
  id: string;
  /** 店名 */
  shopName: string;
  /** 食べたメニュー（複数可。例: ざるそば、鴨南蛮） */
  menuItems: string[];
  /** トッピング（複数可。例: 海苔、温泉卵、ねぎ） */
  toppings: string[];
  /** Google マップのリンク */
  mapsUrl: string;
  /** 住所（マップリンクから取得できた場合） */
  address: string;
  /** 緯度・経度（マップリンクから取得できた場合） */
  lat: number | null;
  lng: number | null;
  /** 温かい / 冷たい */
  temperature: Temperature;
  /** こしの強さ 1〜5 */
  koshi: number;
  /** 値段（円） */
  price: number | null;
  /** 総合評価 1〜5 */
  rating: number;
  /** メモ・感想 */
  memo: string;
  /** 写真（data URL） */
  photo: string;
  /** 食べた日（YYYY-MM-DD） */
  date: string;
  /** 作成日時（ISO） */
  createdAt: string;
}

/** 新規作成・編集フォームで扱う入力値 */
export type SobaDraft = Omit<SobaRecord, "id" | "createdAt">;
