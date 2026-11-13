// Adresses fixes du launcher. Le reste (version de Forge, mods, serveur) vient du manifeste du modpack.
const SITE = "https://lostisland.eriniumlab.com";

module.exports = {
  SITE,
  MANIFESTE: `${SITE}/launcher/manifest.json`,
  // Java 17 officiel de Mojang (le même que le launcher Minecraft), servi fichier par fichier avec leur SHA-1.
  JAVA_RUNTIMES: "https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json",
  JAVA_COMPOSANT: "java-runtime-gamma",
  FORGE_MAVEN: "https://maven.minecraftforge.net/net/minecraftforge/forge",
};
