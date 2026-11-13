/* Skin : un naufragé d'origine peint au format Minecraft, un aperçu 3D et une tête d'avatar.
   Fonctionne aussi avec un vrai fichier de skin 64 × 64 ou 64 × 32. */
(function () {
  const BOXES = {
    head: { u: 0, v: 0, w: 8, h: 8, d: 8, over: [32, 0], x: 0, y: -8 },
    body: { u: 16, v: 16, w: 8, h: 12, d: 4, over: [16, 32], x: 0, y: 0 },
    armR: { u: 40, v: 16, w: 4, h: 12, d: 4, over: [40, 32], x: -6, y: 0 },
    armL: { u: 32, v: 48, w: 4, h: 12, d: 4, over: [48, 48], x: 6, y: 0, legacy: "armR" },
    legR: { u: 0, v: 16, w: 4, h: 12, d: 4, over: [0, 32], x: -2, y: 12 },
    legL: { u: 16, v: 48, w: 4, h: 12, d: 4, over: [0, 48], x: 2, y: 12, legacy: "legR" },
  };

  const faces = (u, v, w, h, d) => ({
    top: [u + d, v, w, d], bottom: [u + d + w, v, w, d],
    right: [u, v + d, d, h], front: [u + d, v + d, w, h],
    left: [u + d + w, v + d, d, h], back: [u + d + w + d, v + d, w, h],
  });

  function paintDefault() {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const fill = (rect, colors) => {
      const [x, y, w, h] = rect;
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        g.fillStyle = colors[Math.floor(rnd() * colors.length)];
        g.fillRect(x + i, y + j, 1, 1);
      }
    };
    const SKIN = ["#c98f66", "#c28860", "#cf966d"];
    const HAIR = ["#3f2a1c", "#4a3222", "#37241a"];
    const SHIRT = ["#d9d6c6", "#cfccba", "#e0ddcf"];
    const SHORT = ["#3c6b4e", "#376347", "#427456"];
    const BOOT = ["#4b3a2c", "#544233"];

    const paintBox = (box, colorOf) => {
      const f = faces(box.u, box.v, box.w, box.h, box.d);
      for (const name of Object.keys(f)) fill(f[name], colorOf(name));
    };
    paintBox(BOXES.head, (n) => (n === "top" || n === "back" ? HAIR : SKIN));
    const head = faces(0, 0, 8, 8, 8);
    for (const n of ["front", "left", "right"]) {
      const [x, y, w] = head[n];
      fill([x, y, w, 2], HAIR);
      if (n !== "front") fill([x, y + 2, w, 2], HAIR);
    }
    const [fx, fy] = head.front;
    fill([fx, fy + 2, 1, 1], HAIR); fill([fx + 7, fy + 2, 1, 1], HAIR);
    g.fillStyle = "#f4f1e6"; g.fillRect(fx + 1, fy + 4, 2, 1); g.fillRect(fx + 5, fy + 4, 2, 1);
    g.fillStyle = "#2f5a44"; g.fillRect(fx + 2, fy + 4, 1, 1); g.fillRect(fx + 5, fy + 4, 1, 1);
    g.fillStyle = "#9e6a48"; g.fillRect(fx + 3, fy + 5, 2, 1);
    g.fillStyle = "#8a5a3e"; g.fillRect(fx + 3, fy + 6, 2, 1);
    fill([fx + 1, fy + 7, 6, 1], ["#b07c56", "#c98f66", "#a87450"]);

    paintBox(BOXES.body, () => SHIRT);
    const body = faces(16, 16, 8, 12, 4);
    fill([body.front[0], body.front[1] + 8, 8, 4], SHORT);
    fill([body.back[0], body.back[1] + 8, 8, 4], SHORT);
    fill([body.left[0], body.left[1] + 8, 4, 4], SHORT);
    fill([body.right[0], body.right[1] + 8, 4, 4], SHORT);
    // Chemise déchirée au crash.
    g.fillStyle = "#c98f66";
    g.fillRect(body.front[0] + 3, body.front[1], 2, 3);
    g.fillRect(body.front[0] + 1, body.front[1] + 6, 2, 2);
    g.fillRect(body.front[0] + 6, body.front[1] + 5, 1, 3);

    for (const box of [BOXES.armR, BOXES.armL]) {
      paintBox(box, () => SKIN);
      const f = faces(box.u, box.v, box.w, box.h, box.d);
      for (const n of ["front", "back", "left", "right", "top"]) {
        const [x, y, w, h] = f[n];
        fill([x, y, w, Math.min(h, n === "top" ? h : 3)], SHIRT);
      }
    }
    for (const box of [BOXES.legR, BOXES.legL]) {
      paintBox(box, () => SKIN);
      const f = faces(box.u, box.v, box.w, box.h, box.d);
      for (const n of ["front", "back", "left", "right", "top"]) {
        const [x, y, w, h] = f[n];
        fill([x, y, w, Math.min(h, n === "top" ? h : 5)], SHORT);
        if (n !== "top") fill([x, y + 10, w, 2], BOOT);
      }
      fill(f.bottom, BOOT);
    }
    return c;
  }

  let source = paintDefault();
  let rig, stage, rotX = -8, rotY = -26, drag = null, idle = true, raf = 0, S = 12;

  function faceCanvas(rect, overRect) {
    const c = document.createElement("canvas");
    c.width = rect[2]; c.height = rect[3];
    const g = c.getContext("2d");
    g.imageSmoothingEnabled = false;
    g.drawImage(source, rect[0], rect[1], rect[2], rect[3], 0, 0, rect[2], rect[3]);
    if (overRect && source.height >= 64) g.drawImage(source, overRect[0], overRect[1], overRect[2], overRect[3], 0, 0, rect[2], rect[3]);
    return c;
  }

  function buildRig() {
    rig.textContent = "";
    S = stage.clientHeight < 400 ? 8 : 13;
    for (const name of Object.keys(BOXES)) {
      let box = BOXES[name];
      const uv = source.height < 64 && box.legacy ? BOXES[box.legacy] : box;
      const f = faces(uv.u, uv.v, uv.w, uv.h, uv.d);
      const fo = uv.over ? faces(uv.over[0], uv.over[1], uv.w, uv.h, uv.d) : {};
      const part = document.createElement("div");
      part.className = "part";
      part.style.transform = `translate3d(${box.x * S}px, ${(box.y + box.h / 2 - 8) * S}px, 0)`;
      const w = box.w * S, h = box.h * S, d = box.d * S;
      const place = {
        front: [w, h, `translateZ(${d / 2}px)`],
        back: [w, h, `rotateY(180deg) translateZ(${d / 2}px)`],
        right: [d, h, `rotateY(-90deg) translateZ(${w / 2}px)`],
        left: [d, h, `rotateY(90deg) translateZ(${w / 2}px)`],
        top: [w, d, `rotateX(90deg) translateZ(${h / 2}px)`],
        bottom: [w, d, `rotateX(-90deg) translateZ(${h / 2}px)`],
      };
      for (const side of Object.keys(place)) {
        const [cw, ch, tf] = place[side];
        const canvas = faceCanvas(f[side], fo[side]);
        canvas.style.width = cw + "px";
        canvas.style.height = ch + "px";
        canvas.style.transform = `translate(${-cw / 2}px, ${-ch / 2}px) ${tf}`;
        part.appendChild(canvas);
      }
      rig.appendChild(part);
    }
    apply();
  }

  function apply() {
    if (rig) rig.style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg)`;
  }

  function loop(t) {
    raf = requestAnimationFrame(loop);
    if (idle && !window.LI_calm()) { rotY = -26 + Math.sin(t / 2600) * 22; apply(); }
  }

  function drawAvatar(canvas) {
    const g = canvas.getContext("2d");
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, 8, 8);
    g.drawImage(source, 8, 8, 8, 8, 0, 0, 8, 8);
    g.drawImage(source, 40, 8, 8, 8, 0, 0, 8, 8);
  }

  window.Skin = {
    mount(stageEl, rigEl) {
      stage = stageEl; rig = rigEl;
      stage.addEventListener("pointerdown", (e) => {
        drag = { x: e.clientX, y: e.clientY, rx: rotX, ry: rotY };
        idle = false;
        stage.setPointerCapture(e.pointerId);
      });
      stage.addEventListener("pointermove", (e) => {
        if (!drag) return;
        rotY = drag.ry + (e.clientX - drag.x) * 0.7;
        rotX = Math.max(-45, Math.min(45, drag.rx - (e.clientY - drag.y) * 0.5));
        apply();
      });
      const end = () => { drag = null; };
      stage.addEventListener("pointerup", end);
      stage.addEventListener("pointercancel", end);
      stage.addEventListener("keydown", (e) => {
        const step = { ArrowLeft: [0, -15], ArrowRight: [0, 15], ArrowUp: [8, 0], ArrowDown: [-8, 0] }[e.key];
        if (!step) return;
        e.preventDefault();
        idle = false;
        rotX = Math.max(-45, Math.min(45, rotX + step[0]));
        rotY += step[1];
        apply();
      });
    },
    show() { buildRig(); idle = true; if (!raf) raf = requestAnimationFrame(loop); },
    hide() { cancelAnimationFrame(raf); raf = 0; },
    drawAvatar,
    reset() { source = paintDefault(); },
    /* Renvoie une promesse : l'image doit faire 64 × 64 ou 64 × 32. */
    load(src) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          if (img.width !== 64 || (img.height !== 64 && img.height !== 32)) {
            reject(new Error(`Cette image fait ${img.width} × ${img.height} pixels. Un skin fait 64 × 64 ou 64 × 32 pixels.`));
            return;
          }
          const c = document.createElement("canvas");
          c.width = 64; c.height = img.height;
          c.getContext("2d").drawImage(img, 0, 0);
          source = c;
          resolve(c.toDataURL("image/png"));
        };
        img.onerror = () => reject(new Error("Ce fichier n'est pas une image PNG lisible. Choisissez un autre fichier."));
        img.src = src;
      });
    },
  };
})();
