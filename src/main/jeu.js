// Préparation et lancement du jeu : Java → installateur Forge → modpack → Minecraft et Forge (MCLC) → jeu.
// Chaque étape rapporte sa progression ; « Annuler » coupe les téléchargements en cours.
const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("minecraft-launcher-core");
const { FORGE, FORGE_MAVEN, FORGE_SHA1, MINECRAFT } = require("./config");
const { installerJava } = require("./java");
const { lireManifeste, synchroniser } = require("./modpack");
const { telechargerTout } = require("./telechargement");
const compte = require("./compte");
const stockage = require("./stockage");
const { argumentsJava } = require("./arguments");

let controle = null; // AbortController de la préparation en cours
let processus = null; // processus Java du jeu

const enCours = () => !!controle || !!processus;

function mo(octets) {
  return (octets / 1048576).toFixed(1).replace(".", ",");
}

/**
 * envoyer(evenement) : { phase, pct, detail } pendant la préparation,
 * puis { etat: "lance" }, { etat: "ferme", code }, { etat: "erreur", message, pct }.
 */
async function lancer(envoyer) {
  if (enCours()) return;
  controle = new AbortController();
  const signal = controle.signal;
  let pct = 0;
  const etape = (phase, de, a) => (fait, total, detail) => {
    pct = total ? de + ((a - de) * fait) / total : de;
    envoyer({ phase, pct, detail: detail ?? (total ? `${mo(fait)} Mo sur ${mo(total)} Mo` : "") });
  };

  try {
    const r = stockage.lire();
    const dossier = stockage.dossierJeu();
    fs.mkdirSync(dossier, { recursive: true });
    // Jamais plus que la mémoire réelle du PC (un réglage peut venir d'un autre PC ou d'une ancienne version).
    const ram = Math.min(r.ram, stockage.ramPc());
    const java_args = argumentsJava({ optimises: r.argsOptimises, libres: r.argsJava });

    etape("Préparation", 0, 4)(0, 0, `${ram} Go de mémoire alloués${r.argsOptimises ? ", arguments optimisés" : ""}`);
    const m = await lireManifeste(signal);

    const java = await installerJava(dossier, { signal, progression: etape("Installation de Java", 4, 22) });

    const forgeId = `${MINECRAFT}-${FORGE}`;
    const installeur = path.join(dossier, "installeurs", `forge-${forgeId}-installer.jar`);
    await telechargerTout(
      [{ url: `${FORGE_MAVEN}/${forgeId}/forge-${forgeId}-installer.jar`, chemin: installeur, sha1: FORGE_SHA1, taille: null }],
      { signal, progression: etape("Téléchargement de Forge", 22, 28) },
    );

    const synchro = await synchroniser(dossier, m, r.optionnels, { signal, progression: etape("Téléchargement du modpack", 28, 82) });
    etape("Mise en place des mods", 82, 84)(0, 0, `${synchro.mods} mods${synchro.retires ? `, ${synchro.retires} retirés` : ""}`);

    const utilisateur = await compte.utilisateurMclc();
    if (signal.aborted) throw new Error("annulé");

    const client = new Client();
    let journal = [];
    client.on("progress", (e) => {
      if (e?.total) etape("Installation de Minecraft et Forge", 84, 99)(e.task, e.total, `${e.type} : ${e.task} sur ${e.total}`);
    });
    client.on("debug", (l) => {
      journal.push(String(l));
      if (journal.length > 200) journal = journal.slice(-200);
    });
    client.on("data", (l) => {
      journal.push(String(l));
      if (journal.length > 200) journal = journal.slice(-200);
    });

    const enfant = await client.launch({
      root: dossier,
      authorization: utilisateur,
      javaPath: java,
      forge: installeur,
      version: { number: MINECRAFT, type: "release" },
      // Avec les arguments optimisés : minimum = maximum (conseil de la référence), sauf sur un PC de moins de 16 Go
      // où le jeu occuperait presque toute la mémoire dès le démarrage.
      memory: { max: `${ram}G`, min: r.argsOptimises && stockage.ramPc() >= 16 ? `${ram}G` : "2G" },
      customArgs: java_args.args,
    });
    if (!enfant) throw new Error(dernierProbleme(journal) ?? "Minecraft n'a pas pu démarrer.");

    controle = null;
    processus = enfant;
    envoyer({ phase: "Démarrage de Minecraft", pct: 100, detail: "" });
    envoyer({ etat: "lance" });
    enfant.on("close", (code) => {
      processus = null;
      envoyer({ etat: "ferme", code, journal: code ? journal.slice(-30).join("\n") : undefined });
    });
  } catch (e) {
    const annule = signal.aborted;
    controle = null;
    envoyer(annule ? { etat: "annule" } : { etat: "erreur", pct, message: messageErreur(e) });
  }
}

function dernierProbleme(journal) {
  const l = [...journal].reverse().find((x) => /error|exception|failed/i.test(x));
  return l ? `Minecraft n'a pas pu démarrer : ${l.slice(0, 200)}` : null;
}

function messageErreur(e) {
  const t = String(e?.message ?? e);
  if (/fetch failed|ENOTFOUND|ECONNRESET|ETIMEDOUT|network/i.test(t)) return "Le téléchargement a été interrompu. Vérifiez votre connexion, puis relancez.";
  if (/ENOSPC/.test(t)) return "Plus de place sur le disque. Libérez de l'espace ou changez de dossier du jeu.";
  if (/EPERM|EACCES/.test(t)) return "Le launcher n'a pas le droit d'écrire dans le dossier du jeu. Choisissez-en un autre dans les paramètres.";
  return t;
}

function annuler() {
  controle?.abort();
}

function quitterJeu() {
  processus?.kill();
}

module.exports = { lancer, annuler, quitterJeu, enCours };
