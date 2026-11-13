// Mise à jour du launcher depuis les versions publiées sur GitHub par la CI.
// Au démarrage, l'interface demande s'il y en a une ; si le joueur accepte : téléchargement, installation,
// fermeture et relance automatique.
//   - Windows (installateur NSIS) et Linux (AppImage) : electron-updater.
//   - macOS : le système de mise à jour standard (Squirrel) refuse une application non signée par Apple ; on
//     remplace donc nous-mêmes l'application : archive téléchargée et vérifiée (SHA-512 de latest-mac.yml),
//     décompressée, puis un petit script attend la fermeture du launcher, échange les deux applications et
//     relance la nouvelle.
const { app } = require("electron");
const { spawn, execFile } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pipeline } = require("node:stream/promises");
const { Readable, Transform } = require("node:stream");
const yaml = require("js-yaml");
const { autoUpdater } = require("electron-updater");
const { DEPOT } = require("./config");

const BASE = `https://github.com/${DEPOT.owner}/${DEPOT.repo}/releases/latest/download`;

// 1.10.0 > 1.9.3 : comparaison nombre par nombre.
function plusRecente(a, b) {
  const pa = String(a).split(".").map(Number);
  const pb = String(b).split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  }
  return false;
}

const prisEnCharge = () => app.isPackaged && (process.platform !== "linux" || !!process.env.APPIMAGE);

let infoMac = null;

async function verifier() {
  if (!prisEnCharge()) return null;
  try {
    if (process.platform === "darwin") {
      const r = await fetch(`${BASE}/latest-mac.yml`, { headers: { "User-Agent": "LostIslandLauncher" }, signal: AbortSignal.timeout(10000) });
      if (!r.ok) return null;
      const info = yaml.load(await r.text());
      const zip = info.files?.find((f) => f.url.endsWith(".zip"));
      if (!zip || !plusRecente(info.version, app.getVersion())) return null;
      infoMac = { version: info.version, url: `${BASE}/${zip.url}`, sha512: zip.sha512, taille: zip.size };
      return { version: info.version };
    }
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    const r = await autoUpdater.checkForUpdates();
    return r?.isUpdateAvailable ? { version: r.updateInfo.version } : null;
  } catch {
    return null; // hors ligne, GitHub indisponible : on joue avec la version actuelle
  }
}

async function installer(progression) {
  if (process.platform === "darwin") return installerMac(progression);
  autoUpdater.removeAllListeners("download-progress");
  autoUpdater.on("download-progress", (p) => progression(p.transferred, p.total));
  await autoUpdater.downloadUpdate();
  // Installation silencieuse, puis relance du launcher (isSilent, isForceRunAfter).
  // L'interface affiche d'abord ce qui va se passer ; puis fermeture, fenêtre de progression de l'installateur
  // (installateur « en un clic » : pas de question, une barre), et relance automatique.
  setTimeout(() => autoUpdater.quitAndInstall(false, true), 3500);
}

// Chemin du bundle .app en cours d'exécution (…/Lost Island Launcher.app/Contents/MacOS/Lost Island Launcher).
function bundleActuel() {
  return path.resolve(process.execPath, "..", "..", "..");
}

async function installerMac(progression) {
  if (!infoMac) throw new Error("Aucune mise à jour à installer.");
  const actuel = bundleActuel();
  if (!actuel.endsWith(".app")) throw new Error("Emplacement du launcher inattendu.");
  if (actuel.startsWith("/Volumes/") || actuel.includes("/AppTranslocation/")) {
    throw new Error("Glissez d'abord le launcher dans le dossier Applications : il ne peut pas se mettre à jour depuis l'image disque.");
  }
  try {
    fs.accessSync(path.dirname(actuel), fs.constants.W_OK);
  } catch {
    throw new Error("Le launcher n'a pas le droit de se remplacer dans ce dossier. Déplacez-le dans Applications.");
  }

  const travail = fs.mkdtempSync(path.join(os.tmpdir(), "lostisland-maj-"));
  const zip = path.join(travail, "launcher.zip");
  const r = await fetch(infoMac.url, { headers: { "User-Agent": "LostIslandLauncher" } });
  if (!r.ok || !r.body) throw new Error(`Téléchargement de la mise à jour impossible (${r.status}).`);
  const total = infoMac.taille || Number(r.headers.get("content-length")) || 0;
  const h = crypto.createHash("sha512");
  let fait = 0;
  await pipeline(
    Readable.fromWeb(r.body),
    new Transform({
      transform(m, _e, suite) {
        h.update(m);
        fait += m.length;
        progression(fait, total);
        suite(null, m);
      },
    }),
    fs.createWriteStream(zip),
  );
  if (h.digest("base64") !== infoMac.sha512) throw new Error("La mise à jour téléchargée est abîmée. Réessayez.");

  // ditto préserve les liens et les attributs du bundle, comme le fait le Finder.
  const extrait = path.join(travail, "extrait");
  await new Promise((ok, ko) => execFile("/usr/bin/ditto", ["-x", "-k", zip, extrait], (e) => (e ? ko(e) : ok())));
  const nouveau = fs.readdirSync(extrait).find((n) => n.endsWith(".app"));
  if (!nouveau) throw new Error("Archive de mise à jour sans application.");

  const script = path.join(travail, "remplacer.sh");
  const q = (s) => `'${s.replace(/'/g, `'\\''`)}'`;
  fs.writeFileSync(
    script,
    [
      "#!/bin/sh",
      `while kill -0 ${process.pid} 2>/dev/null; do sleep 0.3; done`,
      `rm -rf ${q(actuel)}`,
      `mv ${q(path.join(extrait, nouveau))} ${q(actuel)}`,
      `xattr -dr com.apple.quarantine ${q(actuel)} 2>/dev/null`,
      `open ${q(actuel)}`,
      `rm -rf ${q(travail)}`,
    ].join("\n"),
    { mode: 0o755 },
  );
  spawn("/bin/sh", [script], { detached: true, stdio: "ignore" }).unref();
  setTimeout(() => app.quit(), 3500);
}

module.exports = { verifier, installer, plusRecente };
