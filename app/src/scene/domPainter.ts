import { SCREEN_PX } from './phone';

/**
 * Paints a DOM subtree onto a canvas using its live layout: background colours, solid borders,
 * rounded corners, overflow clipping and text (word by word, at measured positions).
 * Enough for the phone screen UI, so its painted twin matches the HTML pixel for pixel
 * — including scroll position and expanded rows — and stays in sync when the design changes.
 * Not supported (on purpose): shadows, images, transforms inside the subtree, pseudo-elements.
 */
export function paintFromDOM(root: HTMLElement, canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!;
  // Settle any running CSS transitions/animations first: the compositor may show them finished while
  // layout still reports an in-between state (e.g. the app's zoom-in), which would skew every rect.
  root.getAnimations({ subtree: true }).forEach((a) => { try { a.finish(); } catch { /* infinite */ } });
  const R = root.getBoundingClientRect();
  if (R.width === 0) return;
  const k = R.width / SCREEN_PX.w; // root is CSS-scaled to sit on the 3D screen
  const local = (r: DOMRect) => ({ x: (r.left - R.left) / k, y: (r.top - R.top) / k, w: r.width / k, h: r.height / k });

  const s = canvas.width / SCREEN_PX.w;
  ctx.setTransform(s, 0, 0, s, 0, 0);
  ctx.clearRect(0, 0, SCREEN_PX.w, SCREEN_PX.h);

  const range = document.createRange();
  // Painting is synchronous, so briefly un-hiding the root never reaches the screen.
  const prevVis = root.style.visibility;
  root.style.visibility = 'visible';

  const visible = (c: string) => c && c !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(c);
  const radius = (cs: CSSStyleDeclaration) => parseFloat(cs.borderTopLeftRadius) || 0;

  function box(x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    if (r > 0) ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
    else ctx.rect(x, y, w, h);
  }

  function wallpaper(x: number, y: number, w: number, h: number) {
    // background-image isn't rasterised; elements using one get the app's dotted wallpaper.
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#15161d'); g.addColorStop(1, '#0f1015');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#2a2c35';
    for (let i = x; i < x + w; i += 25) for (let j = y; j < y + h; j += 25) ctx.fillRect(i, j, 1.5, 1.5);
  }

  function text(node: Text, cs: CSSStyleDeclaration) {
    const raw = node.textContent ?? '';
    if (!raw.trim()) return;
    const tt = cs.textTransform;
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    if ('letterSpacing' in ctx) (ctx as any).letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
    ctx.fillStyle = cs.color;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    const re = /\S+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(raw))) {
      range.setStart(node, m.index);
      range.setEnd(node, m.index + m[0].length);
      const rect = range.getClientRects()[0];
      if (!rect || rect.width === 0) continue;
      const b = local(rect);
      let word = m[0];
      if (tt === 'uppercase') word = word.toUpperCase();
      const met = ctx.measureText(word);
      const ascent = met.fontBoundingBoxAscent ?? parseFloat(cs.fontSize) * 0.8;
      const descent = met.fontBoundingBoxDescent ?? parseFloat(cs.fontSize) * 0.2;
      // Range rects span the font's content area; centre the glyph box in it.
      const baseline = b.y + (b.h - (ascent + descent)) / 2 + ascent;
      ctx.fillText(word, b.x, baseline);
    }
  }

  function draw(el: Element) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none') return;
    const r = el.getBoundingClientRect();
    const b = local(r);
    const rad = radius(cs);
    const shown = cs.visibility !== 'hidden' || el === root;

    if (shown && b.w > 0 && b.h > 0) {
      const img = cs.backgroundImage;
      if (img.includes('radial-gradient')) wallpaper(b.x, b.y, b.w, b.h);
      else if (img.includes('linear-gradient')) {
        // Fades (e.g. footer over content): approximate with the gradient's final colour.
        const stops = img.match(/rgba?\([^)]*\)/g);
        const last = stops?.[stops.length - 1];
        if (last && visible(last)) { ctx.fillStyle = last; box(b.x, b.y, b.w, b.h, rad); ctx.fill(); }
      } else if (visible(cs.backgroundColor)) { ctx.fillStyle = cs.backgroundColor; box(b.x, b.y, b.w, b.h, rad); ctx.fill(); }
      const bw = { t: parseFloat(cs.borderTopWidth), r: parseFloat(cs.borderRightWidth), b: parseFloat(cs.borderBottomWidth), l: parseFloat(cs.borderLeftWidth) };
      if (bw.t || bw.r || bw.b || bw.l) {
        if (bw.t && cs.borderTopStyle === 'solid') { ctx.fillStyle = cs.borderTopColor; ctx.fillRect(b.x, b.y, b.w, bw.t); }
        if (bw.b && cs.borderBottomStyle === 'solid') { ctx.fillStyle = cs.borderBottomColor; ctx.fillRect(b.x, b.y + b.h - bw.b, b.w, bw.b); }
        if (bw.l && cs.borderLeftStyle === 'solid') { ctx.fillStyle = cs.borderLeftColor; ctx.fillRect(b.x, b.y, bw.l, b.h); }
        if (bw.r && cs.borderRightStyle === 'solid') { ctx.fillStyle = cs.borderRightColor; ctx.fillRect(b.x + b.w - bw.r, b.y, bw.r, b.h); }
      }
    }

    ctx.save();
    if (cs.overflow !== 'visible' || el === root) { box(b.x, b.y, b.w, b.h, rad); ctx.clip(); }
    // Text first, then elements in stacking order (positive z-index on top), like the browser.
    for (const child of el.childNodes) if (child.nodeType === Node.TEXT_NODE && shown) text(child as Text, cs);
    const z = (e: Element) => parseInt(getComputedStyle(e).zIndex) || 0;
    [...el.children].map((e, i) => ({ e, i, z: z(e) }))
      .sort((a, b) => a.z - b.z || a.i - b.i)
      .forEach(({ e }) => draw(e));
    ctx.restore();
  }

  try { draw(root); } finally { root.style.visibility = prevVis; }
}
