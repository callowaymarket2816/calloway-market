// @ts-nocheck
/* Scroll story for the customer homepage: a pinned, full-screen stage where 3D cans, bottles and snacks turn,
   split apart and fly around as you scroll, over color washes that change with each part. Ported from the
   approved homepage design. three.js is loaded on demand so it never slows the rest of the site. */

export function runStory(story: any): () => void {
  let disposed = false;
  const stage = story.querySelector('.story-stage');
  const canvas = story.querySelector('.story-canvas');
  const blobs = [...story.querySelectorAll('.blob')];
  const rings = story.querySelector('.story-rings');
  const chapters = [...story.querySelectorAll('.chapter')];
  const callouts = [...story.querySelectorAll('.callout')];
  const dots = [...story.querySelectorAll('.story-dots button')];
  const cue = story.querySelector('.scroll-cue');
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const N = chapters.length - 1;

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  // Rests at each stop, movement in between
  const hold = f => { const t = clamp((f - 0.1) / 0.8); return t * t * t * (t * (t * 6 - 15) + 10); };
  const hex = h => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const rgb = c => `rgb(${Math.round(c[0])} ${Math.round(c[1])} ${Math.round(c[2])})`;
  const mixC = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));

  // Light, colorful washes for each part: background top-left, bottom-right, then the three blobs
  const PALETTE = [
    ['#fff6da', '#ffe6f0', '#ffc94d', '#ff8fb8', '#8fd3ff'],
    ['#e3f6ff', '#e6fff3', '#7fd6ff', '#ff9ec6', '#6ee7b7'],
    ['#fff0e3', '#f6e6ff', '#ffb86b', '#f78fb3', '#b79cff'],
    ['#fff8d6', '#ffe9da', '#ffd43b', '#ff9f43', '#7c9cff']
  ].map(row => row.map(hex));
  const BLOBS = [
    [[0.8, 0.2], [0.1, 0.86], [0.6, 0.8]],
    [[0.86, 0.78], [0.16, 0.18], [0.52, 0.32]],
    [[0.18, 0.8], [0.84, 0.16], [0.62, 0.66]],
    [[0.74, 0.18], [0.22, 0.72], [0.9, 0.88]]
  ];

  let target = 0, shown = 0, lastX = -1, W = 0, H = 0, layoutDirty = true;
  const anchor = { x: 0.7, y: 0.5 };
  let three = null;

  function measure() {
    const total = story.offsetHeight - stage.offsetHeight;
    const stick = parseFloat(getComputedStyle(stage).top) || 0;
    target = total > 0 ? clamp((stick - story.getBoundingClientRect().top) / total) : 0;
  }

  function paintUI(x) {
    chapters.forEach((ch, i) => {
      const d = x - i;
      const vis = clamp((0.42 - Math.abs(d)) / 0.22);
      ch.style.opacity = vis.toFixed(3);
      ch.style.transform = `translate3d(0, ${(-d * 64).toFixed(1)}px, 0)`;
      ch.style.visibility = vis < 0.01 ? 'hidden' : 'visible';
    });
    const i = Math.min(N - 1, Math.floor(x)), f = hold(x - i);
    const a = PALETTE[i], b = PALETTE[i + 1];
    stage.style.setProperty('--sb1', rgb(mixC(a[0], b[0], f)));
    stage.style.setProperty('--sb2', rgb(mixC(a[1], b[1], f)));
    blobs.forEach((el, k) => {
      el.style.setProperty('--c', rgb(mixC(a[2 + k], b[2 + k], f)));
      const p = BLOBS[i][k], q = BLOBS[i + 1][k];
      el.style.translate = `${(lerp(p[0], q[0], f) * W).toFixed(0)}px ${(lerp(p[1], q[1], f) * H).toFixed(0)}px`;
    });
    // Rings spread out from the products like sound waves, strongest between parts
    const frac = x - Math.floor(x);
    rings.style.translate = `${(anchor.x * W).toFixed(0)}px ${(anchor.y * H).toFixed(0)}px`;
    rings.style.scale = (0.72 + x * 0.2 + frac * 0.22).toFixed(3);
    rings.style.opacity = (0.4 + 0.45 * Math.sin(Math.PI * frac)).toFixed(3);
    const cur = Math.round(x);
    dots.forEach((d, k) => d.setAttribute('aria-current', String(k === cur)));
    if (cue) cue.style.opacity = clamp(1 - x * 5).toFixed(2);
  }

  /* ---------- Loop: runs only while the story is on screen ---------- */
  let raf = 0, last = 0, t = 0, active = false;
  function frame(now) {
    raf = 0;
    if (disposed) return;
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000)); last = now;
    if (!still) t += dt;
    measure();
    shown = still ? target : shown + (target - shown) * (1 - Math.exp(-dt * 7.5));
    if (Math.abs(target - shown) < 0.0003) shown = target;
    const x = shown * N;
    if (layoutDirty) {
      W = stage.clientWidth; H = stage.clientHeight;
      if (three) three.layout();
      layoutDirty = false; lastX = -1;
    }
    if (Math.abs(x - lastX) > 0.0004) { paintUI(x); lastX = x; }
    if (three) three.render(still ? 1 : x, t, x);
    if (active && !document.hidden && !still) raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  const io = new IntersectionObserver(([e]) => { active = e.isIntersecting; if (active) kick(); }, { rootMargin: '160px 0px' });
  io.observe(story);
  const onResize = () => { layoutDirty = true; kick(); };
  const onVis = () => { if (!document.hidden) kick(); };
  window.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', onVis);
  const dotHandlers = dots.map((d, k) => {
    const h = () => {
      const top = story.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: top + (story.offsetHeight - stage.offsetHeight) * (k / N), behavior: 'smooth' });
    };
    d.addEventListener('click', h);
    return h;
  });
  kick();

  /* ---------- 3D ---------- */
  (async () => {
    try {
      const THREE = await import('three');
      const { RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js');
      const { RoundedBoxGeometry } = await import('three/addons/geometries/RoundedBoxGeometry.js');
      try { await Promise.race([document.fonts.load('800 100px Archivo'), new Promise(r => setTimeout(r, 1500))]); } catch (e) { /* draw with fallback fonts */ }
      if (disposed) return;
      three = buildScene(THREE, RoomEnvironment, RoundedBoxGeometry);
      layoutDirty = true;
      story.classList.add('has-3d');
      kick();
    } catch (err) {
      console.warn('3D story is off:', err && err.message);
      story.classList.remove('is-live');
      story.classList.add('no-3d');
      layoutDirty = true;
      kick();
    }
  })();

  function buildScene(THREE, RoomEnvironment, RoundedBoxGeometry) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    camera.position.set(0, 0, 16);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xffe4c8, 0.75));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.45); keyLight.position.set(5, 7, 9); scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0xffeef6, 0.9); rimLight.position.set(-7, 3, -5); scene.add(rimLight);
    const group = new THREE.Group(); scene.add(group);
    const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

    /* Artwork, drawn on canvases */
    let seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const FONT = 'Archivo, "Archivo Variable", "Arial Black", Arial, sans-serif';
    function tex(w, h, draw) {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      draw(c.getContext('2d'), w, h);
      const tx = new THREE.CanvasTexture(c);
      tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = aniso;
      return tx;
    }
    function word(g, text, x, y, maxW, size, fill, o = {}) {
      g.save();
      const set = s => { g.font = `800 ${s}px ${FONT}`; if ('fontStretch' in g) g.fontStretch = o.stretch || 'condensed'; };
      set(size);
      const m = g.measureText(text).width;
      if (m > maxW) { size = Math.floor(size * maxW / m); set(size); }
      g.textAlign = 'center'; g.textBaseline = 'middle';
      if (o.rotate) { g.translate(x, y); g.rotate(o.rotate); x = 0; y = 0; }
      if (o.shadow) { g.fillStyle = o.shadow; g.fillText(text, x + size * 0.03, y + size * 0.05); }
      if (o.stroke) { g.lineJoin = 'round'; g.lineWidth = o.strokeW || size * 0.09; g.strokeStyle = o.stroke; g.strokeText(text, x, y); }
      g.fillStyle = fill; g.fillText(text, x, y);
      g.restore();
    }
    const dotsMotif = (g, w, h, n, rMin, rMax, color) => {
      for (let i = 0; i < n; i++) { g.fillStyle = color; g.beginPath(); g.arc(rnd() * w, rnd() * h, rMin + rnd() * (rMax - rMin), 0, Math.PI * 2); g.fill(); }
    };
    function canArt(o) {
      return tex(1024, 452, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, o.c1); gr.addColorStop(1, o.c2);
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        o.motif(g, w, h);
        for (const cx of [w * 0.25, w * 0.75]) word(g, o.word, cx, h * 0.5, 330, 190, o.ink, { shadow: 'rgba(16, 24, 40, 0.2)', stroke: o.stroke });
        g.fillStyle = o.band; g.fillRect(0, 0, w, 16); g.fillRect(0, h - 16, w, 16);
      });
    }
    const waves = color => (g, w, h) => {
      g.strokeStyle = color; g.lineWidth = 22; g.lineCap = 'round';
      for (const y0 of [h * 0.2, h * 0.82]) {
        g.beginPath();
        for (let x = 0; x <= w; x += 8) { const y = y0 + Math.sin(x / w * Math.PI * 8) * 14; x ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.stroke();
      }
    };
    const beerArt = canArt({ c1: '#ffc83d', c2: '#ff8a00', ink: '#ffffff', stroke: '#e4002b', band: '#e4002b', word: 'BEER', motif: (g, w, h) => { waves('rgba(255, 255, 255, 0.75)')(g, w, h); dotsMotif(g, w, h, 26, 3, 7, 'rgba(255, 255, 255, 0.55)'); } });
    const seltzerArt = canArt({ c1: '#ff9cc5', c2: '#ff4f8b', ink: '#ffffff', stroke: '#c2185b', band: '#ffffff', word: 'SELTZER', motif: (g, w, h) => dotsMotif(g, w, h, 70, 4, 18, 'rgba(255, 255, 255, 0.35)') });
    const teaArt = canArt({ c1: '#5ff0e0', c2: '#0ea5a4', ink: '#ffffff', stroke: '#0b6e6d', band: '#ffd43b', word: 'HARD TEA', motif: (g, w, h) => {
      for (let i = 0; i < 9; i++) {
        const x = rnd() * w, y = rnd() * h, r = 16 + rnd() * 14;
        g.fillStyle = '#fff27a'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(255, 255, 255, 0.9)'; g.lineWidth = 2;
        for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); g.stroke(); }
      }
    } });
    const energyArt = canArt({ c1: '#7b6cff', c2: '#2e3bff', ink: '#c6ff3d', stroke: '#1a1f8f', band: '#c6ff3d', word: 'ENERGY', motif: (g, w, h) => {
      g.fillStyle = 'rgba(198, 255, 61, 0.35)';
      for (const cx of [w * 0.25, w * 0.75]) {
        g.beginPath(); g.moveTo(cx + 40, 20); g.lineTo(cx - 60, h * 0.55); g.lineTo(cx + 5, h * 0.55); g.lineTo(cx - 40, h - 20); g.lineTo(cx + 70, h * 0.42); g.lineTo(cx + 5, h * 0.42); g.closePath(); g.fill();
      }
    } });
    function labelArt(o) {
      return tex(768, 512, (g, w, h) => {
        g.fillStyle = o.bg; g.fillRect(0, 0, w, h);
        g.strokeStyle = o.line; g.lineWidth = 8; g.strokeRect(22, 22, w - 44, h - 44);
        g.lineWidth = 2; g.strokeRect(38, 38, w - 76, h - 76);
        o.motif && o.motif(g, w, h);
        word(g, o.word, w / 2, h * 0.5, w * 0.62, 200, o.ink, { stretch: 'semi-condensed' });
      });
    }
    const whiskeyArt = labelArt({ bg: '#fff3dc', line: '#e4002b', ink: '#101828', word: 'WHISKEY', motif: (g, w, h) => {
      g.fillStyle = '#e4002b';
      for (const y of [h * 0.24, h * 0.76]) { g.beginPath(); g.moveTo(w / 2, y - 12); g.lineTo(w / 2 + 12, y); g.lineTo(w / 2, y + 12); g.lineTo(w / 2 - 12, y); g.closePath(); g.fill(); g.fillRect(w * 0.3, y - 1.5, w * 0.14, 3); g.fillRect(w * 0.56, y - 1.5, w * 0.14, 3); }
    } });
    const wineArt = labelArt({ bg: '#ffffff', line: '#ff4f8b', ink: '#9b2242', word: 'WINE', motif: (g, w, h) => {
      const gx = w / 2, gy = h * 0.2;
      g.fillStyle = '#ff4f8b';
      [[0, 0], [-14, -14], [14, -14], [-28, -28], [0, -28], [28, -28]].forEach(([dx, dy]) => { g.beginPath(); g.arc(gx + dx, gy - dy - 10, 10, 0, Math.PI * 2); g.fill(); });
      g.fillRect(w * 0.32, h * 0.78, w * 0.36, 4);
    } });
    const chipsFront = tex(768, 976, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffde59'); gr.addColorStop(1, '#ff8a00');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255, 255, 255, 0.18)';
      for (let x = -h; x < w; x += 46) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 20, 0); g.lineTo(x + 20 + h, h); g.lineTo(x + h, h); g.closePath(); g.fill(); }
      for (const y of [0, h - h * 0.08]) { g.fillStyle = '#e4002b'; g.fillRect(0, y, w, h * 0.08); g.fillStyle = 'rgba(255, 255, 255, 0.4)'; for (let x = 6; x < w; x += 18) g.fillRect(x, y, 6, h * 0.08); }
      g.save(); g.translate(w / 2, h * 0.44); g.rotate(-0.08);
      g.fillStyle = '#e4002b'; g.beginPath(); g.roundRect(-w * 0.44, -h * 0.13, w * 0.88, h * 0.26, 34); g.fill();
      g.restore();
      word(g, 'CHIPS', w / 2, h * 0.44, w * 0.74, 230, '#ffffff', { rotate: -0.08, shadow: 'rgba(16, 24, 40, 0.25)' });
      g.fillStyle = '#ffffff'; g.beginPath(); g.roundRect(w / 2 - 110, h * 0.2 - 30, 220, 60, 30); g.fill();
      word(g, 'SALTED', w / 2, h * 0.2, 180, 40, '#101828', { stretch: 'expanded' });
      [[w * 0.3, h * 0.72, -0.4], [w * 0.55, h * 0.74, 0.3], [w * 0.74, h * 0.7, -0.15]].forEach(([x, y, r]) => {
        g.save(); g.translate(x, y); g.rotate(r);
        g.fillStyle = '#ffd36b'; g.beginPath(); g.ellipse(0, 0, 92, 62, 0, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#e39a2d'; g.lineWidth = 6; g.stroke();
        g.strokeStyle = 'rgba(227, 154, 45, 0.6)'; g.lineWidth = 3;
        for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(-70, k * 18); g.quadraticCurveTo(0, k * 18 - 12, 70, k * 18); g.stroke(); }
        g.restore();
      });
    });
    const chipsBack = tex(512, 650, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffd43b'); gr.addColorStop(1, '#ff9f1c');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      dotsMotif(g, w, h, 40, 6, 14, 'rgba(255, 255, 255, 0.35)');
      for (const y of [0, h - h * 0.08]) { g.fillStyle = '#e4002b'; g.fillRect(0, y, w, h * 0.08); }
    });
    const limeArt = tex(256, 256, (g, w, h) => {
      const c = w / 2;
      const disc = (r, col) => { g.fillStyle = col; g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.fill(); };
      disc(128, '#3e9b2b'); disc(118, '#a6e05a'); disc(110, '#f4ffe2');
      for (let i = 0; i < 10; i++) {
        const a0 = i / 10 * Math.PI * 2 + 0.06, a1 = (i + 1) / 10 * Math.PI * 2 - 0.06;
        g.fillStyle = '#c4ef6f'; g.beginPath(); g.moveTo(c + Math.cos((a0 + a1) / 2) * 12, c + Math.sin((a0 + a1) / 2) * 12); g.arc(c, c, 102, a0, a1); g.closePath(); g.fill();
      }
      disc(9, '#f4ffe2');
    });

    /* Shapes */
    const v2 = pts => pts.map(([x, y]) => new THREE.Vector2(x, y));
    const metal = new THREE.MeshStandardMaterial({ color: 0xe4e8ee, metalness: 1, roughness: 0.24, side: THREE.DoubleSide });
    const canBody = new THREE.CylinderGeometry(1, 1, 2.76, 72, 1, true);
    const canTop = new THREE.LatheGeometry(v2([[1, 0], [0.995, 0.07], [0.95, 0.22], [0.87, 0.34], [0.86, 0.4], [0.84, 0.44], [0.8, 0.43], [0.78, 0.37], [0, 0.37]]), 72);
    const canBottom = new THREE.LatheGeometry(v2([[0, -0.24], [0.5, -0.3], [0.66, -0.34], [0.8, -0.3], [0.93, -0.18], [0.99, -0.06], [1, 0]]), 72);
    const tabGeo = new THREE.TorusGeometry(0.17, 0.045, 10, 28);
    function makeCan(art) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(canBody, new THREE.MeshPhysicalMaterial({ map: art, metalness: 0.3, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.12 }));
      body.rotation.y = -Math.PI / 2;
      const top = new THREE.Mesh(canTop, metal); top.position.y = 1.38;
      const bottom = new THREE.Mesh(canBottom, metal); bottom.position.y = -1.38;
      const tab = new THREE.Mesh(tabGeo, metal); tab.rotation.x = Math.PI / 2; tab.scale.set(1.25, 1, 1); tab.position.set(0, 1.77, 0.3);
      g.add(body, top, bottom, tab);
      return g;
    }
    function makeBottle(o) {
      const g = new THREE.Group();
      const liquid = new THREE.Mesh(new THREE.LatheGeometry(v2(o.liquid), 64), new THREE.MeshPhysicalMaterial({ color: o.liquidColor, roughness: 0.16, clearcoat: 0.7, emissive: o.liquidColor, emissiveIntensity: 0.14 }));
      const label = new THREE.Mesh(new THREE.CylinderGeometry(o.labelR, o.labelR, o.labelH, 64, 1, true, -o.labelArc / 2, o.labelArc), new THREE.MeshPhysicalMaterial({ map: o.art, roughness: 0.5, clearcoat: 0.3, side: THREE.DoubleSide }));
      label.position.y = o.labelY;
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(o.capR, o.capR, o.capH, 40), new THREE.MeshStandardMaterial({ color: o.capColor, metalness: o.capMetal, roughness: 0.28 }));
      cap.position.y = o.capY;
      const glass = new THREE.Mesh(new THREE.LatheGeometry(v2(o.profile), 64), new THREE.MeshPhysicalMaterial({ color: o.glass, roughness: 0.04, transparent: true, opacity: 0.22, clearcoat: 1, clearcoatRoughness: 0.03, depthWrite: false, side: THREE.DoubleSide }));
      glass.renderOrder = 3;
      g.add(liquid, label, cap, glass);
      return g;
    }
    function makeBag() {
      const BW = 2.6, BH = 3.3, geo = new THREE.PlaneGeometry(BW, BH, 48, 56);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), nx = x / (BW / 2), e = Math.abs(y / (BH / 2));
        let z = 0.62 * Math.pow(Math.max(0, 1 - nx * nx), 0.5) * Math.pow(Math.max(0, 1 - Math.pow(e / 0.9, 6)), 0.6);
        if (e > 0.9) z = 0.012 * Math.sin(x * 30);
        p.setXYZ(i, x * (1 - 0.06 * z), y, z);
      }
      geo.computeVertexNormals();
      const mat = map => new THREE.MeshPhysicalMaterial({ map, metalness: 0.45, roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.15 });
      const g = new THREE.Group();
      const back = new THREE.Mesh(geo, mat(chipsBack)); back.rotation.y = Math.PI;
      g.add(new THREE.Mesh(geo, mat(chipsFront)), back);
      return g;
    }

    const objs = {
      beer: makeCan(beerArt),
      seltzer: makeCan(seltzerArt),
      tea: makeCan(teaArt),
      energy: makeCan(energyArt),
      whiskey: makeBottle({
        profile: [[0, -2.3], [0.96, -2.3], [1.06, -2.22], [1.1, -2.02], [1.1, 0.75], [1.02, 1.08], [0.78, 1.38], [0.45, 1.62], [0.37, 1.78], [0.37, 2.28], [0.42, 2.32], [0.42, 2.4]],
        liquid: [[0, -2.22], [1, -2.22], [1.03, -2.1], [1.03, 0.62], [0, 0.62]],
        liquidColor: 0xc8661a, glass: 0xfff7ec, art: whiskeyArt, labelR: 1.115, labelH: 1.55, labelArc: 2.3, labelY: -0.55,
        capR: 0.46, capH: 0.5, capY: 2.6, capColor: 0xd9a441, capMetal: 1
      }),
      wine: makeBottle({
        profile: [[0, -2.45], [0.84, -2.45], [0.92, -2.36], [0.94, -2.15], [0.94, 0.45], [0.88, 0.92], [0.6, 1.42], [0.36, 1.76], [0.33, 2.55], [0.37, 2.6], [0.37, 2.7]],
        liquid: [[0, -2.36], [0.86, -2.36], [0.88, -2.2], [0.88, 0.55], [0, 0.55]],
        liquidColor: 0xff4f86, glass: 0xfff2f6, art: wineArt, labelR: 0.955, labelH: 1.4, labelArc: 2.2, labelY: -0.75,
        capR: 0.375, capH: 0.75, capY: 2.4, capColor: 0x9b2242, capMetal: 0.6
      }),
      chips: makeBag()
    };
    Object.values(objs).forEach(o => group.add(o));

    const candyGeo = new THREE.SphereGeometry(0.3, 32, 20);
    const candies = ['#ff4f8b', '#ffc93c', '#2dd4bf', '#7c5cff', '#ff8a00', '#22c55e', '#ff6b6b', '#4dabff', '#f472b6', '#facc15', '#a3e635', '#38bdf8']
      .map(c => new THREE.Mesh(candyGeo, new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08 })));
    const iceMat = new THREE.MeshPhysicalMaterial({ color: 0xe6f6ff, roughness: 0.04, transparent: true, opacity: 0.5, clearcoat: 1, depthWrite: false });
    const iceGeo = new RoundedBoxGeometry(0.78, 0.78, 0.78, 4, 0.16);
    const ice = [0, 1, 2, 3].map(() => { const m = new THREE.Mesh(iceGeo, iceMat); m.renderOrder = 2; return m; });
    const limeMats = [new THREE.MeshStandardMaterial({ color: 0x4caf2a, roughness: 0.45 }), new THREE.MeshPhysicalMaterial({ map: limeArt, roughness: 0.35, clearcoat: 0.6 }), new THREE.MeshPhysicalMaterial({ map: limeArt, roughness: 0.35, clearcoat: 0.6 })];
    const limeGeo = new THREE.CylinderGeometry(0.66, 0.66, 0.16, 48);
    const limes = [0, 1, 2].map(() => new THREE.Mesh(limeGeo, limeMats));
    [...candies, ...ice, ...limes].forEach(m => group.add(m));

    /* Where everything sits at each part of the story: x, y, z, rotation x, y, z, size */
    const K = {
      beer:    [[0, 0, 0.6, 0.16, -0.45, 0.1, 1.12], [-2.15, 0.05, 0.2, 0.06, 0.55, -0.14, 0.98], [-5.2, 4.4, -3, 0.9, 2, 0.7, 0.7], [-8.5, 7, -6, 1.2, 3, 1, 0.5]],
      seltzer: [[0.7, -0.1, -2.6, 0.1, -0.2, 0.06, 0.9], [0, 0.5, -0.7, 0.04, -0.15, 0.03, 1], [4.6, 4.8, -3.6, -0.7, -2.1, -0.5, 0.7], [8.5, 7.5, -6, -1, -3, -0.8, 0.5]],
      tea:     [[-0.7, -0.2, -3.4, 0.1, 0.3, -0.06, 0.86], [2.15, -0.1, 0.2, 0.1, -0.9, 0.16, 0.98], [5.4, -4.6, -2.6, 0.6, -2.4, 0.9, 0.7], [8.5, -7, -5, 1, -3, 1, 0.5]],
      whiskey: [[-1.2, -10.5, -1, 0, -2.8, 0.25, 1], [-1.4, -9.5, -0.6, 0, -2.6, 0.18, 1], [-1.15, -0.15, 0.4, 0.06, 0.32, -0.05, 1.04], [-5.2, 14, -4.5, 0.6, 2.4, 0.8, 0.6]],
      wine:    [[1.6, -11, -2, 0, 2.6, -0.2, 1], [1.8, -10, -1.6, 0, 2.4, -0.12, 1], [1.35, 0.1, -0.7, -0.05, -0.3, 0.07, 1], [7.2, 14, -5, -0.5, -2.4, -0.6, 0.6]],
      chips:   [[15, -2.5, -2, 0.4, -4.2, 0.8, 1.1], [15, -1.5, -2, 0.3, -4, 0.6, 1.1], [14, -0.5, -1.5, 0.2, -3.9, 0.4, 1.1], [0.55, -0.05, 0.5, 0.1, -0.22, -0.1, 1.12]],
      energy:  [[-15, -5, -2, 0.6, 1, 0.6, 0.9], [-15, -4, -2, 0.5, 0.8, 0.5, 0.9], [-14, -3, -2, 0.4, 0.6, 0.4, 0.9], [-2.2, -0.6, -0.9, 0.12, 0.6, 0.26, 0.88]]
    };
    const SPIN = { beer: 0.95, seltzer: 0.8, tea: 0.85, energy: 0.9, whiskey: 0, wine: 0, chips: 0 };   // cans also turn with the scroll; labels on both sides
    const TURNS = { beer: true, seltzer: true, tea: true, energy: true };   // cans keep turning; bottles and the bag sway
    const PH = { beer: 0, seltzer: 1.3, tea: 2.1, energy: 2.9, whiskey: 3.7, wine: 4.4, chips: 5.2 };
    const ICE = [
      [[-1.9, 1.5, 0.9, 0.85], [1.85, 1.25, 0.7, 0.8], [1.6, -1.6, 1.1, 0.9], [-1.75, -1.55, 0.5, 0.75]],
      [[-3.7, 2.1, 0.6, 0.85], [3.6, 2.0, 0.5, 0.8], [3.4, -2.2, 0.9, 0.9], [-3.4, -2.3, 0.7, 0.75]],
      [[-4.2, 6.2, -2, 0.6], [4.2, 6.6, -2, 0.6], [3.2, 7.2, -3, 0.6], [-3.2, 7.2, -3, 0.6]],
      [[-6, 13, -4, 0.4], [6, 13, -4, 0.4], [4, 14, -5, 0.4], [-4, 14, -5, 0.4]]
    ];
    const LIME = [
      [[-1.65, -0.7, 1.5, 1], [1.35, 1.95, 1, 0.9], [0.25, -2.35, 1.3, 0.95]],
      [[-3.1, 1.2, 1.1, 1], [1.1, 2.7, 0.7, 0.9], [0.4, -2.6, 1.3, 0.95]],
      [[-2.9, 1.7, 1.1, 1], [3, 1.3, 0.7, 0.9], [0.1, -2.5, 1.5, 0.95]],
      [[-5.5, -5.5, 0, 0.8], [5.5, -5.5, 0, 0.8], [0, -8.5, 0, 0.8]]
    ];
    const ANCHORS = { beer: [0, 1.95, 0], seltzer: [0, 1.95, 0], tea: [0, 1.95, 0], energy: [0, 1.95, 0], whiskey: [0, 2.9, 0], wine: [0, 3.0, 0], chips: [0, 1.8, 0] };
    const idle = still ? 0 : 1;
    const tmp = new THREE.Vector3();
    const pointer = { x: 0, y: 0, cx: 0, cy: 0 };
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches && !still) {
      stage.addEventListener('pointermove', e => { const r = stage.getBoundingClientRect(); pointer.x = (e.clientX - r.left) / r.width - 0.5; pointer.y = (e.clientY - r.top) / r.height - 0.5; }, { passive: true });
    }

    let spread = 1;
    function layout() {
      const w = Math.max(1, stage.clientWidth), h = Math.max(1, stage.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
      const vh = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), vw = vh * camera.aspect;
      let ax, ay, sc;
      if (camera.aspect > 1) { ax = vw * 0.2; ay = -vh * 0.02; sc = Math.min(vh / 9.2, vw / 16); }
      else { ax = 0; ay = -vh * 0.19; sc = Math.min(vw / 6.6, vh / 13.5); }
      spread = camera.aspect > 1 ? 1 : camera.aspect < 0.6 ? 0.72 : 0.85;
      group.position.set(ax, ay, 0); group.scale.setScalar(sc);
      anchor.x = 0.5 + ax / vw; anchor.y = 0.5 - ay / vh;
    }

    function render(x, time, uiX) {
      const i = Math.min(N - 1, Math.floor(x)), f = hold(x - i);
      for (const name in objs) {
        const o = objs[name], a = K[name][i], b = K[name][i + 1], ph = PH[name];
        const v = a.map((n, k) => lerp(n, b[k], f));
        o.position.set(v[0], v[1] + Math.sin(time * 0.9 + ph) * 0.1 * idle, v[2]);
        const turn = TURNS[name] ? time * 0.3 : Math.sin(time * 0.5 + ph) * 0.35;
        o.rotation.set(v[3] + Math.sin(time * 0.7 + ph) * 0.04 * idle, v[4] + x * SPIN[name] + turn * idle, v[5] + Math.cos(time * 0.6 + ph) * 0.03 * idle);
        o.scale.setScalar(v[6]);
        o.visible = Math.abs(v[0]) < 13 && Math.abs(v[1]) < 12;
        o.position.x *= spread;
      }
      ice.forEach((m, j) => {
        const a = ICE[i][j], b = ICE[i + 1][j];
        m.position.set(lerp(a[0], b[0], f) * spread, lerp(a[1], b[1], f) + Math.sin(time * 1.1 + j) * 0.12 * idle, lerp(a[2], b[2], f));
        m.rotation.set(time * 0.35 * idle + j + x * 0.8, time * 0.25 * idle + j * 2 + x * 0.6, j);
        m.scale.setScalar(lerp(a[3], b[3], f));
      });
      limes.forEach((m, j) => {
        const a = LIME[i][j], b = LIME[i + 1][j];
        m.position.set(lerp(a[0], b[0], f) * spread, lerp(a[1], b[1], f) + Math.cos(time * 0.9 + j) * 0.12 * idle, lerp(a[2], b[2], f));
        m.rotation.set(1.1 + Math.sin(time * 0.6 + j) * 0.25 * idle + x * 0.5, j * 1.7 + x * 0.9, 0.4 * j + time * 0.2 * idle);
        m.scale.setScalar(lerp(a[3], b[3], f));
      });
      // Candy bursts out of the chip bag and circles it in the last part
      const burst = clamp((x - 2.2) / 0.75), bt = burst * burst * (3 - 2 * burst);
      const c = objs.chips.position;
      candies.forEach((m, j) => {
        const ang = j / candies.length * Math.PI * 2 + time * 0.35 * idle + x * 0.9, R = 2.95 * bt;
        m.position.set(c.x + Math.cos(ang) * R * spread, c.y + Math.sin(ang) * R * 0.72, c.z + Math.sin(ang * 2 + j) * 0.8 * bt);
        m.scale.setScalar(0.15 + 0.85 * bt);
        m.visible = bt > 0.02;
      });
      pointer.cx += (pointer.x - pointer.cx) * 0.06; pointer.cy += (pointer.y - pointer.cy) * 0.06;
      camera.position.x = pointer.cx * 0.8; camera.position.y = -pointer.cy * 0.5; camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
      // Callout labels follow their product
      callouts.forEach(el => {
        const k = Number(el.dataset.ch), vis = clamp((0.42 - Math.abs(uiX - k)) / 0.22);
        if (vis < 0.01) { if (el.style.opacity !== '0') el.style.opacity = '0'; return; }
        const o = objs[el.dataset.obj];
        tmp.set(...ANCHORS[el.dataset.obj]); o.localToWorld(tmp); tmp.project(camera);
        el.style.transform = `translate3d(${((tmp.x + 1) / 2 * W).toFixed(1)}px, ${((1 - tmp.y) / 2 * H).toFixed(1)}px, 0)`;
        el.style.opacity = vis.toFixed(3);
      });
    }
    function dispose() { try { renderer.dispose(); renderer.forceContextLoss(); } catch (e) { /* already gone */ } }
    return { layout, render, dispose };
  }

  return () => {
    disposed = true;
    if (raf) cancelAnimationFrame(raf);
    io.disconnect();
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVis);
    dots.forEach((d, k) => d.removeEventListener('click', dotHandlers[k]));
    if (three) three.dispose();
  };
}
