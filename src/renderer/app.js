/* Interface du launcher Lost Island. Les animations viennent de la maquette ; tout le reste passe par
   window.li (src/preload.js) : compte Microsoft, site, modpack, réglages, lancement du jeu. */
(function () {
  const $ = (id) => document.getElementById(id);
  const li = window.li;
  const SITE = "https://lostisland.eriniumlab.com";
  const LETTERS = [[78, 0], [182, 0], [286, 0], [390, 0], [0, 129], [52, 129], [156, 129], [260, 129], [364, 129], [468, 129]];

  let R = { ram: 6, dossier: "", apres: "keep", rester: true, animations: true, optionnels: {}, vue: null };
  let profil = null;
  let site = { ok: false, annonces: [], reglages: {}, serveur: null };
  let pack = { ok: false, optionnels: [], mods: 0 };
  let infos = { version: "", plateforme: "" };

  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const calm = () => reduced.matches || !R.animations;
  window.LI_calm = calm;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const win = $("win");
  let compact = false, scale = 1, view = "play";

  /* ---------- Taille de la fenêtre ---------- */
  function fit() {
    const wasCompact = compact;
    compact = innerWidth < 760;
    document.documentElement.classList.toggle("compact", compact);
    const slot = $("slot");
    if (compact) {
      slot.style.width = slot.style.height = "";
      win.style.transform = "";
    } else {
      scale = Math.min(innerWidth / 1150, innerHeight / 680);
      slot.style.width = 1150 * scale + "px";
      slot.style.height = 680 * scale + "px";
      win.style.transform = `scale(${scale})`;
    }
    if (wasCompact !== compact || !mapReady) buildMap();
    markTab();
  }

  /* ---------- Carte ---------- */
  const map = window.Island($("map"), { cell: 4 });
  let mapReady = false, tide = 0, tideTarget = 0, mapRun = false, lastDraw = 0;
  function buildMap() {
    const w = compact ? win.clientWidth : 1150 * 1.3;
    const h = compact ? win.clientHeight : 680;
    map.build(w, h, compact ? 0.33 : 0.5);
    mapReady = true;
    map.draw(tide, performance.now() / 1000);
  }
  function runMap(on) {
    if (on && !mapRun) { mapRun = true; requestAnimationFrame(mapLoop); }
    if (!on) mapRun = false;
  }
  function mapLoop(now) {
    if (!mapRun) return;
    requestAnimationFrame(mapLoop);
    if (now - lastDraw < 33) return;
    lastDraw = now;
    if (calm()) { tide = tideTarget; } else { tide += (tideTarget - tide) * 0.06; }
    map.draw(tide, now / 1000);
  }

  /* ---------- Fondu en blocs ---------- */
  const wipeC = $("wipe");
  function wipe(swap) {
    if (calm()) { swap(); return Promise.resolve(); }
    return new Promise((resolve) => {
      const cols = 30, rows = Math.max(12, Math.round(cols * win.clientHeight / win.clientWidth));
      wipeC.width = cols; wipeC.height = rows;
      const g = wipeC.getContext("2d");
      g.fillStyle = "#0e3329";
      const order = [];
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) order.push([x, y, x / cols * 0.45 + Math.random() * 0.55]);
      const start = performance.now(), dur = 620;
      let swapped = false;
      (function frame(now) {
        const u = Math.min(1, (now - start) / dur);
        g.clearRect(0, 0, cols, rows);
        for (const [x, y, k] of order) {
          const showFrom = k * 0.5, hideFrom = 0.5 + k * 0.5;
          if (u >= showFrom && u < hideFrom) g.fillRect(x, y, 1, 1);
        }
        if (!swapped && u >= 0.5) { swapped = true; swap(); }
        if (u < 1) requestAnimationFrame(frame);
        else { g.clearRect(0, 0, cols, rows); resolve(); }
      })(start);
    });
  }

  /* ---------- Chargement ---------- */
  let bootDone = false;
  function setupLogo() {
    const box = $("splash-logo");
    box.textContent = "";
    LETTERS.forEach((p, i) => {
      const img = new Image();
      img.src = `assets/logo/${String(i).padStart(2, "0")}.webp`;
      img.alt = "";
      img.style.left = p[0] + "px";
      img.style.top = p[1] + "px";
      img.style.animationDelay = i * 70 + "ms";
      box.appendChild(img);
    });
  }
  function setScreen(name) {
    win.dataset.screen = name;
    $("splash").hidden = name !== "splash";
    $("login").hidden = name !== "login";
    $("app").hidden = name !== "app";
    $("nav").hidden = name !== "app";
    $("account").hidden = name !== "app";
    runMap(name !== "app");
    if (name === "app") { startScene(); markTab(); } else stopScene();
  }
  function step(p, label) {
    tideTarget = p;
    $("tide-fill").style.transform = `scaleX(${p})`;
    $("splash-status").textContent = label;
    if (p >= 0.74) document.querySelectorAll("#splash-logo img").forEach((i) => i.classList.add("in"));
  }

  async function boot() {
    setupLogo();
    setScreen("splash");
    $("splash-skip").hidden = true;
    $("tide-fill").style.transition = "none";
    $("tide-fill").style.transform = "scaleX(0)";
    await sleep(50);
    $("tide-fill").style.transition = "transform 1s cubic-bezier(.3,.7,.3,1)";

    step(0.18, "Connexion au compte");
    const d = await li.demarrage();
    infos = { version: d.version, plateforme: d.plateforme };
    R = d.reglages;
    profil = d.profil;
    document.documentElement.classList.toggle("calm", !R.animations);

    step(0.46, "Récupération des annonces");
    site = await li.site();
    renderSite();

    step(0.74, "Vérification du modpack");
    pack = await li.modpack();
    renderMods();
    beginDraft();

    step(1, profil ? `Bienvenue, ${profil.nom}` : "Tout est prêt");
    await sleep(calm() ? 200 : 700);
    bootDone = true;
    tide = tideTarget = 1;
    if (profil) enterApp(); else showLogin();
    setInterval(rafraichirSite, 60_000);
  }
  async function rafraichirSite() {
    const s = await li.site();
    if (!s.ok) return;
    const avant = site.annonces[0]?.id;
    site = s;
    renderSite();
    if (s.annonces[0] && s.annonces[0].id !== avant && win.dataset.screen === "app") notifyNew();
  }
  function showLogin() {
    setScreen("login");
    resetLoginButton();
    $("login-status").textContent = "";
  }
  function enterApp() {
    wipe(() => { setScreen("app"); go("play", true); applyProfile(); renderNews(); notifyNew(); });
  }

  /* ---------- Connexion ---------- */
  function resetLoginButton() {
    $("login-btn").disabled = false;
    $("login-label").textContent = "Se connecter avec Microsoft";
  }
  $("login-btn").addEventListener("click", async () => {
    const status = $("login-status");
    $("login-btn").disabled = true;
    $("login-label").textContent = "Connexion en cours";
    status.textContent = "La connexion Microsoft s'ouvre dans une fenêtre séparée.";
    const r = await li.connexion();
    if (!r.ok) {
      resetLoginButton();
      status.textContent = r.erreur;
      return;
    }
    profil = r.profil;
    openDialog({
      title: "Rester connecté ?",
      body: "Le launcher s'ouvrira directement sur votre compte la prochaine fois.",
      actions: [
        { label: "Rester connecté", cta: true, run: async () => { await li.resterConnecte(true); R.rester = true; closeDialog(); enterApp(); } },
        { label: "Non", run: async () => { await li.resterConnecte(false); R.rester = false; closeDialog(); enterApp(); } },
      ],
    });
  });

  /* ---------- Navigation ---------- */
  const PAGES = ["play", "news", "skin", "mods", "settings"];
  function markTab() {
    const mark = $("tab-mark");
    let active = null;
    document.querySelectorAll(".tab").forEach((t) => {
      const on = t.dataset.view === view;
      if (on) { t.setAttribute("aria-current", "page"); active = t; } else t.removeAttribute("aria-current");
    });
    mark.hidden = !active || $("nav").hidden;
    if (active && active.offsetWidth) {
      const w = active.offsetWidth - 24;
      mark.style.width = Math.max(14, w) + "px";
      mark.style.transform = `translateX(${active.offsetLeft + 12}px)`;
    }
  }
  function show(name) {
    view = name;
    for (const p of PAGES) {
      const el = $("view-" + p);
      el.hidden = p !== name;
      el.classList.toggle("enter", p === name);
    }
    if (name === "skin") { window.Skin.show(); chargerSkin(); } else window.Skin.hide();
    if (name === "news") openNews(currentNews || (site.annonces[0] && site.annonces[0].id));
    paintPageMap(name);
    markTab();
    updateSavebar();
    closeMenu();
  }
  function go(name, instant) {
    if (name === view && !instant) return;
    if (!guardDirty(() => go(name, instant))) return;
    const crossesScene = name === "play" || view === "play";
    if (!instant && crossesScene) wipe(() => show(name));
    else show(name);
  }
  document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => go(t.dataset.view)));

  const pageMaps = {};
  function paintPageMap(name) {
    if (name === "play" || pageMaps[name]) return;
    const c = $("view-" + name).querySelector(".page-map");
    if (!c) return;
    const isl = window.Island(c, { cell: 5, seed: 41 + PAGES.indexOf(name) * 3, cx: 0.72, cy: 0.5, radius: 0.5 });
    isl.build(compact ? 400 : 460, compact ? 700 : 680);
    isl.draw(1, 12);
    pageMaps[name] = true;
  }

  /* ---------- Compte ---------- */
  const closeMenu = () => { $("account-menu").hidden = true; $("account-btn").setAttribute("aria-expanded", "false"); };
  $("account-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    const m = $("account-menu");
    m.hidden = !m.hidden;
    $("account-btn").setAttribute("aria-expanded", String(!m.hidden));
  });
  document.addEventListener("click", (e) => { if (!$("account").contains(e.target)) closeMenu(); });
  $("menu-site").addEventListener("click", () => { closeMenu(); li.lien(SITE); });
  $("menu-logout").addEventListener("click", () => {
    closeMenu();
    openDialog({
      title: "Se déconnecter ?",
      body: "Vous devrez repasser par Microsoft pour rejouer.",
      actions: [
        { label: "Se déconnecter", cta: true, run: () => { closeDialog(); logout(); } },
        { label: "Annuler", run: closeDialog },
      ],
    });
  });
  async function logout() {
    if (jeuActif) { toast("Fermez d'abord le jeu."); return; }
    await li.deconnexion();
    profil = null;
    dirty = null;
    window.Skin.reset();
    wipe(() => { tide = tideTarget = 1; showLogin(); });
  }
  function applyProfile() {
    $("account-name").textContent = profil ? profil.nom : "Joueur";
    window.Skin.drawAvatar($("avatar"));
  }

  /* ---------- Scène animée ---------- */
  const scene = $("scene"), sea = $("sea");
  let seaImgs = [], sceneRaf = 0, mx = 0, my = 0, tmx = 0, tmy = 0;
  for (let i = 0; i < 8; i++) {
    const img = new Image();
    img.src = `assets/scene/sea_${i}.webp`;
    img.alt = "";
    sea.appendChild(img);
    seaImgs.push(img);
  }
  seaImgs[0].style.opacity = 1;
  function sceneLoop(now) {
    sceneRaf = requestAnimationFrame(sceneLoop);
    if (view !== "play" || calm()) return;
    const pos = now / 1000 * 2.2, i = Math.floor(pos) % 8, j = (i + 1) % 8, f = pos - Math.floor(pos);
    seaImgs.forEach((img, k) => { img.style.opacity = k === i ? 1 : k === j ? f : 0; });
    mx += (tmx - mx) * 0.05; my += (tmy - my) * 0.05;
    scene.style.setProperty("--mx", mx.toFixed(3));
    scene.style.setProperty("--my", my.toFixed(3));
  }
  function startScene() { if (!sceneRaf) sceneRaf = requestAnimationFrame(sceneLoop); }
  function stopScene() { cancelAnimationFrame(sceneRaf); sceneRaf = 0; }
  win.addEventListener("pointermove", (e) => {
    const r = win.getBoundingClientRect();
    tmx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    tmy = ((e.clientY - r.top) / r.height - 0.5) * 2;
  });

  /* ---------- Site : saison, état du serveur ---------- */
  function renderSite() {
    const reg = site.reglages || {};
    $("season").textContent = reg.saison ? `${reg.saison}, l'aventure continue` : "";
    const s = site.serveur;
    let etat, joueurs, classe;
    if (!site.ok) { etat = "Site injoignable"; joueurs = "État du serveur inconnu"; classe = "off"; }
    else if (reg.maintenance) { etat = "Serveur en maintenance"; joueurs = reg.messageMaintenance || ""; classe = "off"; }
    else if (s && s.enLigne) { etat = "Serveur en ligne"; joueurs = `${s.joueurs} joueur${s.joueurs > 1 ? "s" : ""} sur l'île`; classe = "pulse"; }
    else { etat = "Serveur hors ligne"; joueurs = "Vous pourrez rejoindre l'île à son retour"; classe = "off"; }
    $("server-state").textContent = etat;
    $("server-players").textContent = joueurs;
    $("server-dot").className = classe;
    $("play-btn").disabled = !!reg.maintenance || !pack.ok;
    $("play-btn").title = !pack.ok ? "Le modpack n'est pas encore publié" : "";
    renderNews();
  }

  /* ---------- Lancement du jeu ---------- */
  const BLOCKS = (() => {
    const box = $("blocks");
    for (let i = 0; i < 48; i++) box.appendChild(document.createElement("i"));
    return [...box.children];
  })();
  let jeuActif = false, sessionTimer = 0;
  function dock(which) {
    for (const n of ["idle", "launch", "error", "running"]) $("dock-" + n).hidden = n !== which;
  }
  function setProgress(p, phase, detail) {
    const count = compact ? 24 : 48;
    const n = Math.round(p / 100 * count);
    BLOCKS.forEach((b, i) => {
      b.hidden = i >= count;
      b.className = i < n ? (i === n - 1 && p < 100 ? "on head" : "on") : "";
    });
    $("launch-pct").textContent = Math.round(p) + " %";
    $("blocks").setAttribute("aria-valuenow", Math.round(p));
    if (phase) $("launch-phase").textContent = phase;
    $("launch-detail").textContent = detail || "";
  }
  function startLaunch() {
    jeuActif = true;
    dock("launch");
    setProgress(0, "Préparation", "");
    li.lancer(site.reglages?.adresseServeur || null);
  }
  li.surJeu((ev) => {
    if (ev.phase) { setProgress(ev.pct, ev.phase, ev.detail); return; }
    if (ev.etat === "lance") gameStarted();
    if (ev.etat === "annule") { jeuActif = false; dock("idle"); toast("Lancement annulé"); }
    if (ev.etat === "erreur") {
      jeuActif = false;
      $("error-title").textContent = `Le lancement s'est arrêté à ${Math.round(ev.pct || 0)} %`;
      $("error-text").textContent = ev.message;
      dock("error");
    }
    if (ev.etat === "ferme") {
      jeuActif = false;
      clearInterval(sessionTimer);
      const temps = $("session-time").textContent;
      dock("idle");
      if (ev.code) {
        $("error-title").textContent = "Minecraft s'est fermé de façon inattendue";
        $("error-text").textContent = `Code ${ev.code}. Si cela se répète, relancez, ou baissez la mémoire allouée dans les paramètres.`;
        dock("error");
      } else toast(`Jeu fermé après ${temps}`);
    }
  });
  function gameStarted() {
    dock("running");
    const t0 = Date.now();
    const tick = () => {
      const s = Math.floor((Date.now() - t0) / 1000);
      $("session-time").textContent = `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")}`;
    };
    tick();
    sessionTimer = setInterval(tick, 1000);
  }
  $("play-btn").addEventListener("click", startLaunch);
  $("launch-cancel").addEventListener("click", () => li.annuler());
  $("launch-retry").addEventListener("click", startLaunch);
  $("launch-dismiss").addEventListener("click", () => dock("idle"));
  $("game-quit").addEventListener("click", () => li.quitterJeu());

  /* ---------- Annonces ---------- */
  let currentNews = null;
  const fmt = (iso) => new Date(iso.length === 10 ? iso + "T12:00:00" : iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const unread = () => site.annonces.length && site.annonces[0].id !== R.vue;
  function renderNews() {
    const list = $("news-list");
    list.textContent = "";
    if (!site.annonces.length) {
      const e = document.createElement("div");
      e.className = "empty";
      e.innerHTML = site.ok ? "<strong>Aucune annonce pour l'instant</strong>Les prochaines nouvelles du serveur arriveront ici." : "<strong>Annonces indisponibles</strong>Le site ne répond pas. Elles reviendront toutes seules.";
      list.appendChild(e);
    }
    site.annonces.forEach((n, i) => {
      const b = document.createElement("button");
      b.className = "news-item";
      b.setAttribute("aria-current", String(n.id === currentNews));
      const strong = document.createElement("strong");
      strong.textContent = n.titre;
      const small = document.createElement("small");
      small.textContent = fmt(n.date);
      b.append(strong, small);
      if (i === 0 && unread()) {
        const d = document.createElement("i");
        d.className = "dot";
        b.appendChild(d);
      }
      b.addEventListener("click", () => openNews(n.id, true));
      list.appendChild(b);
    });
    const read = $("news-read");
    read.textContent = "";
    const cur = site.annonces.find((n) => n.id === currentNews);
    if (cur) {
      const t = document.createElement("time");
      t.textContent = fmt(cur.date);
      const h = document.createElement("h3");
      h.textContent = cur.titre;
      read.append(t, h);
      for (const para of String(cur.corps || cur.resume).split(/\n\s*\n/)) {
        const p = document.createElement("p");
        p.textContent = para.trim();
        read.appendChild(p);
      }
      const lien = document.createElement("button");
      lien.className = "ghost small";
      lien.textContent = "Lire sur le site";
      lien.addEventListener("click", () => li.lien(`${SITE}/annonces/${encodeURIComponent(cur.id)}`));
      read.appendChild(lien);
    }
    const first = site.annonces[0];
    $("latest").hidden = !first;
    if (first) {
      $("latest-title").textContent = first.titre;
      $("latest-date").textContent = fmt(first.date);
    }
    $("news-dot").hidden = !unread();
    $("latest-dot").hidden = !unread();
    markTab();
  }
  function openNews(id, focus) {
    currentNews = id;
    if (site.annonces[0] && id === site.annonces[0].id && R.vue !== id) { R.vue = id; li.reglages({ vue: id }); }
    renderNews();
    if (focus && compact) $("news-read").focus();
  }
  $("latest").addEventListener("click", () => { currentNews = site.annonces[0].id; go("news"); });
  function notifyNew() {
    if (unread()) toast("Nouvelle annonce publiée", { label: "Lire", run: () => { currentNews = site.annonces[0].id; go("news"); } });
  }

  /* ---------- Mods optionnels ---------- */
  function renderMods() {
    const box = $("mods-rows");
    box.textContent = "";
    $("mods-note").textContent = !pack.ok
      ? "Le modpack n'est pas encore publié. Les mods optionnels apparaîtront ici."
      : `Modpack ${pack.version} : ${pack.mods} mods installés d'office.`;
    for (const o of pack.optionnels || []) {
      const row = document.createElement("div");
      row.className = "row";
      const text = document.createElement("div");
      text.className = "row-text";
      const h = document.createElement("h3");
      h.id = `l-opt-${o.id}`;
      h.textContent = o.nom;
      const p = document.createElement("p");
      p.textContent = o.description || "";
      text.append(h, p);
      const sw = document.createElement("label");
      sw.className = "switch";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.dataset.opt = o.id;
      input.setAttribute("aria-labelledby", h.id);
      input.addEventListener("change", (e) => { draft.optionnels = { ...draft.optionnels, [o.id]: e.target.checked }; touch(); });
      sw.append(input, document.createElement("i"));
      row.append(text, sw);
      box.appendChild(row);
    }
  }
  const optionActive = (choix, o) => (o.id in choix ? !!choix[o.id] : !!o.defaut);

  /* ---------- Réglages avec enregistrement ---------- */
  let dirty = null;
  const SECTION_KEYS = { settings: ["ram", "dossier", "apres", "rester", "animations"], mods: ["optionnels"] };
  let draft = {};
  function beginDraft() {
    draft = { ram: R.ram, dossier: R.dossier, apres: R.apres, rester: R.rester, animations: R.animations, optionnels: { ...R.optionnels } };
    syncControls();
  }
  function syncControls() {
    $("ram").value = draft.ram;
    paintRam();
    $("path-value").textContent = draft.dossier;
    $("after").value = draft.apres;
    $("remember").checked = draft.rester;
    $("anim").checked = draft.animations;
    document.querySelectorAll("[data-opt]").forEach((i) => {
      const o = pack.optionnels.find((x) => x.id === i.dataset.opt);
      i.checked = o ? optionActive(draft.optionnels, o) : false;
    });
    $("about").textContent = `Launcher ${infos.version}`;
  }
  const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function touch() {
    const changed = (keys) => keys.some((k) => !egal(draft[k], R[k]));
    dirty = changed(SECTION_KEYS.settings) ? "settings" : changed(SECTION_KEYS.mods) ? "mods" : null;
    updateSavebar();
  }
  function updateSavebar() {
    $("savebar").hidden = !(dirty && dirty === view);
  }
  async function commit() {
    const wasMods = dirty === "mods";
    R = await li.reglages(draft);
    dirty = null;
    updateSavebar();
    document.documentElement.classList.toggle("calm", !R.animations);
    toast(wasMods ? "Mods enregistrés, ils s'appliqueront au prochain lancement" : "Paramètres enregistrés");
  }
  function revert() { beginDraft(); dirty = null; updateSavebar(); }
  $("save-ok").addEventListener("click", commit);
  $("save-cancel").addEventListener("click", revert);
  function guardDirty(next) {
    if (!dirty) return true;
    openDialog({
      title: "Enregistrer vos modifications ?",
      body: "Elles seront perdues si vous quittez cette page sans enregistrer.",
      actions: [
        { label: "Enregistrer", cta: true, run: async () => { closeDialog(); await commit(); next(); } },
        { label: "Ne pas enregistrer", run: () => { closeDialog(); revert(); next(); } },
        { label: "Rester ici", run: closeDialog },
      ],
    });
    return false;
  }

  // Mémoire : un bloc par Go, repère sur la plage conseillée.
  const ramBox = $("ram-blocks");
  for (let g = 2; g <= 16; g++) {
    const i = document.createElement("i");
    if (g >= 6 && g <= 8) i.className = "ideal";
    ramBox.appendChild(i);
  }
  function paintRam() {
    const v = +$("ram").value;
    [...ramBox.children].forEach((b, k) => b.classList.toggle("on", k + 2 <= v));
    $("ram-value").textContent = v + " Go";
    $("ram").setAttribute("aria-valuetext", v + " gigaoctets");
    $("ram-hint").textContent = v < 6
      ? "Attention, le modpack risque de manquer de mémoire en dessous de 6 Go."
      : v > 8 ? "Plus que nécessaire pour le modpack. Gardez-en assez pour le système." : "La plage conseillée pour ce modpack va de 6 à 8 Go.";
  }
  $("ram").addEventListener("input", (e) => { draft.ram = +e.target.value; paintRam(); touch(); });
  $("after").addEventListener("change", (e) => { draft.apres = e.target.value; touch(); });
  $("remember").addEventListener("change", (e) => { draft.rester = e.target.checked; touch(); });
  $("anim").addEventListener("change", (e) => { draft.animations = e.target.checked; touch(); });
  $("path-btn").addEventListener("click", async () => {
    const d = await li.choisirDossier();
    if (!d) return;
    draft.dossier = d;
    $("path-value").textContent = d;
    touch();
  });

  /* ---------- Skin ---------- */
  window.Skin.mount($("skin-stage"), $("skin-rig"));
  let skinCharge = false;
  async function chargerSkin(force) {
    if (skinCharge && !force) return;
    const s = await li.skin();
    skinCharge = true;
    if (!s) { window.Skin.reset(); }
    else {
      $("skin-model").value = s.modele;
      await window.Skin.load(s.dataUrl).catch(() => window.Skin.reset());
    }
    window.Skin.show();
    window.Skin.drawAvatar($("avatar"));
  }
  function octetsDepuisDataUrl(url) {
    const bin = atob(url.split(",")[1]);
    const a = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return a;
  }
  function takeSkin(file) {
    const msg = $("skin-msg");
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      window.Skin.load(reader.result).then(async () => {
        msg.textContent = "Envoi du skin à Minecraft…";
        const r = await li.changerSkin(octetsDepuisDataUrl(reader.result), $("skin-model").value);
        if (!r.ok) { msg.textContent = r.erreur; await chargerSkin(true); return; }
        msg.textContent = "";
        window.Skin.show();
        window.Skin.drawAvatar($("avatar"));
        toast(`Skin « ${file.name} » appliqué à votre compte`);
      }).catch((err) => { msg.textContent = err.message; });
    };
    reader.readAsDataURL(file);
  }
  $("skin-file").addEventListener("change", (e) => { takeSkin(e.target.files[0]); e.target.value = ""; });
  const drop = $("skin-drop");
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); takeSkin(e.dataTransfer.files[0]); });
  $("skin-reset").addEventListener("click", async () => {
    const r = await li.retirerSkin();
    if (!r.ok) { $("skin-msg").textContent = r.erreur; return; }
    $("skin-msg").textContent = "";
    await chargerSkin(true);
    toast("Skin d'origine rétabli");
  });

  /* ---------- Dialogue et notification ---------- */
  let lastFocus = null, closeOnEsc = null;
  function openDialog({ title, body, node, actions }) {
    lastFocus = document.activeElement;
    $("dialog-title").textContent = title;
    const b = $("dialog-body");
    b.textContent = "";
    if (node) b.appendChild(node); else b.textContent = body;
    const a = $("dialog-actions");
    a.textContent = "";
    actions.forEach((act) => {
      const btn = document.createElement("button");
      btn.className = act.cta ? "cta small" : "ghost";
      btn.textContent = act.label;
      btn.addEventListener("click", act.run);
      a.appendChild(btn);
    });
    $("veil").hidden = false;
    a.firstChild.focus();
    closeOnEsc = actions[actions.length - 1].run;
  }
  function closeDialog() {
    $("veil").hidden = true;
    closeOnEsc = null;
    if (lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus();
  }
  document.addEventListener("keydown", (e) => {
    if (!$("veil").hidden) {
      if (e.key === "Escape" && closeOnEsc) { e.preventDefault(); closeOnEsc(); }
      if (e.key === "Tab") {
        const items = [...$("dialog").querySelectorAll("button, input")];
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    } else if (e.key === "Escape") closeMenu();
  });
  let toastTimer = 0;
  function toast(text, action) {
    const t = $("toast");
    t.textContent = "";
    const span = document.createElement("span");
    span.textContent = text;
    t.appendChild(span);
    if (action) {
      const b = document.createElement("button");
      b.textContent = action.label;
      b.addEventListener("click", () => { t.hidden = true; action.run(); });
      t.appendChild(b);
    }
    t.hidden = true; void t.offsetWidth; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, action ? 7000 : 3200);
  }

  /* ---------- Fenêtre et mises à jour ---------- */
  $("win-min").addEventListener("click", () => li.fenetre("reduire"));
  $("win-close").addEventListener("click", () => li.fenetre("fermer"));
  li.surMaj(() => { $("update").hidden = false; });
  $("update-btn").addEventListener("click", () => {
    if (jeuActif) { toast("Fermez d'abord le jeu pour installer la mise à jour."); return; }
    li.installerMaj();
  });

  /* ---------- Démarrage ---------- */
  addEventListener("resize", fit);
  fit();
  window.Skin.reset();
  boot().catch((e) => { $("splash-status").textContent = `Démarrage impossible : ${e.message}`; });
  document.fonts && document.fonts.ready.then(markTab);
})();
