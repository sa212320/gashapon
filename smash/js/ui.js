// 大亂鬥的畫面。俯視的平面競技場,用 2D canvas ——
// 硬套 3D 只會讓「誰快被推出去了」變得更難判斷,而且多背一包 three.js。
const INK = '#574239';

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let scale = 1;
  let cx = 0;
  let cy = 0;

  // 縮放用「最初的場地大小」算,不要用當下的 —— 場地會隨時間縮小,
  // 跟著當下算的話畫面會一直放大,看起來像鏡頭在推近,場地反而不像在變小。
  function resize(arenaRadius) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    scale = Math.min(w, h) / (arenaRadius * 2.28);
    cx = w / 2;
    cy = h / 2;
  }

  const sx = x => cx + x * scale;
  const sy = y => cy + y * scale;

  function circle(x, y, r, fill, lw = 3) {
    ctx.beginPath();
    ctx.arc(sx(x), sy(y), r * scale, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    if (lw > 0) {
      ctx.lineWidth = lw;
      ctx.strokeStyle = INK;
      ctx.stroke();
    }
  }

  const ITEM_FACE = { attack: '👊', speed: '⚡', giant: '🔷', bomb: '💣' };

  function draw(world, names) {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    ctx.clearRect(0, 0, w, h);

    // 場地。被推到圓外就出局,所以邊界要畫得很清楚。
    circle(0, 0, world.arenaRadius, '#F7E9D6', 6);
    circle(0, 0, world.arenaRadius * 0.55, 'rgba(255,255,255,.45)', 0);

    for (const item of world.items) {
      circle(item.x, item.y, item.radius, '#FFF7EC', 3);
      ctx.font = `${Math.round(item.radius * scale * 1.5)}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ITEM_FACE[item.type] ?? '?', sx(item.x), sy(item.y));
    }

    for (const bomb of world.bombs) {
      // 引信越短閃越快,看得出快炸了
      const blink = bomb.fuse < 0.6 && Math.floor(bomb.fuse * 12) % 2 === 0;
      circle(bomb.x, bomb.y, bomb.radius * (blink ? 1.35 : 1), blink ? '#FF6F91' : '#3E3330', 3);
    }

    for (const c of world.combatants) {
      if (!c.alive) continue;
      const f = names.get(c.fighterId);
      circle(c.x, c.y, c.radius, f?.color ?? '#CCC', 4);
      if (c.buffs.attack > 0) circle(c.x, c.y, c.radius * 1.28, 'rgba(255,111,145,.28)', 0);
      if (c.buffs.speed > 0) circle(c.x, c.y, c.radius * 1.45, 'rgba(140,201,255,.22)', 0);
      // 眼睛,讓它有生命感
      const e = c.radius * scale * 0.2;
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(sx(c.x) - e * 1.4, sy(c.y) - e * 0.4, e, 0, Math.PI * 2);
      ctx.arc(sx(c.x) + e * 1.4, sy(c.y) - e * 0.4, e, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  return { resize, draw };
}
