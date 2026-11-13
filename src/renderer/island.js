/* Île procédurale dessinée comme une carte en blocs.
   La marée (0 = île engloutie, 1 = île entière) sert de barre de chargement. */
(function () {
  const SEA = 0.40;

  const rgb = (hex) => {
    const v = parseInt(hex.slice(1), 16);
    return [v >> 16, (v >> 8) & 255, v & 255];
  };
  const pack = (r, g, b) => (255 << 24) | (Math.min(255, b) << 16) | (Math.min(255, g) << 8) | Math.min(255, r);
  const tint = (c, k) => pack(Math.round(c[0] * k), Math.round(c[1] * k), Math.round(c[2] * k));

  const COLORS = {
    sand: rgb("#ecd8a3"), grass: rgb("#7fb342"), meadow: rgb("#5f9a38"), forest: rgb("#3a7a35"),
    jungle: rgb("#27602f"), rock: rgb("#5f6f5c"), peak: rgb("#a3ae98"), scar: rgb("#6e5237"),
    hull: rgb("#eef3ea"), stripe: rgb("#3f7fbf"),
  };
  const WATER = [rgb("#57c0aa"), rgb("#2f9b90"), rgb("#1c7778"), rgb("#135a60"), rgb("#0e4148")];
  const FOAM = pack(240, 248, 232);
  const SPARK = pack(150, 220, 205);

  function hash(x, y, seed) {
    let h = (x * 374761393 + y * 668265263 + seed * 1274126177) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }
  function vnoise(x, y, seed) {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = hash(xi, yi, seed), b = hash(xi + 1, yi, seed), c = hash(xi, yi + 1, seed), d = hash(xi + 1, yi + 1, seed);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, seed) {
    let sum = 0, amp = 0.5, f = 1;
    for (let o = 0; o < 5; o++) { sum += amp * vnoise(x * f, y * f, seed + o); amp *= 0.5; f *= 2.03; }
    return sum / 0.97;
  }

  window.Island = function (canvas, options) {
    const opts = Object.assign({ cell: 4, seed: 41, cx: 0.5, cy: 0.5, radius: 0.42 }, options);
    let W = 0, H = 0, ctx, image, pixels, height, land, spark, wreck = null;

    function build(cssW, cssH, centerY) {
      if (centerY) opts.cy = centerY;
      W = Math.max(40, Math.round(cssW / opts.cell));
      H = Math.max(40, Math.round(cssH / opts.cell));
      canvas.width = W; canvas.height = H;
      ctx = canvas.getContext("2d");
      image = ctx.createImageData(W, H);
      pixels = new Uint32Array(image.data.buffer);
      height = new Float32Array(W * H);
      land = new Int32Array(W * H);
      spark = new Float32Array(W * H);

      const R = Math.min(W, H) * opts.radius * (W > H ? 1.18 : 1), cx = W * opts.cx, cy = H * opts.cy;
      for (let y = 0, i = 0; y < H; y++) {
        for (let x = 0; x < W; x++, i++) {
          const dx = (x - cx) / (R * 1.28), dy = (y - cy) / R;
          const d = Math.hypot(dx, dy);
          const n = fbm(x / 46 + 3, y / 46 + 9, opts.seed);
          const e = Math.hypot((x - cx - R * 1.32) / (R * 0.28), (y - cy + R * 0.62) / (R * 0.22));
          const islet = Math.max(0, 1 - e) * 0.62;
          height[i] = Math.max(0, Math.max(1 - Math.pow(d, 1.7) * 0.82 - 0.17, islet) + (n - 0.5) * 0.74);
          spark[i] = hash(x, y, 7);
        }
      }
      for (let y = 0, i = 0; y < H; y++) {
        for (let x = 0; x < W; x++, i++) {
          const h = height[i], rel = (h - SEA) / (1 - SEA);
          const grain = hash(x, y, 3), tree = fbm(x / 7, y / 7, 77);
          let c = COLORS.jungle;
          if (rel < 0.05) c = COLORS.sand;
          else if (rel < 0.16) c = COLORS.grass;
          else if (rel < 0.3) c = tree > 0.56 ? COLORS.forest : COLORS.meadow;
          else if (rel < 0.56) c = tree > 0.46 ? COLORS.jungle : COLORS.forest;
          else if (rel < 0.72) c = tree > 0.6 ? COLORS.forest : COLORS.jungle;
          else if (rel < 0.93) c = tree > 0.5 ? COLORS.rock : COLORS.jungle;
          else c = COLORS.peak;
          // Ombrage en diagonale et grain, comme une carte du jeu.
          const prev = x && y ? height[i - W - 1] : h;
          const slope = h - prev;
          let k = 1 + Math.max(-0.2, Math.min(0.2, slope * 9)) + (grain - 0.5) * 0.1;
          if (rel >= 0.16 && rel < 0.72 && grain > 0.86) k *= 0.82;
          land[i] = tint(c, k);
        }
      }
      placeWreck(cx, cy, R);
    }

    /* Le crash : une entaille brune et l'avion, sur un replat proche du centre. */
    function placeWreck(cx, cy, R) {
      let best = null;
      for (let y = Math.round(cy - R * 0.2); y < cy + R * 0.42; y++) {
        for (let x = Math.round(cx - R * 0.5); x < cx + R * 0.1; x++) {
          const i = y * W + x;
          if (i < 0 || i >= height.length) continue;
          const rel = (height[i] - SEA) / (1 - SEA);
          if (rel > 0.12 && rel < 0.3) {
            const score = Math.abs(x - (cx - R * 0.15)) + Math.abs(y - (cy + R * 0.1));
            if (!best || score < best.score) best = { x, y, score };
          }
        }
      }
      wreck = best;
      if (!wreck) return;
      const put = (x, y, c, k) => {
        const i = y * W + x;
        if (x >= 0 && x < W && i >= 0 && i < land.length && height[i] > SEA) land[i] = tint(c, k || 1);
      };
      for (let s = -11; s < 12; s++) {
        for (let t = -2; t <= 2; t++) {
          if (hash(s, t, 9) < 0.78) put(wreck.x + s, wreck.y + Math.round(s * 0.45) + t, COLORS.scar, 0.85 + hash(s, t, 5) * 0.3);
        }
      }
      for (let s = -5; s < 7; s++) {
        put(wreck.x + s, wreck.y + Math.round(s * 0.45), s % 3 ? COLORS.hull : COLORS.stripe);
        put(wreck.x + s, wreck.y + Math.round(s * 0.45) - 1, COLORS.hull, 0.86);
      }
      for (let s = 1; s < 5; s++) put(wreck.x + 1 - s, wreck.y + s + 1, COLORS.hull, 0.92);
      for (let s = 1; s < 4; s++) put(wreck.x + 2 + s, wreck.y - s - 1, COLORS.hull, 0.92);
    }

    function draw(tide, time) {
      const level = 1.08 + (SEA - 1.08) * tide;
      const n = W * H, wave = Math.sin(time * 1.1) * 0.0035;
      const foamEdge = 0.012 + wave;
      for (let i = 0; i < n; i++) {
        const d = level - height[i];
        if (d <= 0) { pixels[i] = land[i]; continue; }
        if (d < foamEdge) { pixels[i] = FOAM; continue; }
        const s = spark[i];
        const glint = (s + time * 0.11) % 1;
        if (d > 0.03 && d < 0.2 && glint < 0.0035) { pixels[i] = SPARK; continue; }
        const b = d + (s - 0.5) * 0.012;
        const c = b < 0.04 ? WATER[0] : b < 0.1 ? WATER[1] : b < 0.2 ? WATER[2] : b < 0.34 ? WATER[3] : WATER[4];
        const k = 1 + (s - 0.5) * 0.06;
        pixels[i] = tint(c, k);
      }
      // Fumée du crash, seulement quand l'épave est découverte.
      if (wreck && height[wreck.y * W + wreck.x] > level) {
        for (let k = 0; k < 9; k++) {
          const age = (time * 0.42 + k / 9) % 1;
          const x = wreck.x + 1 + Math.round(age * 7 + Math.sin(age * 9 + k) * 1.4);
          const y = wreck.y - 2 - Math.round(age * 22);
          const i = y * W + x;
          if (i >= 0 && i < n) {
            const shade = Math.round(210 - age * 50);
            pixels[i] = pack(shade, shade, shade - 6);
          }
        }
      }
      ctx.putImageData(image, 0, 0);
    }

    return { build, draw };
  };
})();
