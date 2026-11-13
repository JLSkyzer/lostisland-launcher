// Téléchargement de fichiers vérifiés par SHA-1, en parallèle, avec progression en octets.
// Un fichier déjà présent et intact n'est pas retéléchargé ; un fichier abîmé est remplacé.
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { pipeline } = require("node:stream/promises");
const { Readable, Transform } = require("node:stream");

async function sha1(fichier) {
  const h = crypto.createHash("sha1");
  await pipeline(fs.createReadStream(fichier), h);
  return h.digest("hex");
}

async function intact(fichier, attendu, taille) {
  try {
    const st = await fs.promises.stat(fichier);
    if (taille != null && st.size !== taille) return false;
    return !attendu || (await sha1(fichier)) === attendu;
  } catch {
    return false;
  }
}

async function telechargerUn({ url, chemin, sha1: attendu, taille }, signal, surOctets, surTaille) {
  await fs.promises.mkdir(path.dirname(chemin), { recursive: true });
  const tmp = `${chemin}.part`;
  for (let essai = 1; ; essai++) {
    try {
      const r = await fetch(url, { signal, headers: { "User-Agent": "LostIslandLauncher" } });
      if (!r.ok || !r.body) throw new Error(`HTTP ${r.status} pour ${url}`);
      // Taille inconnue d'avance (installateur Forge) : celle annoncée par le serveur, une seule fois.
      if (taille == null && essai === 1) surTaille(Number(r.headers.get("content-length")) || 0);
      const h = crypto.createHash("sha1");
      const compteur = new Transform({
        transform(morceau, _e, suite) {
          h.update(morceau);
          surOctets(morceau.length);
          suite(null, morceau);
        },
      });
      await pipeline(Readable.fromWeb(r.body), compteur, fs.createWriteStream(tmp), { signal });
      const recu = h.digest("hex");
      if (attendu && recu !== attendu) throw new Error(`Empreinte inattendue pour ${path.basename(chemin)}`);
      await fs.promises.rename(tmp, chemin);
      return;
    } catch (e) {
      await fs.promises.rm(tmp, { force: true });
      if (signal?.aborted || essai >= 3) throw e;
      await new Promise((ok) => setTimeout(ok, 800 * essai));
    }
  }
}

/**
 * fichiers : [{ url, chemin, sha1, taille, executable? }]
 * progression(fait, total) en octets, sur les seuls fichiers à télécharger.
 */
async function telechargerTout(fichiers, { signal, progression = () => {}, paralleles = 6 } = {}) {
  const manquants = [];
  for (const f of fichiers) if (!(await intact(f.chemin, f.sha1, f.taille))) manquants.push(f);
  let total = manquants.reduce((s, f) => s + (f.taille ?? 0), 0);
  let fait = 0;
  progression(0, total);
  let i = 0;
  const ouvrier = async () => {
    while (i < manquants.length) {
      const f = manquants[i++];
      await telechargerUn(
        f,
        signal,
        (n) => {
          fait += n;
          progression(fait, total);
        },
        (n) => {
          total += n;
        },
      );
      if (f.executable && process.platform !== "win32") await fs.promises.chmod(f.chemin, 0o755);
    }
  };
  await Promise.all(Array.from({ length: Math.min(paralleles, manquants.length) }, ouvrier));
  return { telecharges: manquants.length, octets: total };
}

async function json(url, signal) {
  const r = await fetch(url, { signal, headers: { "User-Agent": "LostIslandLauncher", "Cache-Control": "no-cache" } });
  if (!r.ok) throw new Error(`HTTP ${r.status} pour ${url}`);
  return r.json();
}

module.exports = { telechargerTout, json, sha1, intact };
