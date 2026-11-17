// Pont entre l'interface et le processus principal : seules ces fonctions sont exposées à la page.
const { contextBridge, ipcRenderer } = require("electron");

const appel = (canal) => (...args) => ipcRenderer.invoke(canal, ...args);
const ecoute = (canal) => (f) => {
  const h = (_e, d) => f(d);
  ipcRenderer.on(canal, h);
  return () => ipcRenderer.removeListener(canal, h);
};

contextBridge.exposeInMainWorld("li", {
  demarrage: appel("demarrage"),
  site: appel("site"),
  modpack: appel("modpack"),
  connexion: appel("connexion"),
  deconnexion: appel("deconnexion"),
  resterConnecte: appel("rester-connecte"),
  reglages: appel("reglages"),
  choisirDossier: appel("choisir-dossier"),
  verifierArgs: appel("verifier-args"),
  argsOptimises: appel("args-optimises"),
  lancer: appel("lancer"),
  annuler: appel("annuler"),
  quitterJeu: appel("quitter-jeu"),
  skin: appel("skin"),
  changerSkin: appel("changer-skin"),
  retirerSkin: appel("retirer-skin"),
  lien: appel("lien"),
  fenetre: appel("fenetre"),
  majVerifier: appel("maj-verifier"),
  majInstaller: appel("maj-installer"),
  surJeu: ecoute("jeu"),
  surMajProgression: ecoute("maj-progression"),
});
