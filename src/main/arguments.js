// Arguments Java du jeu : le jeu d'arguments « optimisés » et les arguments libres saisis par le joueur.
//
// DÉSACTIVÉ PAR DÉFAUT depuis la 0.2.7. Activé par défaut jusqu'à la 0.2.6, il faisait la seule différence avec
// CurseForge, où les mêmes joueurs, même modpack, n'ont pas de micro-saccades : CurseForge lance Java avec
// -Xmx, -Xms256m, -Xss1M et rien d'autre (rapports de plantage des deux lanceurs, 18/11/2026). La référence
// elle-même juge les jeux G1 de type Aikar mauvais pour un client et conseille Shenandoah côté client. Ne pas le
// réactiver par défaut sans mesure en jeu (Spark : /sparkc gcmonitor) des deux configurations.
//
// Arguments optimisés : « Base Java Flags » + jeu G1GC de brucethemoose
// (github.com/brucethemoose/Minecraft-Performance-Flags-Benchmarks), G1GC étant conseillé pour les PC avec peu de
// mémoire ou peu de cœurs. Retirés volontairement : AlwaysPreTouch (réserve toute la mémoire au démarrage, pénible
// sur 8 Go), UseLargePages (privilège Windows requis, sinon avertissement), ThreadPriorityPolicy=1 (droits root
// sous Linux), UseNUMA (sans effet sur un PC de bureau). Tous vérifiés acceptés par le Java 17 du jeu
// (Microsoft OpenJDK 17.0.15, -XX:+PrintFlagsFinal, 18/11/2026) : un seul argument inconnu empêcherait Minecraft
// de démarrer.

const OPTIMISES = [
  "-XX:+UnlockExperimentalVMOptions",
  "-XX:+UnlockDiagnosticVMOptions",
  "-XX:+AlwaysActAsServerClassMachine",
  "-XX:+DisableExplicitGC",
  "-XX:NmethodSweepActivity=1",
  "-XX:ReservedCodeCacheSize=400M",
  "-XX:NonNMethodCodeHeapSize=12M",
  "-XX:ProfiledCodeHeapSize=194M",
  "-XX:NonProfiledCodeHeapSize=194M",
  "-XX:-DontCompileHugeMethods",
  "-XX:MaxNodeLimit=240000",
  "-XX:NodeLimitFudgeFactor=8000",
  "-XX:+UseVectorCmov",
  "-XX:+PerfDisableSharedMem",
  "-XX:+UseFastUnorderedTimeStamps",
  "-XX:+UseCriticalJavaThreadPriority",
  "-XX:AllocatePrefetchStyle=3",
  "-XX:+UseG1GC",
  "-XX:MaxGCPauseMillis=37",
  "-XX:G1HeapRegionSize=16M",
  "-XX:G1NewSizePercent=23",
  "-XX:G1ReservePercent=20",
  "-XX:SurvivorRatio=32",
  "-XX:G1MixedGCCountTarget=3",
  "-XX:G1HeapWastePercent=20",
  "-XX:InitiatingHeapOccupancyPercent=10",
  "-XX:G1RSetUpdatingPauseTimePercent=0",
  "-XX:MaxTenuringThreshold=1",
  "-XX:G1SATBBufferEnqueueingThresholdPercent=30",
  "-XX:G1ConcMarkStepDurationMillis=5.0",
  "-XX:G1ConcRSHotCardLimit=16",
  "-XX:G1ConcRefinementServiceIntervalMillis=150",
  "-XX:GCTimeRatio=99",
];

const MAX_TEXTE = 2000;
const MAX_ARGS = 80;

// Arguments qui casseraient le lancement ou court-circuiteraient le launcher.
const INTERDITS = [
  [/^-Xm[sx]/i, "la mémoire se règle avec le curseur au-dessus"],
  [/^-(jar|cp|classpath|-class-path|-module-path|p)$/i, "le launcher choisit lui-même ce que Java charge"],
  [/^-javaagent:/i, "un agent Java n'est pas autorisé ici"],
  [/^-agent(lib|path):/i, "un agent natif n'est pas autorisé ici"],
];

// Découpe le texte saisi en arguments (espaces comme séparateurs, guillemets " ou ' pour un argument qui en
// contient). Renvoie aussi les erreurs lisibles ; un argument en erreur n'est jamais transmis.
function decouper(texte) {
  const erreurs = [];
  const args = [];
  const t = String(texte ?? "");
  if (t.length > MAX_TEXTE) return { args, erreurs: [`Texte trop long (${t.length} caractères, ${MAX_TEXTE} au plus).`] };
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(t)) return { args, erreurs: ["Le texte contient des caractères invisibles."] };
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(t))) {
    const a = m[1] ?? m[2] ?? m[3];
    if (!a) continue;
    if (!a.startsWith("-")) { erreurs.push(`« ${a} » : un argument Java commence par un tiret.`); continue; }
    const interdit = INTERDITS.find(([motif]) => motif.test(a));
    if (interdit) { erreurs.push(`« ${a} » : ${interdit[1]}.`); continue; }
    args.push(a);
  }
  if (args.length > MAX_ARGS) {
    erreurs.push(`Trop d'arguments (${args.length}, ${MAX_ARGS} au plus).`);
    args.length = MAX_ARGS;
  }
  return { args, erreurs };
}

// Arguments transmis à Java : les optimisés d'abord (si activés), puis ceux du joueur, qui l'emportent en cas de
// doublon (Java garde la dernière valeur d'un même réglage).
function argumentsJava({ optimises, libres }) {
  const { args, erreurs } = decouper(libres);
  return { args: [...(optimises ? OPTIMISES : []), ...args], erreurs };
}

module.exports = { OPTIMISES, MAX_TEXTE, decouper, argumentsJava };
