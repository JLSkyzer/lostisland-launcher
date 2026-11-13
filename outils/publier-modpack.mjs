#!/usr/bin/env node
// Publie le modpack du serveur pour le launcher.
//
//   node outils/publier-modpack.mjs <dossier-du-pack> [--envoyer]
//
// Le dossier contient un pack.json et les fichiers à installer chez les joueurs, rangés comme dans le
// dossier du jeu (mods/, config/, resourcepacks/…) :
//
//   {
//     "minecraft": "1.20.1",
//     "forge": "47.4.21",
//     "serveur": "play.exemple.fr:25565",            (facultatif : sinon l'adresse réglée sur le site)
//     "garder": ["config/options-perso.toml"],      (facultatif : posés une fois, jamais écrasés)
//     "optionnels": [
//       { "id": "embeddium", "nom": "Embeddium", "description": "Plus d'images par seconde.", "defaut": true,
//         "fichiers": ["mods/embeddium-0.3.31+mc1.20.1.jar"] }
//     ]
//   }
//
// Les mods présents sur Modrinth (reconnus par leur SHA-1) sont téléchargés chez Modrinth par les joueurs :
// on ne redistribue pas le travail des autres. Les autres fichiers sont copiés dans modpack-sortie/fichiers,
// nommés par leur empreinte, et servis par le site. Avec --envoyer, la sortie part sur le mini PC
// (C:\srv\lostisland-site\pack), le manifeste en dernier, pour qu'il ne pointe jamais vers un fichier absent.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const SITE = "https://lostisland.eriniumlab.com";
const [source, ...options] = process.argv.slice(2);
if (!source) {
  console.error("Usage : node outils/publier-modpack.mjs <dossier-du-pack> [--envoyer]");
  process.exit(1);
}
const envoyer = options.includes("--envoyer");
const sortie = path.resolve("modpack-sortie");

const pack = JSON.parse(fs.readFileSync(path.join(source, "pack.json"), "utf8"));
for (const champ of ["minecraft", "forge"]) if (!pack[champ]) throw new Error(`pack.json : « ${champ} » manquant`);

function lister(dossier, base = dossier) {
  return fs.readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dossier, e.name);
    if (e.isDirectory()) return lister(p, base);
    const rel = path.relative(base, p).split(path.sep).join("/");
    return rel === "pack.json" || e.name.startsWith(".") ? [] : [rel];
  });
}

const fichiers = lister(source).map((rel) => {
  const octets = fs.readFileSync(path.join(source, rel));
  return { chemin: rel, sha1: createHash("sha1").update(octets).digest("hex"), taille: octets.length };
});
if (!fichiers.some((f) => f.chemin.startsWith("mods/"))) throw new Error("Aucun fichier dans mods/ : est-ce le bon dossier ?");

// Modrinth : quelles empreintes connaît-il ?
const jars = fichiers.filter((f) => f.chemin.endsWith(".jar")).map((f) => f.sha1);
const connus = {};
if (jars.length) {
  const r = await fetch("https://api.modrinth.com/v2/version_files", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "LostIslandLauncher/publier-modpack" },
    body: JSON.stringify({ hashes: jars, algorithm: "sha1" }),
  });
  if (!r.ok) throw new Error(`Modrinth répond ${r.status}`);
  for (const [sha, version] of Object.entries(await r.json())) {
    const f = version.files.find((x) => x.hashes.sha1 === sha);
    if (f) connus[sha] = f.url;
  }
}

const optionnelDe = {};
for (const o of pack.optionnels ?? []) for (const c of o.fichiers ?? []) optionnelDe[c] = o.id;
const garder = new Set(pack.garder ?? []);

fs.rmSync(sortie, { recursive: true, force: true });
fs.mkdirSync(path.join(sortie, "fichiers"), { recursive: true });
let heberges = 0;
const entrees = fichiers.map((f) => {
  let url = connus[f.sha1];
  if (!url) {
    const nom = `${f.sha1}${path.extname(f.chemin).toLowerCase()}`;
    fs.copyFileSync(path.join(source, f.chemin), path.join(sortie, "fichiers", nom));
    url = `${SITE}/launcher/fichiers/${nom}`;
    heberges++;
  }
  return { ...f, url, ...(optionnelDe[f.chemin] && { optionnel: optionnelDe[f.chemin] }), ...(garder.has(f.chemin) && { garder: true }) };
});

const maintenant = new Date();
const manifeste = {
  version: `${maintenant.toISOString().slice(0, 10)}-${maintenant.toISOString().slice(11, 16).replace(":", "")}`,
  minecraft: pack.minecraft,
  forge: pack.forge,
  ...(pack.serveur && { serveur: pack.serveur }),
  optionnels: (pack.optionnels ?? []).map(({ id, nom, description, defaut }) => ({ id, nom, description, defaut: !!defaut })),
  fichiers: entrees,
};
fs.writeFileSync(path.join(sortie, "manifest.json"), JSON.stringify(manifeste, null, 2));

const mo = (n) => (n / 1048576).toFixed(1);
const total = entrees.reduce((s, f) => s + f.taille, 0);
console.log(`Modpack ${manifeste.version} : ${entrees.length} fichiers, ${mo(total)} Mo.`);
console.log(`  ${entrees.length - heberges} chez Modrinth, ${heberges} hébergés par le site (modpack-sortie/fichiers).`);
for (const f of entrees.filter((x) => !connus[x.sha1])) console.log(`  hébergé : ${f.chemin}`);

if (envoyer) {
  const ssh = (cmd) => execFileSync("ssh", ["minipc", cmd], { stdio: "inherit" });
  ssh("New-Item -ItemType Directory -Force C:\\srv\\lostisland-site\\pack\\fichiers | Out-Null");
  if (heberges) execFileSync("scp", ["-q", ...fs.readdirSync(path.join(sortie, "fichiers")).map((n) => path.join(sortie, "fichiers", n)), "minipc:C:/srv/lostisland-site/pack/fichiers/"], { stdio: "inherit" });
  execFileSync("scp", ["-q", path.join(sortie, "manifest.json"), "minipc:C:/srv/lostisland-site/pack/manifest.json.tmp"], { stdio: "inherit" });
  ssh("Move-Item -Force C:\\srv\\lostisland-site\\pack\\manifest.json.tmp C:\\srv\\lostisland-site\\pack\\manifest.json");
  console.log(`Publié : ${SITE}/launcher/manifest.json`);
} else {
  console.log("Rien n'est envoyé. Relancez avec --envoyer pour publier sur le mini PC.");
}
