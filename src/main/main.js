// Processus principal du launcher Lost Island.
const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const path = require("node:path");
const maj = require("./maj");
const { SITE } = require("./config");
const compte = require("./compte");
const jeu = require("./jeu");
const stockage = require("./stockage");
const { lireManifeste } = require("./modpack");
const { json } = require("./telechargement");

let fenetre = null;

if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => {
  if (!fenetre) return;
  fenetre.show();
  if (fenetre.isMinimized()) fenetre.restore();
  fenetre.focus();
});

function creerFenetre() {
  fenetre = new BrowserWindow({
    width: 1150,
    height: 680,
    minWidth: 900,
    minHeight: 540,
    frame: false,
    backgroundColor: "#082019",
    title: "Lost Island Launcher",
    icon: path.join(__dirname, "..", "renderer", "assets", "icone.png"),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  fenetre.removeMenu();
  fenetre.once("ready-to-show", () => fenetre.show());
  fenetre.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  // Aucun lien ne s'ouvre dans le launcher : ils partent dans le navigateur, s'ils sont sûrs.
  fenetre.webContents.setWindowOpenHandler(({ url }) => {
    ouvrirLien(url);
    return { action: "deny" };
  });
  fenetre.webContents.on("will-navigate", (e) => e.preventDefault());
  fenetre.on("closed", () => (fenetre = null));
}

const LIENS_SURS = [/^https:\/\/lostisland\.eriniumlab\.com(\/|$)/, /^https:\/\/discord\.(gg|com)\//, /^https:\/\/jlskyzer\.github\.io\//];
function ouvrirLien(url) {
  if (LIENS_SURS.some((r) => r.test(url))) shell.openExternal(url);
}

const envoyer = (canal, donnee) => fenetre?.webContents.send(canal, donnee);

/* Échanges avec l'interface (src/preload.js). */

ipcMain.handle("demarrage", async () => ({
  version: app.getVersion(),
  plateforme: process.platform,
  reglages: stockage.reglagesPublics(),
  // Développement seulement (jamais dans le launcher installé) : un faux profil pour voir l'écran principal.
  profil: !app.isPackaged && process.env.LI_ESSAI_PROFIL ? { nom: process.env.LI_ESSAI_PROFIL, uuid: "essai", skin: null } : await compte.reprendre(),
}));

// État public du site : annonces publiées, réglages (saison, maintenance, adresse du serveur), serveur en ligne.
ipcMain.handle("site", async () => {
  try {
    const e = await json(`${SITE}/api/etat`);
    return {
      ok: true,
      annonces: e.annonces.filter((a) => a.publiee).map(({ id, titre, resume, corps, date, categorie, epinglee }) => ({ id, titre, resume, corps, date, categorie, epinglee })),
      reglages: { saison: e.reglages.saison, maintenance: e.reglages.maintenance, messageMaintenance: e.reglages.messageMaintenance, adresseServeur: e.reglages.adresseServeur, discord: e.reglages.discord },
      serveur: e.serveur,
    };
  } catch {
    return { ok: false };
  }
});

ipcMain.handle("modpack", async () => {
  try {
    const m = await lireManifeste();
    return {
      ok: true,
      version: m.version,
      optionnels: m.optionnels.map(({ id, nom, description }) => ({ id, nom, description })),
      mods: m.fichiers.filter((f) => f.chemin.startsWith("mods/")).length,
      vide: !m.fichiers.length && !m.optionnels.length,
    };
  } catch {
    return { ok: false };
  }
});

ipcMain.handle("connexion", () => compte.connecter());
ipcMain.handle("deconnexion", () => compte.deconnecter());
ipcMain.handle("rester-connecte", (_e, rester) => compte.choisirResterConnecte(!!rester));

ipcMain.handle("reglages", (_e, modifs) => {
  const permis = {};
  if (Number.isInteger(modifs?.ram) && modifs.ram >= 2 && modifs.ram <= 32) permis.ram = modifs.ram;
  if (["keep", "min", "close"].includes(modifs?.apres)) permis.apres = modifs.apres;
  if (typeof modifs?.animations === "boolean") permis.animations = modifs.animations;
  if (typeof modifs?.dossier === "string") permis.dossier = modifs.dossier;
  if (modifs?.optionnels && typeof modifs.optionnels === "object") permis.optionnels = Object.fromEntries(Object.entries(modifs.optionnels).map(([k, v]) => [String(k), !!v]));
  if (typeof modifs?.vue === "string") permis.vue = modifs.vue;
  if (typeof modifs?.rester === "boolean") compte.choisirResterConnecte(modifs.rester);
  stockage.ecrire(permis);
  return stockage.reglagesPublics();
});

ipcMain.handle("choisir-dossier", async () => {
  const r = await dialog.showOpenDialog(fenetre, { title: "Dossier du jeu", properties: ["openDirectory", "createDirectory"], defaultPath: stockage.dossierJeu() });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle("lancer", (_e, serveur) => {
  jeu.lancer((ev) => {
    envoyer("jeu", ev);
    if (ev.etat === "lance") {
      const apres = stockage.lire().apres;
      if (apres === "min") fenetre?.minimize();
      if (apres === "close") fenetre?.hide(); // le launcher reste en vie tant que le jeu tourne
    }
    if (ev.etat === "ferme" && fenetre && !fenetre.isVisible()) app.quit();
  }, typeof serveur === "string" ? serveur : null);
});
ipcMain.handle("annuler", () => jeu.annuler());
ipcMain.handle("quitter-jeu", () => jeu.quitterJeu());

ipcMain.handle("skin", () => compte.skinEnDataUrl().catch(() => null));
ipcMain.handle("changer-skin", async (_e, png, modele) => {
  try {
    await compte.changerSkin(new Uint8Array(png), modele);
    return { ok: true };
  } catch (e) {
    return { ok: false, erreur: e.message };
  }
});
ipcMain.handle("retirer-skin", async () => {
  try {
    await compte.retirerSkin();
    return { ok: true };
  } catch (e) {
    return { ok: false, erreur: e.message };
  }
});

ipcMain.handle("lien", (_e, url) => ouvrirLien(String(url)));
ipcMain.handle("fenetre", (_e, action) => {
  if (action === "reduire") fenetre?.minimize();
  if (action === "fermer") {
    if (jeu.enCours()) fenetre?.hide();
    else app.quit();
  }
});
// Mise à jour du launcher : proposée au démarrage, puis téléchargée, installée et relancée (src/main/maj.js).
ipcMain.handle("maj-verifier", () => maj.verifier());
ipcMain.handle("maj-installer", async () => {
  try {
    await maj.installer((fait, total) => envoyer("maj-progression", { fait, total }));
    return { ok: true };
  } catch (e) {
    return { ok: false, erreur: e.message };
  }
});

app.whenReady().then(() => {
  creerFenetre();
  // Essai sans écran : LI_CAPTURE=chemin.png photographie la fenêtre après LI_CAPTURE_MS ms, puis quitte.
  if (process.env.LI_CAPTURE) {
    setTimeout(async () => {
      const img = await fenetre.webContents.capturePage();
      require("node:fs").writeFileSync(process.env.LI_CAPTURE, img.toPNG());
      app.quit();
    }, Number(process.env.LI_CAPTURE_MS) || 8000);
  }
});
app.on("window-all-closed", () => {
  if (!jeu.enCours()) app.quit();
});
app.on("activate", () => {
  if (!fenetre) creerFenetre();
});
