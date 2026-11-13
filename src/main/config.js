// Ce qui est fixe pour tout le monde. Le contenu du jeu (mods, configs, mods optionnels) vient du site :
// Admin → Fichiers du jeu, lu par le launcher dans /launcher/manifest.json.
const SITE = "https://lostisland.eriniumlab.com";

module.exports = {
  SITE,
  MANIFESTE: `${SITE}/launcher/manifest.json`,
  // Version du jeu du serveur : Minecraft 1.20.1, dernière Forge pour la 1.20.1 (promotions de Forge, 2026-11-13).
  MINECRAFT: "1.20.1",
  FORGE: "47.4.29",
  FORGE_SHA1: "5061de68499474cc8eeeede3d794afb063dd3e6d", // installateur, d'après le .sha1 du dépôt Maven de Forge
  FORGE_MAVEN: "https://maven.minecraftforge.net/net/minecraftforge/forge",
  // Java 17 officiel de Mojang (le même que le launcher Minecraft), servi fichier par fichier avec leur SHA-1.
  JAVA_RUNTIMES: "https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json",
  JAVA_COMPOSANT: "java-runtime-gamma",
  // Versions du launcher : dépôt public, construites par sa CI.
  DEPOT: { owner: "JLSkyzer", repo: "lostisland-launcher" },
};
