// Java 17 pour Minecraft 1.20.1 : le runtime officiel de Mojang (« java-runtime-gamma »), installé dans le
// dossier du jeu. Le joueur n'a rien à installer, et on n'utilise jamais un Java du système, de version inconnue.
const fs = require("node:fs");
const path = require("node:path");
const { JAVA_RUNTIMES, JAVA_COMPOSANT } = require("./config");
const { json, telechargerTout } = require("./telechargement");

function plateforme() {
  const a = process.arch;
  if (process.platform === "win32") return a === "arm64" ? "windows-arm64" : a === "ia32" ? "windows-x86" : "windows-x64";
  if (process.platform === "darwin") return a === "arm64" ? "mac-os-arm64" : "mac-os";
  return a === "ia32" ? "linux-i386" : "linux";
}

function executable(dossier) {
  if (process.platform === "win32") return path.join(dossier, "bin", "javaw.exe");
  if (process.platform === "darwin") return path.join(dossier, "jre.bundle", "Contents", "Home", "bin", "java");
  return path.join(dossier, "bin", "java");
}

async function installerJava(dossierJeu, { signal, progression }) {
  const dossier = path.join(dossierJeu, "runtime", JAVA_COMPOSANT);
  const tous = await json(JAVA_RUNTIMES, signal);
  const entree = tous[plateforme()]?.[JAVA_COMPOSANT]?.[0];
  if (!entree) throw new Error(`Java 17 n'est pas proposé par Mojang pour ce système (${plateforme()}).`);
  const liste = await json(entree.manifest.url, signal);

  const fichiers = [];
  const liens = [];
  for (const [rel, f] of Object.entries(liste.files)) {
    const cible = path.join(dossier, rel);
    if (f.type === "directory") fs.mkdirSync(cible, { recursive: true });
    else if (f.type === "file") {
      const brut = f.downloads.raw;
      fichiers.push({ url: brut.url, chemin: cible, sha1: brut.sha1, taille: brut.size, executable: f.executable });
    } else if (f.type === "link") liens.push([cible, f.target]);
  }
  await telechargerTout(fichiers, { signal, progression });
  // Liens symboliques du runtime macOS et Linux.
  for (const [cible, vers] of liens) {
    try {
      fs.rmSync(cible, { force: true });
      fs.symlinkSync(vers, cible);
    } catch {
      /* Windows n'a pas de liens dans ce runtime */
    }
  }
  const java = executable(dossier);
  if (!fs.existsSync(java)) throw new Error("Java installé mais introuvable. Réessayez ou changez de dossier du jeu.");
  return java;
}

module.exports = { installerJava };
