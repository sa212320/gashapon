// 主畫面:剩餘標籤、空機畫面、「轉!」與把手的可按狀態、音效圖示。
// 機台本身是一張插畫,圓頂裡的蛋是畫死的裝飾,跟剩幾顆無關(2026-10-01 決定)。
import { remaining, totalCount } from './state.js';

export function createMachineView(els) {
  return {
    render(machine) {
      const total = totalCount(machine);
      const left = remaining(machine);
      const empty = machine.removeOnDraw && left === 0 && total > 0;

      if (total === 0) {
        els.remainTag.textContent = '還沒有獎項';
        els.remainTag.hidden = false;
      } else {
        els.remainTag.textContent = `剩 ${left} 顆`;
        // 抽到不拿走的話,「剩幾顆」永遠不變,顯示了反而誤導
        els.remainTag.hidden = !machine.removeOnDraw;
      }

      els.emptyState.hidden = !empty;
      const disabled = empty || total === 0;
      els.drawBtn.disabled = disabled;
      els.knob.disabled = disabled;
    },

    setSoundIcon(on) {
      els.soundIcon.setAttribute('href', `../shared/img/icons.svg#${on ? 'sound-on' : 'sound-off'}`);
    },
  };
}
