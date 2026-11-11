'use strict';
// ===== 介面圖示：以單色線條 SVG 取代表情符號（跟隨文字顏色，高解析度下不模糊） =====
const UI_ICON_PATHS = {
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 21V5M8 7h7M8 11h7',
  swords: 'M4 4l9 9M4 4v3l8 8M20 4l-9 9M20 4v3l-8 8M6 20l3-3M18 20l-3-3M4 18l2 2M20 18l-2 2',
  flask: 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M7.5 15h9',
  save: 'M5 3h12l3 3v15H4V3zM8 3v6h8V3M8 21v-7h8v7',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 17h.01',
  coin: 'M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 7v10M14.5 9.5c-.5-1-1.5-1.3-2.5-1.3-1.5 0-2.5.8-2.5 1.9 0 2.6 5.2 1.2 5.2 3.9 0 1.1-1.1 1.9-2.7 1.9-1.200 0-2.3-.5-2.800-1.500',
  robot: 'M12 3v3M6 7h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zM9 12h.01M15 12h.01M9 16h6M2 12v3M22 12v3',
  stop: 'M6 6h12v12H6z',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  gear: 'M12 15.500a3.500 3.500 0 1 0 0-7 3.500 3.500 0 0 0 0 7zM19 12a7 7 0 0 0-.1-1.300l2-1.500-2-3.400-2.300.9a7 7 0 0 0-2.200-1.300L14 3h-4l-.4 2.400a7 7 0 0 0-2.200 1.300l-2.300-.9-2 3.400 2 1.500A7 7 0 0 0 5 12c0 .4 0 .9.1 1.300l-2 1.500 2 3.400 2.300-.9a7 7 0 0 0 2.200 1.300L10 21h4l.4-2.400a7 7 0 0 0 2.200-1.300l2.300.9 2-3.400-2-1.500c.1-.4.1-.9.1-1.300z',
  chart: 'M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3',
  music: 'M9 18V6l10-2v12M9 18a2.500 2.500 0 1 1-5 0 2.500 2.500 0 0 1 5 0zM19 16a2.500 2.500 0 1 1-5 0 2.500 2.500 0 0 1 5 0z',
  sound: 'M4 9v6h4l5 4V5L8 9H4zM16 9a4 4 0 0 1 0 6M18.500 6.500a8 8 0 0 1 0 11',
  notes: 'M5 6h14M5 10h14M5 14h9M5 18h9M17 13v6M17 19a1.500 1.500 0 1 1-3 0 1.500 1.500 0 0 1 3 0z',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01',
  star: 'M12 3l2.700 5.600 6.100.9-4.400 4.300 1 6.100L12 17l-5.400 2.900 1-6.100L3.200 9.500l6.100-.9z',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  pin: 'M12 21s7-6.200 7-11.500A7 7 0 0 0 5 9.500C5 14.800 12 21 12 21zM12 12a2.500 2.500 0 1 0 0-5 2.500 2.500 0 0 0 0 5z',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c3 3.200 3 14.800 0 18M12 3c-3 3.200-3 14.800 0 18',
  build: 'M3 21h18M5 21V9l5-4v16M10 21V11l9 3v7M14 17h1',
  medal: 'M8 3h8l-2 6h-4zM12 21a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 14v4',
  fuel: 'M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M4 21h12M7 8h6M15 10l3 2v6a1.500 1.500 0 0 0 3 0V9l-3-3',
  truck: 'M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  lock: 'M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3',
  up: 'M12 20V5M6 11l6-6 6 6',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.500c.7.700 1 1.500 1 2.500h6c0-1 .3-1.800 1-2.500A6 6 0 0 0 12 3z',
  x: 'M6 6l12 12M18 6L6 18',
  check: 'M5 13l4 4L19 7',
  moon: 'M20 14.500A8 8 0 1 1 9.500 4a6.500 6.500 0 0 0 10.500 10.500z',
  handshake: 'M3 11l4-4 4 2 2-2 4 1 4 3-3 4-3 3-2-1-2 1-3-3-2-1zM10 9l-2 3 3 2',
  brain: 'M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 0V7a3 3 0 0 0-3-3zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 0',
  sliders: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4',
};
const UI_EMOJI = {
  '📖': 'book', '⚔️': 'swords', '⚔': 'swords', '🧪': 'flask', '💾': 'save', '❓': 'help', '💰': 'coin', '🤖': 'robot', '⏹️': 'stop', '⏹': 'stop', '👀': 'eye',
  '⚙️': 'gear', '⚙': 'gear', '📊': 'chart', '♪': 'music', '🔊': 'sound', '🎼': 'notes', '🎯': 'target', '⭐': 'star', '🚩': 'flag', '📍': 'pin', '🌏': 'globe',
  '🏗️': 'build', '🏗': 'build', '🎖': 'medal', '🎖️': 'medal', '⛽': 'fuel', '🚚': 'truck', '🔒': 'lock', '⬆': 'up', '💡': 'bulb', '✖': 'x', '✕': 'x', '✅': 'check',
  '🌙': 'moon', '🤝': 'handshake', '🧠': 'brain', '🎛': 'sliders', '🎛️': 'sliders', '🪖': 'medal', '🛠️': 'build', '🛠': 'build', '🧬': 'up', '⚡': 'up',
};
function uiIcon(name, size) {
  const d = UI_ICON_PATHS[name];
  return d ? `<svg class="ui-ico" ${size ? `style="width:${size}px;height:${size}px"` : ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>` : '';
}
// 自動把介面文字中的表情符號換成線條圖示（地圖畫布與輸入欄位不處理）
(function () {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
  const keys = Object.keys(UI_EMOJI).sort((a, b) => b.length - a.length);
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(keys.map(esc).join('|'), 'g');
  const swap = node => {
    const text = node.nodeValue;
    if (!text || !re.test(text)) return;
    re.lastIndex = 0;
    const p = node.parentNode;
    if (!p || p.closest('svg, textarea, input, select, option, script, style, .no-ico')) return;
    const frag = document.createDocumentFragment();
    let last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      const span = document.createElement('span');
      span.className = 'ui-ico-wrap'; span.innerHTML = uiIcon(UI_EMOJI[m[0]]);
      frag.appendChild(span);
      last = m.index + m[0].length;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    p.replaceChild(frag, node);
  };
  const walk = root => {
    if (root.nodeType === 3) return swap(root);
    if (root.nodeType !== 1 || root.tagName === 'CANVAS' || root.tagName === 'svg') return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), list = [];
    while (w.nextNode()) list.push(w.currentNode);
    list.forEach(swap);
  };
  const start = () => {
    walk(document.body);
    new MutationObserver(muts => {
      for (const m of muts) {
        if (m.type === 'characterData') swap(m.target);
        else m.addedNodes.forEach(walk);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
