# Lost Island Launcher

Launcher du serveur Minecraft roleplay **Lost Island RP** (Forge 1.20.1). Il connecte le compte Microsoft,
installe Java, Minecraft, Forge et le modpack du serveur, les tient à jour, puis lance le jeu directement sur
le serveur.

Téléchargement : [dernière version](https://github.com/JLSkyzer/lostisland-launcher/releases/latest), ou la
page « Télécharger » du site https://lostisland.eriniumlab.com.

## Ce qu'il fait

| Étape | Comment |
|---|---|
| Connexion | Compte Microsoft par la fenêtre officielle de Microsoft ([msmc](https://www.npmjs.com/package/msmc)). « Rester connecté » garde le jeton de reconnexion, chiffré par le système (`safeStorage`). |
| Java | Java 17 officiel de Mojang (`java-runtime-gamma`), installé dans le dossier du jeu, fichier par fichier, vérifié par SHA-1. |
| Forge | L'installateur Forge de la version du manifeste, depuis le dépôt Maven de Forge. |
| Modpack | Le manifeste `https://lostisland.eriniumlab.com/launcher/manifest.json` : chaque fichier avec son SHA-1. Seul ce qui manque ou a changé est téléchargé ; un jar de `mods/` absent du manifeste est retiré. |
| Jeu | [minecraft-launcher-core](https://www.npmjs.com/package/minecraft-launcher-core) installe Minecraft et Forge, puis lance le jeu, connecté au serveur (« quick play »). |
| Skin | Le skin choisi devient celui du compte Minecraft, par l'API officielle de Minecraft. |
| Annonces, état du serveur | L'API publique du site (`/api/etat`). |
| Mises à jour du launcher | `electron-updater`, depuis les versions publiées dans ce dépôt. |

Le dossier du jeu est `%APPDATA%\.lostisland` (Windows), `~/Library/Application Support/.lostisland` (macOS),
`~/.config/.lostisland` (Linux), modifiable dans les paramètres.

## Publier le modpack

Le modpack ne vit pas dans ce dépôt. On le prépare dans un dossier rangé comme le dossier du jeu, avec un
`pack.json` (format en tête de [`outils/publier-modpack.mjs`](outils/publier-modpack.mjs)), puis :

```bash
node outils/publier-modpack.mjs <dossier-du-pack>              # prépare et affiche le résumé
node outils/publier-modpack.mjs <dossier-du-pack> --envoyer    # publie sur le mini PC
```

Les mods présents sur Modrinth (reconnus par leur SHA-1) sont téléchargés chez Modrinth par les joueurs ; on
ne redistribue que ce qui n'y est pas. Les joueurs reçoivent la nouvelle version au prochain clic sur « Jouer ».

## Développer

```bash
npm install
npm start
```

Variables d'essai, ignorées dans le launcher installé : `LI_ESSAI_PROFIL=Pseudo` montre l'écran principal
sans se connecter ; `LI_CAPTURE=fichier.png` (avec `LI_CAPTURE_MS`) photographie la fenêtre puis quitte.

## Publier une version du launcher

Changer `version` dans `package.json`, commiter, puis pousser un tag :

```bash
git tag v0.1.0 && git push origin v0.1.0
```

La CI construit Windows (installateur NSIS), macOS (dmg, zip) et Linux (AppImage), et les publie dans une
version GitHub. Les launchers installés la téléchargent seuls et proposent de redémarrer.

Les installateurs ne sont pas signés : Windows affiche « éditeur inconnu » au premier lancement, et macOS
demande d'ouvrir l'application par clic droit → Ouvrir. La mise à jour automatique ne fonctionne pas sur
macOS sans signature.
