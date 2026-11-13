// Compte Microsoft / Minecraft, par msmc : fenêtre de connexion officielle de Microsoft, jeton de reconnexion
// gardé chiffré si le joueur choisit de rester connecté.
const { Auth } = require("msmc");
const stockage = require("./stockage");

let mc = null; // objet Minecraft de msmc (jeton du jeu + profil)
let jetonRefresh = null;

const profil = () => (mc?.profile ? { nom: mc.profile.name, uuid: mc.profile.id, skin: skinActif() } : null);

function skinActif() {
  const s = mc?.profile?.skins?.find((x) => x.state === "ACTIVE");
  return s ? { url: s.url, modele: s.variant === "SLIM" ? "slim" : "classic" } : null;
}

function messageErreur(e) {
  const t = String(e?.message ?? e ?? "");
  if (/error\.gui\.closed|closed/i.test(t)) return "Connexion annulée.";
  if (/error\.auth\.minecraft\.profile|profile|NOT_FOUND/i.test(t) || /entitlement/i.test(t)) {
    return "Ce compte Microsoft ne possède pas Minecraft Java. Connectez-vous avec un autre compte.";
  }
  if (/fetch|network|ENOTFOUND|ECONN/i.test(t)) return "Impossible de joindre Microsoft. Vérifiez votre connexion.";
  return "La connexion Microsoft a échoué. Réessayez.";
}

async function finir(xbox) {
  const jeu = await xbox.getMinecraft();
  if (jeu.isDemo()) throw new Error("entitlement");
  mc = jeu;
  jetonRefresh = xbox.save();
  if (stockage.lire().rester) stockage.garderJeton(jetonRefresh);
  return profil();
}

async function connecter() {
  try {
    const xbox = await new Auth("select_account").launch("electron", { width: 520, height: 680, resizable: false, title: "Connexion Microsoft" });
    return { ok: true, profil: await finir(xbox) };
  } catch (e) {
    return { ok: false, erreur: messageErreur(e) };
  }
}

// Reconnexion silencieuse au démarrage, si le joueur avait choisi de rester connecté.
async function reprendre() {
  const j = stockage.jetonGarde();
  if (!j) return null;
  try {
    return await finir(await new Auth("select_account").refresh(j));
  } catch {
    stockage.garderJeton(null);
    return null;
  }
}

function deconnecter() {
  mc = null;
  jetonRefresh = null;
  stockage.garderJeton(null);
}

function choisirResterConnecte(rester) {
  stockage.ecrire({ rester });
  stockage.garderJeton(rester ? jetonRefresh : null);
}

// Jeton frais pour lancer le jeu (renouvelé s'il a expiré pendant que le launcher était ouvert).
async function utilisateurMclc() {
  if (!mc) throw new Error("Vous n'êtes plus connecté. Reconnectez-vous avec Microsoft.");
  if (!mc.validate()) {
    const xbox = await new Auth("select_account").refresh(jetonRefresh);
    await finir(xbox);
  }
  return mc.mclc();
}

/* Skin : l'API officielle de Minecraft change le skin du compte, visible partout (serveur compris). */

async function skinEnDataUrl() {
  const s = skinActif();
  if (!s) return null;
  const r = await fetch(s.url);
  if (!r.ok) return null;
  return { dataUrl: `data:image/png;base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`, modele: s.modele };
}

async function changerSkin(png, modele) {
  if (!mc) throw new Error("Connectez-vous d'abord.");
  if (!(png instanceof Uint8Array) || png.length > 24 * 1024) throw new Error("Le skin doit être un PNG de 24 Ko au plus.");
  const corps = new FormData();
  corps.append("variant", modele === "slim" ? "slim" : "classic");
  corps.append("file", new Blob([png], { type: "image/png" }), "skin.png");
  const r = await fetch("https://api.minecraftservices.com/minecraft/profile/skins", {
    method: "POST",
    headers: { Authorization: `Bearer ${mc.mcToken}` },
    body: corps,
  });
  if (!r.ok) throw new Error(r.status === 400 ? "Minecraft refuse ce fichier : il faut un skin PNG de 64 × 64 ou 64 × 32." : `Minecraft refuse le skin (${r.status}).`);
  const nouveau = await r.json();
  if (mc.profile) mc.profile.skins = nouveau.skins;
}

async function retirerSkin() {
  if (!mc) throw new Error("Connectez-vous d'abord.");
  const r = await fetch("https://api.minecraftservices.com/minecraft/profile/skins/active", {
    method: "DELETE",
    headers: { Authorization: `Bearer ${mc.mcToken}` },
  });
  if (!r.ok) throw new Error(`Minecraft refuse de rétablir le skin d'origine (${r.status}).`);
  const nouveau = await r.json();
  if (mc.profile) mc.profile.skins = nouveau.skins;
}

module.exports = { connecter, reprendre, deconnecter, choisirResterConnecte, utilisateurMclc, profil, skinEnDataUrl, changerSkin, retirerSkin };
