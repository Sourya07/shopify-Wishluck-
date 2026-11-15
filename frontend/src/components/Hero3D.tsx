import { useEffect, useRef } from 'react';

/**
 * Three.js hero: a slowly orbiting ring of landing-page cards (textures drawn on canvas,
 * so no image assets). Drag / swipe to spin, pointer tilts the ring, scrolling spins it a little.
 * Lazy-loads three, pauses off-screen, honours prefers-reduced-motion, falls back to CSS if no WebGL.
 */
const PALETTES = [
  { bg: '#f3ece2', a: '#c2410c', b: '#1f2937', shape: 0, title: 'Story led' },
  { bg: '#ffffff', a: '#0071e3', b: '#1d1d1f', shape: 2, title: 'Benefit grid' },
  { bg: '#f5e6e8', a: '#b08d57', b: '#5b3a29', shape: 0, title: 'Social proof' },
  { bg: '#111111', a: '#66b2ff', b: '#f5f5f7', shape: 2, title: 'Facts first' },
  { bg: '#e7e5d8', a: '#4d5d2a', b: '#2d3319', shape: 1, title: 'Offer led' },
  { bg: '#e8eef6', a: '#1e3a8a', b: '#0f172a', shape: 1, title: 'Story led' },
  { bg: '#fff4d6', a: '#d97706', b: '#1f2937', shape: 0, title: 'Benefit grid' },
  { bg: '#eef2ff', a: '#7c3aed', b: '#1e1b4b', shape: 2, title: 'Social proof' },
  { bg: '#fdf2f8', a: '#db2777', b: '#3b0a24', shape: 1, title: 'Offer led' },
];

function drawPage(p: (typeof PALETTES)[number], i: number) {
  const W = 400, H = 500, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d')!;
  const rr = (X: number, Y: number, w: number, h: number, r: number, fill: string) => { x.beginPath(); x.roundRect(X, Y, w, h, r); x.fillStyle = fill; x.fill(); };
  const mixHex = (h1: string, h2: string, t: number) => { const a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16); const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t); return `rgb(${ch(16)},${ch(8)},${ch(0)})`; };
  rr(0, 0, W, H, 34, p.bg);
  // nav
  rr(28, 26, 92, 14, 7, p.b); rr(W - 104, 29, 30, 9, 5, mixHex(p.bg, p.b, 0.25)); rr(W - 64, 29, 30, 9, 5, mixHex(p.bg, p.b, 0.25));
  // hero image
  const layout = i % 3;
  const imgX = 28, imgY = 62, imgW = layout === 2 ? W - 56 : 196, imgH = layout === 2 ? 170 : 232;
  rr(imgX, imgY, imgW, imgH, 20, mixHex(p.bg, p.a, 0.18));
  x.fillStyle = p.a; x.beginPath();
  const cx = imgX + imgW / 2, cy = imgY + imgH / 2, s = Math.min(imgW, imgH) * 0.34;
  if (p.shape === 0) x.arc(cx, cy, s, 0, Math.PI * 2);
  else if (p.shape === 1) x.roundRect(cx - s * 0.6, cy - s, s * 1.2, s * 2, s * 0.6);
  else { x.save(); x.translate(cx, cy); x.rotate(0.22); x.roundRect(-s, -s, s * 2, s * 2, s * 0.35); x.restore(); }
  x.fill();
  // copy column
  const cx0 = layout === 2 ? 28 : 244, cy0 = layout === 2 ? 252 : 92, cw = layout === 2 ? W - 56 : 128;
  rr(cx0, cy0, cw * 0.9, 16, 8, p.b); rr(cx0, cy0 + 26, cw * 0.65, 16, 8, p.b);
  rr(cx0, cy0 + 60, cw * 0.8, 9, 5, mixHex(p.bg, p.b, 0.35)); rr(cx0, cy0 + 76, cw * 0.6, 9, 5, mixHex(p.bg, p.b, 0.35));
  x.fillStyle = '#f5a623'; for (let k = 0; k < 5; k++) { x.beginPath(); x.arc(cx0 + 8 + k * 18, cy0 + 104, 6, 0, Math.PI * 2); x.fill(); }
  rr(cx0, cy0 + 124, 66, 18, 9, p.a);
  rr(cx0, layout === 2 ? cy0 + 156 : cy0 + 158, cw, 34, 17, p.b);
  // lower row
  const ry = layout === 2 ? 452 : 330;
  if (layout !== 2) for (let k = 0; k < 3; k++) rr(28 + k * 120, ry, 104, 104, 16, mixHex(p.bg, p.b, 0.07));
  // label
  x.font = '600 20px -apple-system, Helvetica, Arial, sans-serif'; x.fillStyle = mixHex(p.bg, p.b, 0.55);
  x.fillText(p.title, 28, layout === 2 ? 476 : 470);
  return c;
}

export function Hero3D() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let disposed = false; let cleanup = () => {};
    (async () => {
      const THREE = await import('three');
      const el = ref.current; if (disposed || !el) return;
      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' }); }
      catch { el.classList.add('hero3d--fallback'); return; }
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      el.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      scene.fog = new THREE.Fog(0xf5f5f7, 9, el.clientWidth < 700 ? 20 : 17);
      const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
      const ring = new THREE.Group(); scene.add(ring);

      const mobile = () => el.clientWidth < 700;
      const count = mobile() ? 7 : 9;
      const R = mobile() ? 3.3 : 5.2;
      const geo = new THREE.PlaneGeometry(2.4, 3);
      const textures: InstanceType<typeof THREE.CanvasTexture>[] = [];
      const cards: InstanceType<typeof THREE.Mesh>[] = [];
      for (let i = 0; i < count; i++) {
        const tex = new THREE.CanvasTexture(drawPage(PALETTES[i % PALETTES.length], i));
        tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; textures.push(tex);
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }));
        const a = (i / count) * Math.PI * 2;
        m.position.set(Math.sin(a) * R, 0, Math.cos(a) * R);
        m.rotation.y = a;
        m.userData.phase = i * 0.9;
        ring.add(m); cards.push(m);
      }
      // soft floor shadow
      const sc = document.createElement('canvas'); sc.width = sc.height = 128;
      const sx = sc.getContext('2d')!; const g = sx.createRadialGradient(64, 64, 4, 64, 64, 64);
      g.addColorStop(0, 'rgba(0,0,0,.22)'); g.addColorStop(1, 'rgba(0,0,0,0)'); sx.fillStyle = g; sx.fillRect(0, 0, 128, 128);
      const shadowTex = new THREE.CanvasTexture(sc);
      const shadow = new THREE.Mesh(new THREE.PlaneGeometry(R * 2.6, R * 1.3), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
      shadow.rotation.x = -Math.PI / 2; shadow.position.y = -1.75; scene.add(shadow);

      const resize = () => {
        const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h, false);
        camera.aspect = w / h; camera.position.set(0, mobile() ? 1.0 : 1.1, mobile() ? R + 9.6 : R + 6.8); camera.lookAt(0, -0.15, 0); camera.updateProjectionMatrix();
      };
      resize();
      const ro = new ResizeObserver(resize); ro.observe(el);

      // interaction: drag/swipe to spin, pointer tilt, scroll nudge
      let spin = 0, vel = reduce ? 0 : 0.0025, tiltX = 0, tiltY = 0, dragging = false, lastX = 0, scrollV = 0, lastScroll = scrollY;
      const onDown = (e: PointerEvent) => { dragging = true; lastX = e.clientX; el.setPointerCapture(e.pointerId); el.classList.add('is-drag'); };
      const onMove = (e: PointerEvent) => {
        const r = el.getBoundingClientRect(); tiltX = ((e.clientY - r.top) / r.height - 0.5) * 0.12; tiltY = ((e.clientX - r.left) / r.width - 0.5) * 0.25;
        if (dragging) { const dx = e.clientX - lastX; lastX = e.clientX; spin += dx * 0.006; vel = dx * 0.0009; }
      };
      const onUp = () => { dragging = false; el.classList.remove('is-drag'); };
      const onScroll = () => { scrollV += (scrollY - lastScroll) * 0.0006; lastScroll = scrollY; };
      el.addEventListener('pointerdown', onDown); el.addEventListener('pointermove', onMove); el.addEventListener('pointerup', onUp); el.addEventListener('pointercancel', onUp);
      addEventListener('scroll', onScroll, { passive: true });

      let visible = true; const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }); io.observe(el);
      let raf = 0; const clock = new THREE.Clock();
      const tick = () => {
        raf = requestAnimationFrame(tick);
        if (!visible) return;
        const t = clock.getElapsedTime();
        if (!dragging) { vel += ((reduce ? 0 : 0.0025) - vel) * 0.02; spin += vel + scrollV; scrollV *= 0.9; }
        ring.rotation.y = spin + tiltY;
        ring.rotation.x += (tiltX - ring.rotation.x) * 0.06;
        if (!reduce) for (const c of cards) c.position.y = Math.sin(t * 0.8 + c.userData.phase) * 0.12;
        renderer.render(scene, camera);
      };
      tick();
      el.classList.add('is-ready');
      cleanup = () => {
        cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); removeEventListener('scroll', onScroll);
        geo.dispose(); textures.forEach((t) => t.dispose()); shadowTex.dispose();
        cards.forEach((c) => (c.material as any).dispose()); renderer.dispose(); renderer.domElement.remove();
      };
    })();
    return () => { disposed = true; cleanup(); };
  }, []);
  return (
    <div className="hero3d" ref={ref} role="img" aria-label="Rotating ring of example landing page designs">
      <span className="hero3d__hint">Drag to explore</span>
    </div>
  );
}
