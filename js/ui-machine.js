// 主畫面:機台名字、剩餘顆數、機身裡還剩幾顆蛋、空機畫面。
import { RARITY_META } from './constants.js';
import { remaining, totalCount } from './state.js';

// 圓頂裡的堆疊位置,由下往上。超過這些位置的蛋就不畫了(畫面上塞不下)。
const SLOTS = [
  [60,136],[82,138],[104,135],[126,138],[148,136],
  [50,116],[72,118],[94,115],[116,118],[138,115],[160,117],
  [52,96],[74,98],[96,95],[118,98],[140,95],[162,97],
  [60,76],[82,78],[104,75],[126,78],[148,76],
  [70,56],[92,58],[114,55],[136,57],
  [92,38],[110,40],[128,38],
];

export function createMachineView(els) {
  function renderCapsules(machine) {
    const left = machine.removeOnDraw
      ? machine.pool.filter(c => !c.drawn)
      : machine.pool;
    const byId = new Map(machine.prizes.map(p => [p.id, p]));

    const frag = document.createDocumentFragment();
    left.slice(0, SLOTS.length).forEach((capsule, i) => {
      const [cx, cy] = SLOTS[i];
      const rarity = byId.get(capsule.prizeId)?.rarity ?? 'N';
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', cx);
      circle.setAttribute('cy', cy);
      circle.setAttribute('r', 11);
      circle.setAttribute('fill', rarity === 'UR' ? '#FFB3E6' : RARITY_META[rarity].color);
      circle.style.animationDelay = `${(i % 7) * 0.22}s`;
      frag.appendChild(circle);
    });
    els.capsuleGroup.replaceChildren(frag);
  }

  return {
    render(machine) {
      els.machineName.textContent = machine.name || '扭蛋機';
      const left = remaining(machine);
      els.remaining.textContent = machine.removeOnDraw
        ? `還剩 ${left} 顆 / 共 ${totalCount(machine)} 顆`
        : '抽到的不會消失,可以一直抽';
      renderCapsules(machine);

      const empty = machine.removeOnDraw && left === 0;
      els.emptyState.hidden = !empty;
      els.drawBtn.disabled = empty || totalCount(machine) === 0;
      if (!empty && totalCount(machine) === 0) {
        els.remaining.textContent = '還沒有獎項,去設定加一個吧!';
      }
    },

    setSoundIcon(on) {
      els.soundIcon.textContent = on ? '🔊' : '🔇';
      els.soundBtn.classList.toggle('is-muted', !on);
    },
  };
}
