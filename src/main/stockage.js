// Réglages du joueur et compte Microsoft, dans le dossier de données du launcher.
// Le jeton de reconnexion Microsoft est chiffré par le système (safeStorage : DPAPI, trousseau, libsecret).
const { app, safeStorage } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Mémoire vive totale du PC, en Go arrondis (31,9 Go -> 32, 7,9 Go -> 8).
// LI_ESSAI_RAM (développement seulement) simule un autre PC, par exemple 8 Go.
const ramPc = () => {
  const essai = !app.isPackaged && Number(process.env.LI_ESSAI_RAM);
  return Math.max(2, essai || Math.round(os.totalmem() / 1024 ** 3));
};

const fichier = () => path.join(app.getPath("userData"), "reglages.json");

const DEFAUTS = {
  ram: 6, // Go
  dossier: null, // null : dossier par défaut (dossierJeuParDefaut)
  apres: "keep", // keep | min | close
  rester: true,
  animations: true,
  argsOptimises: true, // arguments Java optimisés (voir arguments.js)
  argsJava: "", // arguments Java supplémentaires saisis par le joueur
  optionnels: {}, // id du mod optionnel -> activé ou non (absent : valeur par défaut du manifeste)
  vue: null, // dernière annonce lue
};

let cache = null;

function lire() {
  if (cache) return cache;
  try {
    cache = { ...DEFAUTS, ...JSON.parse(fs.readFileSync(fichier(), "utf8")) };
  } catch {
    cache = { ...DEFAUTS };
  }
  return cache;
}

function ecrire(modifs) {
  cache = { ...lire(), ...modifs };
  fs.mkdirSync(path.dirname(fichier()), { recursive: true });
  // Écriture atomique : un arrêt brutal ne laisse jamais un fichier à moitié écrit.
  const tmp = fichier() + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
  fs.renameSync(tmp, fichier());
  return cache;
}

function reglagesPublics() {
  const { jeton, ...r } = lire();
  const pc = ramPc();
  // ram ramenée à la mémoire du PC : la page n'affiche jamais plus que ce que le PC possède.
  return { ...r, ram: Math.min(r.ram, pc), ramPc: pc, dossier: r.dossier ?? dossierJeuParDefaut() };
}

function dossierJeuParDefaut() {
  return path.join(app.getPath("appData"), ".lostisland");
}

function dossierJeu() {
  return lire().dossier ?? dossierJeuParDefaut();
}

function garderJeton(jetonRefresh) {
  if (!jetonRefresh) return ecrire({ jeton: null });
  const valeur = safeStorage.isEncryptionAvailable()
    ? { chiffre: true, v: safeStorage.encryptString(jetonRefresh).toString("base64") }
    : { chiffre: false, v: jetonRefresh }; // Linux sans trousseau : en clair, dans le dossier de l'utilisateur
  return ecrire({ jeton: valeur });
}

function jetonGarde() {
  const j = lire().jeton;
  if (!j) return null;
  try {
    return j.chiffre ? safeStorage.decryptString(Buffer.from(j.v, "base64")) : j.v;
  } catch {
    return null;
  }
}

module.exports = { lire, ecrire, reglagesPublics, dossierJeu, dossierJeuParDefaut, garderJeton, jetonGarde, ramPc };
