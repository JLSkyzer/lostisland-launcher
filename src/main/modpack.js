// Contenu du jeu : le site publie /launcher/manifest.json, calculé depuis le dossier géré dans
// Admin → Fichiers du jeu. Sa racine est l'intérieur du dossier du jeu (.lostisland).
//
// {
//   "version": "da39a3ee5e",
//   "fichiers":   [{ "chemin": "mods/x.jar", "sha1": "…", "taille": 123, "url": "https://…" }],
//   "optionnels": [{ "id": "embeddium-0.3.31", "nom": "Embeddium", "description": "…",
//                    "chemin": "mods/embeddium-0.3.31.jar", "sha1": "…", "taille": 123, "url": "https://…" }]
// }
//
// À chaque « Jouer » : ce qui manque ou dont l'empreinte a changé est téléchargé ; ce que le launcher avait
// posé et qui n'est plus dans le manifeste est retiré, ainsi que tout jar de mods/ absent du manifeste (le
// joueur doit avoir les mêmes mods que le serveur, plus ses mods optionnels).
//
// Fichiers de réglages (texte : .txt, .json, .toml, .cfg…, hors de mods/) : ils appartiennent au joueur une fois
// posés. Le launcher retient l'empreinte de la version qu'il a posée ; si le fichier présent n'est ni celle-là ni
// celle du manifeste, le joueur l'a modifié (ou l'avait avant) et il est gardé tel quel, jamais écrasé ni retiré.
// Un fichier de réglages non modifié suit les mises à jour du site. Le supprimer redonne la version du site.
const fs = require("node:fs");
const path = require("node:path");
const { MANIFESTE } = require("./config");
const { json, telechargerTout, sha1 } = require("./telechargement");

const ETAT = ".lostisland-contenu.json";
// Dossiers que le launcher et Minecraft remplissent eux-mêmes : jamais vidés par la synchronisation.
const PROTEGES = ["versions", "libraries", "assets", "runtime", "installeurs", "saves", "logs", "crash-reports", "screenshots"];

async function lireManifeste(signal) {
  const m = await json(`${MANIFESTE}?t=${Date.now()}`, signal);
  if (!m || !Array.isArray(m.fichiers) || !Array.isArray(m.optionnels)) throw new Error("Manifeste du contenu invalide.");
  return m;
}

// Refuse tout chemin qui sortirait du dossier du jeu.
function cheminSur(dossierJeu, rel) {
  if (typeof rel !== "string" || !rel || path.isAbsolute(rel) || rel.split(/[\\/]/).some((s) => s === ".." || s === "")) {
    throw new Error(`Chemin refusé dans le manifeste : ${rel}`);
  }
  return path.join(dossierJeu, rel);
}

const optionnelActif = (choix, o) => !!choix?.[o.id];

const REGLAGES = /\.(txt|json|json5|toml|cfg|conf|ini|properties|ya?ml|snbt)$/i;
const estReglage = (rel) => REGLAGES.test(rel) && !rel.startsWith("mods/");

// Empreinte d'un fichier présent, ou null s'il n'existe pas.
const empreinte = (chemin) => sha1(chemin).catch(() => null);

async function synchroniser(dossierJeu, m, choix, { signal, progression }) {
  const voulus = [...m.fichiers, ...m.optionnels.filter((o) => optionnelActif(choix, o))];
  const etatFichier = path.join(dossierJeu, ETAT);
  let anciens = [], poses = {};
  try {
    const e = JSON.parse(fs.readFileSync(etatFichier, "utf8"));
    anciens = e.fichiers ?? [];
    poses = e.poses ?? {}; // chemin -> empreinte de la version posée par le launcher
  } catch {}

  // Fichiers de réglages modifiés par le joueur : ni téléchargés, ni retirés.
  const aGarder = new Set();
  for (const f of voulus) {
    if (!estReglage(f.chemin)) continue;
    const local = await empreinte(cheminSur(dossierJeu, f.chemin));
    if (local && local !== f.sha1 && local !== poses[f.chemin]) aGarder.add(f.chemin);
  }
  const aTelecharger = voulus.filter((f) => !aGarder.has(f.chemin));
  const fichiers = aTelecharger.map((f) => ({ url: f.url, chemin: cheminSur(dossierJeu, f.chemin), sha1: f.sha1, taille: f.taille }));
  const r = await telechargerTout(fichiers, { signal, progression });
  const nouveauxPoses = {};
  for (const f of aTelecharger) if (estReglage(f.chemin)) nouveauxPoses[f.chemin] = f.sha1;
  for (const rel of aGarder) if (poses[rel]) nouveauxPoses[rel] = poses[rel];

  const gardes = new Set(voulus.map((f) => path.normalize(f.chemin)));

  const retires = [];
  const retirer = (rel) => {
    try {
      fs.rmSync(cheminSur(dossierJeu, rel), { force: true });
      retires.push(rel);
    } catch {}
  };
  // 1. Ce que le launcher avait posé et qui a disparu du manifeste (sauf un réglage modifié par le joueur).
  for (const rel of anciens) {
    const n = path.normalize(rel);
    if (gardes.has(n) || PROTEGES.includes(n.split(path.sep)[0])) continue;
    const web = n.split(path.sep).join("/");
    if (estReglage(web)) {
      const local = await empreinte(cheminSur(dossierJeu, n));
      if (local && local !== poses[web]) continue;
    }
    retirer(n);
  }
  // 2. Tout jar de mods/ qui n'est pas voulu (mod ajouté à la main, optionnel désactivé).
  const dossierMods = path.join(dossierJeu, "mods");
  if (fs.existsSync(dossierMods)) {
    for (const nom of fs.readdirSync(dossierMods)) {
      const rel = path.normalize(path.join("mods", nom));
      if (nom.endsWith(".jar") && !gardes.has(rel) && !retires.includes(rel)) retirer(rel);
    }
  }
  fs.writeFileSync(etatFichier, JSON.stringify({ version: m.version, fichiers: [...gardes], poses: nouveauxPoses }, null, 2));
  return { ...r, retires: retires.length, gardes: aGarder.size, mods: voulus.filter((f) => f.chemin.startsWith("mods/")).length };
}

module.exports = { lireManifeste, synchroniser };
