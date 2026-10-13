// 設定頁的數量輸入框(大亂鬥每隊人數、爬格子每種獎品數量)。
//
// 打字時只回報數字(onCount),**不改輸入框、也不該讓呼叫端重畫清單** —— 重畫會把輸入框換掉,
// 游標不見,刪掉數字再打常常打不進去(上線過)。離開輸入框(change)時才把顯示整理好。
export function parseCount(text, max) {
  const v = Number(text);
  if (text === '' || !Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(max, Math.floor(v)));
}

export function bindCountInput(input, { value, max, onCount }) {
  input.type = 'number';
  input.min = '0';
  input.max = String(max);
  input.value = String(value);
  input.addEventListener('input', () => onCount(parseCount(input.value, max)));
  input.addEventListener('change', () => { input.value = String(parseCount(input.value, max)); });
  return input;
}
