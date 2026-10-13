// 場上道具圖示的大小(世界單位)。桌機照 ITEM_SIZE;手機上整個盤子縮得很小,
// 照原本大小只剩 10 像素左右,四個冰藍色圖示分不出來 —— 至少放大到 ITEM_MIN_PX 像素。
// pxPerUnit:盤心附近一個世界單位在螢幕上是幾像素(scene3d 每一格量一次,兩次投影)。
// 只放大圖示;地上的影子維持原本大小,標出真正撿得到的位置。
export const ITEM_SIZE = 16;
export const ITEM_MIN_PX = 28;

export function itemSize(pxPerUnit) {
  if (!(pxPerUnit > 0)) return ITEM_SIZE;
  return Math.max(ITEM_SIZE, ITEM_MIN_PX / pxPerUnit);
}
