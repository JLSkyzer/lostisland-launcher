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
| Forge | Fixée dans [`src/main/config.js`](src/main/config.js) : Minecraft 1.20.1, Forge 47.4.29 (dernière pour la 1.20.1 au 2026-11-13), installateur vérifié par SHA-1. |
| Contenu du jeu | Le manifeste `https://lostisland.eriniumlab.com/launcher/manifest.json`, calculé par le site à partir du dossier géré dans **Admin → Fichiers du jeu**. À chaque « Jouer », ce qui est nouveau ou modifié (empreinte SHA-1) est téléchargé ; ce qui a été retiré du site est supprimé, ainsi que tout jar de `mods/` absent du manifeste. |
| Mods optionnels | Chaque jar du dossier `optionalmod` du site apparaît dans la page « Mods optionnels », avec le nom et la description lus dans le mod. Activé, il est installé dans `mods/`. |
| Jeu | [minecraft-launcher-core](https://www.npmjs.com/package/minecraft-launcher-core) installe Minecraft et Forge, puis lance le jeu, connecté au serveur (« quick play ») à l'adresse réglée sur le site. |
| Skin | Le skin choisi devient celui du compte Minecraft, par l'API officielle de Minecraft. |
| Annonces, état du serveur | L'API publique du site (`/api/etat`). |
| Mises à jour du launcher | Proposées au démarrage : téléchargement, installation, fermeture et relance automatiques ([`src/main/maj.js`](src/main/maj.js)). Windows et Linux par electron-updater ; macOS par un remplacement maison de l'application, le système standard refusant une application non signée. |

Le dossier du jeu est `%APPDATA%\.lostisland` (Windows), `~/Library/Application Support/.lostisland` (macOS),
`~/.config/.lostisland` (Linux), modifiable dans les paramètres.

## Changer le contenu du jeu

Rien à faire dans ce dépôt : tout se passe dans l'administration du site, page **Fichiers du jeu**. La racine
y est l'intérieur de `.lostisland` (`mods` → dossier mods du joueur, `config` → config, etc.). Les mods
connus de Modrinth sont téléchargés chez Modrinth par les joueurs ; le reste part du site.

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
version GitHub. Au démarrage suivant, chaque launcher installé propose la mise à jour, la télécharge,
l'installe et se relance.

Les installateurs ne sont pas signés : Windows affiche « éditeur inconnu » au premier lancement, et macOS
demande d'ouvrir l'application par clic droit → Ouvrir (elle est signée « ad hoc », sans certificat Apple).
Sur macOS, le launcher doit être rangé dans Applications pour pouvoir se remplacer lors d'une mise à jour.
