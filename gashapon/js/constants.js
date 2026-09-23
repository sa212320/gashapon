// 稀有度由低到高。順序就是升階演出的順序,不要重排。
// 凍結:驗證用的 RARITIES.includes(rarity) 跟外部拿到的是同一個陣列,
// 沒凍結的話,誰不小心 push 或 sort 一下,合法值判斷就跟著壞掉。
export const RARITIES = Object.freeze(['N', 'R', 'SR', 'SSR', 'UR']);

export const RARITY_META = Object.freeze({
  N:   { label: '普通',   color: '#FFFFFF', edge: '#C9BFB4', glow: 'rgba(255,255,255,.7)' },
  R:   { label: '稀有',   color: '#5FD68A', edge: '#2F9E5B', glow: 'rgba(95,214,138,.8)' },
  SR:  { label: '超稀有', color: '#A970F2', edge: '#6F3FC4', glow: 'rgba(169,112,242,.85)' },
  SSR: { label: '傳說',   color: '#F7C948', edge: '#C08A0B', glow: 'rgba(247,201,72,.9)' },
  UR:  { label: '究極',   color: 'rainbow', edge: '#8B5CF6', glow: 'rgba(255,255,255,.95)' },
});

export const STORAGE_KEY = 'gashapon.v1';
export const SCHEMA_VERSION = 1;

// 第一次開站看到的機台
export const SEED_MACHINE_NAME = '今天做什麼';
// 凍結陣列跟裡面每個項目:這份資料只該被讀,createSeedMachine 每次都是
// 用它 map 出全新的 createPrize() 結果,沒有任何地方需要就地改動它。
export const SEED_PRIZES = Object.freeze([
  { name: '掃地',     count: 3, rarity: 'N' },
  { name: '擦黑板',   count: 3, rarity: 'N' },
  { name: '倒垃圾',   count: 2, rarity: 'R' },
  { name: '當小老師', count: 1, rarity: 'SR' },
  { name: '放假一天', count: 1, rarity: 'UR' },
].map(Object.freeze));
