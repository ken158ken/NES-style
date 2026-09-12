// 覺醒像素圖（Round 7 覺醒與挑戰）
// 提供兩個精靈給 player.js 的覺醒外觀疊加：
//   fx_awaken_aura   32×32 ×3 幀，金色脈動光環（anchor: center → 畫在卡比中心 p.cx / p.cy）
//   hat_awaken_crown 20×9  ×2 幀，覺醒冠冕（anchor: bottom → 畫在帽子上方，最後一列貼著給定的 y）
// 規則同其他 art 檔：純程式像素、原創圖案、不使用任何外部素材。
(function () {
  'use strict';
  const KB = window.KB;
  if (!KB || !KB.sprite) return;

  // 金色調色盤（w 最亮 → Y 最暗；k 黑描邊）
  const PAL = {
    w: '#fffce0',   // 高光白金
    y: '#ffe040',   // 金
    g: '#ffa000',   // 深金
    Y: '#c06800',   // 暗金（描邊內側）
    k: '#3a2400',   // 深褐描邊
    e: '#ffffff',
  };

  // ==========================================================
  //  fx_awaken_aura：3 幀脈動光環（火焰狀波紋的圓環）
  // ==========================================================
  const AW = 32, AH = 32, ACX = 15.5, ACY = 15.5;
  function auraFrame(f) {
    const rows = [];
    const puls = [0, 0.9, 1.7][f];              // 每幀外擴一點
    for (let y = 0; y < AH; y++) {
      let s = '';
      for (let x = 0; x < AW; x++) {
        const dx = x - ACX, dy = (y - ACY) * 1.06;
        const d = Math.sqrt(dx * dx + dy * dy);
        const a = Math.atan2(dy, dx);
        const wob = Math.sin(a * 6 + f * 2.1) * 1.2 + Math.sin(a * 3 - f * 1.3) * 0.7;
        const r = 13.3 + puls + wob;
        let ch = '.';
        if (d > r - 2.4 && d < r + 0.9) {
          if (d > r - 0.3) ch = 'Y';            // 外緣暗金
          else if (d > r - 1.2) ch = 'g';
          else ch = 'y';
        }
        // 內側火星閃點
        if (ch === '.' && d > r - 4.6 && d <= r - 2.4 && ((x * 3 + y * 5 + f * 7) % 13 === 0)) ch = 'w';
        // 四個方位的長光芒
        const spike = Math.abs(Math.sin(a * 2 + f * 0.5));
        if (ch === '.' && spike > 0.985 && d < r + 3.6 && d > r) ch = 'y';
        s += ch;
      }
      rows.push(s);
    }
    return rows;
  }
  KB.sprite('fx_awaken_aura', PAL, [auraFrame(0), auraFrame(1), auraFrame(2)], { anchor: 'center', fps: 12 });

  // ==========================================================
  //  hat_awaken_crown：覺醒冠冕（3 尖角 + 寶石，2 幀＝寶石閃爍）
  // ==========================================================
  function crown(lit) {
    const j = lit ? 'e' : 'w';                  // 寶石高光
    return [
      '..k.......k.......k.',
      '.kwk.....kwk.....kwk',
      '.kyk.....kyk.....kyk',
      '.kyk..k..kyk..k..kyk',
      'kkykkkykkkykkkykkkyk',
      'kyyyyy' + j + 'yyyyy' + j + 'yyyyyyk',
      'kyyyyyyyyyyyyyyyyyyk',
      'kYgYgYgYgYgYgYgYgYYk',
      'kkkkkkkkkkkkkkkkkkkk',
    ];
  }
  KB.sprite('hat_awaken_crown', PAL, [crown(false), crown(true)], { anchor: 'bottom', fps: 6 });
})();
