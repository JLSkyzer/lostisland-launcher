// Modpack du serveur : un manifeste publié sur le site (outils/publier-modpack.mjs) liste chaque fichier avec
// son SHA-1, sa taille et son adresse (Modrinth pour les mods qui y sont, le site pour les autres).
//
// {
//   "version": "2026.11.13-1", "minecraft": "1.20.1", "forge": "47.4.21",
//   "serveur": "play.exemple.fr:25565" (facultatif),
//   "optionnels": [{ "id": "embeddium", "nom": "Embeddium", "description": "…", "defaut": true }],
//   "fichiers": [{ "chemin": "mods/x.jar", "sha1": "…", "taille": 123, "url": "https://…",
//                  "optionnel": "embeddium" (facultatif), "garder": true (facultatif : jamais écrasé s'il existe) }]
// }
const fs = require("node:fs");
const path = require("node:path");
const { MANIFESTE } = require("./config");
const { json, telechargerTout } = require("./telechargement");

const ETAT = ".lostisland-modpack.json";

async function lireManifeste(signal) {
  const m = await json(`${MANIFESTE}?t=${Date.now()}`, signal);
  if (!m || !Array.isArray(m.fichiers) || !m.minecraft || !m.forge) throw new Error("Manifeste du modpack invalide.");
  return m;
}

// Refuse tout chemin qui sortirait du dossier du jeu.
function cheminSur(dossierJeu, rel) {
  if (typeof rel !== "string" || !rel || path.isAbsolute(rel) || rel.split(/[\\/]/).includes("..")) {
    throw new Error(`Chemin refusé dans le manifeste : ${rel}`);
  }
  return path.join(dossierJeu, rel);
}

function optionnelActif(m, choix, id) {
  if (!id) return true;
  if (id in choix) return !!choix[id];
  return !!m.optionnels?.find((o) => o.id === id)?.defaut;
}

async function synchroniser(dossierJeu, m, choix, { signal, progression }) {
  const voulus = m.fichiers.filter((f) => optionnelActif(m, choix, f.optionnel));
  const aTelecharger = [];
  for (const f of voulus) {
    const chemin = cheminSur(dossierJeu, f.chemin);
    if (f.garder && fs.existsSync(chemin)) continue;
    aTelecharger.push({ url: f.url, chemin, sha1: f.sha1, taille: f.taille });
  }
  const r = await telechargerTout(aTelecharger, { signal, progression });

  // Retire ce que le modpack ne contient plus : tout jar de mods/ absent du manifeste (le serveur et le joueur
  // doivent avoir les mêmes mods), et les autres fichiers que le launcher avait posés lui-même.
  const gardes = new Set(voulus.map((f) => path.normalize(f.chemin)));
  const etatFichier = path.join(dossierJeu, ETAT);
  let anciens = [];
  try {
    anciens = JSON.parse(fs.readFileSync(etatFichier, "utf8")).fichiers ?? [];
  } catch {}
  const retires = [];
  const dossierMods = path.join(dossierJeu, "mods");
  if (fs.existsSync(dossierMods)) {
    for (const nom of fs.readdirSync(dossierMods)) {
      const rel = path.normalize(path.join("mods", nom));
      if (nom.endsWith(".jar") && !gardes.has(rel)) {
        fs.rmSync(path.join(dossierMods, nom), { force: true });
        retires.push(rel);
      }
    }
  }
  for (const rel of anciens) {
    const n = path.normalize(rel);
    if (!gardes.has(n) && !n.startsWith("mods" + path.sep)) {
      try {
        fs.rmSync(cheminSur(dossierJeu, n), { force: true });
        retires.push(n);
      } catch {}
    }
  }
  fs.writeFileSync(etatFichier, JSON.stringify({ version: m.version, fichiers: [...gardes] }, null, 2));
  return { ...r, retires: retires.length, mods: voulus.filter((f) => f.chemin.startsWith("mods/")).length };
}

module.exports = { lireManifeste, synchroniser, optionnelActif };
