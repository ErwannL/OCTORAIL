# OCTORAIL — Game Design Document v1

> *Huit voies. Huit mondes. Un seul réseau à rallumer.*

Statut : concept validé par l'utilisateur (2026-11-26). Document vivant.
Nom vérifié : aucun jeu « Octorail » trouvé (recherche web 2026-11-26). Alternatives en réserve : RAILOCTAVE, OCTAVE EXPRESS, HUIT VOIES.

---

## 1. Résumé

| | |
|---|---|
| Genre | Automatisation + aventure ferroviaire coop (« friendslop » avec profondeur) |
| Joueurs | 1 à 8, en ligne |
| Plateforme | PC (Steam), prototype web |
| Prix visé | 9,99 $ |
| Références | Satisfactory (usine), RV There Yet? (voyage chaotique), Unrailed! (rails), « Vide un désert » (progression satisfaisante, trouvailles, fin) |
| Promesse unique | Une base partagée au centre, 8 voies vers 8 mondes absurdes, chacun son train, et des voies qui se croisent : tu te balades tranquille et ton pote débarque à 200 km/h au croisement. |

---

## 2. Univers et lore

### La planète : HALCYRE
Une planète artificielle, construite pour être un musée/terrain d'essai par une civilisation disparue : **les Bâtisseurs**. Chaque « quartier » de la planète est un monde-test totalement différent (western, cyberpunk, glace…). Tout est relié par **L'Octave**, un réseau ferroviaire en étoile à 8 branches partant du **Moyeu**, la gare centrale.

### L'incident : « le Déraillement »
Un jour, le réseau a sauté. Les 8 robots-gardiens (un par monde) ont été **projetés dans le mauvais monde** : chacun s'est retrouvé coincé dans un biome qui n'est pas le sien. Sans leurs gardiens, les mondes ont dérivé, les voies se sont tordues, croisées, mélangées.

### Les joueurs
Des passagers réveillés de **capsules cryo** dans le Moyeu. Ils ne savent pas qui ils sont. Le Moyeu se rallume à peine. Objectif : réparer L'Octave, retrouver les 8 robots, les **ramener chez eux**.

### Le fil rouge (mystère)
Chaque robot rendu à son monde débloque un fragment de mémoire. Questions qui tiennent jusqu'à la fin :
- Pourquoi des humains dans des capsules sur une planète-musée ?
- Qui a provoqué le Déraillement ?
- **Révélation finale (proposition)** : les joueurs SONT les pièces d'exposition. Halcyre était un musée des « civilisations voyageuses » et les humains en capsule sont l'exposition principale : « Le dernier voyageur ». Les Bâtisseurs sont partis en laissant les robots s'occuper de la collection. Le Déraillement ? Les robots l'ont provoqué **exprès** : sans incident, les passagers ne se seraient jamais réveillés. Ils voulaient voir leur exposition… voyager. Fin : les 8 robots rentrés, la voie centrale s'ouvre vers le ciel → une 9e voie, la sortie de la planète (porte vers une suite / mode infini).

---

## 3. Structure du monde

```
              [N] Rails flottants
     [NO] Chronocline      [NE] Cyberpunk
[O] Western      ( MOYEU )      [E] Colosse
     [SO] Gelure           [SE] Souterrain toxique
              [S] Fonderie-Rêve
```

- Le **Moyeu** (base statique) est au centre.
- Chaque direction = un monde avec son identité visuelle, sonore, ses règles.
- Les voies **ne sont pas droites** : elles bifurquent, se croisent entre mondes voisins, fusionnent → **labyrinthe ferroviaire**. Un aiguillage peut t'envoyer du western au cyberpunk.
- Plus on s'éloigne du Moyeu, plus c'est dangereux, plus les ressources sont rares.

---

## 4. Les 8 mondes

Pour chaque monde : ambiance, règle spéciale (le « wtf »), ressource rare, danger, robot à trouver (venant d'un autre monde), robot-gardien du lieu (coincé ailleurs).

### 1. POUSSIÈRE-SUR-RAIL — Western (Ouest)
- **Ambiance** : canyons rouges, saloons, villes fantômes… peuplées de **cactus-automates** qui jouent du piano.
- **Règle wtf** : à midi pile, tout le monde (PNJ) se met en duel. Les trains doivent traverser les villes pendant que les automates sont distraits.
- **Ressource** : **Or-moteur** (pépites qui bougent toutes seules, il faut les attraper).
- **Danger** : bandits-locomotives (trains sauvages sans conducteur qui t'attaquent).
- **Gardien natif** : **SHÉRIF-7**, robot-cowboy en laiton à monocycle → coincé dans la Gelure.

### 2. NÉON-BAS — Cyberpunk (Nord-Est) — *idée utilisateur*
- **Ambiance** : mégapole verticale, pluie de néons, publicités holographiques qui te parlent.
- **Règle wtf** : **les voies se réorganisent la nuit** selon des algorithmes de trafic. Il faut « pirater » les aiguillages ou payer des péages.
- **Ressource** : **Puces-souvenir** (circuits contenant des fragments de mémoire).
- **Danger** : drones-péage, pannes de courant qui coupent les voies électriques.
- **Robot trouvé ici** : **BOBINE**, petit robot-compacteur à chenilles **à moitié cassé**, du Colosse, perdu dans une décharge de néons (conçu original : un cube à chenilles avec un seul œil-projecteur, qui garde des objets).

### 3. L'ARCHIPEL SUSPENDU — Rails flottants (Nord) — *idée utilisateur*
- **Ambiance** : îles qui flottent, cascades qui tombent vers le haut, rails suspendus dans les nuages.
- **Règle wtf** : **gravité capricieuse**. Sur certains tronçons, le train roule à l'envers sous la voie ; les objets mal attachés s'envolent.
- **Ressource** : **Plume-ferraille** (métal plus léger que l'air, sert aux wagons volants).
- **Danger** : vents qui détachent les wagons, rails qui dérivent (il faut les rattraper avec un grappin).
- **Robot trouvé ici** : **VERNIER**, horloger mécanique de la Chronocline, coincé **à l'envers sous une île**, il donne l'heure à l'envers.

### 4. LES ENTRAILLES — Souterrain toxique (Sud-Est) — *idée utilisateur*
- **Ambiance** : la surface est couverte d'un brouillard toxique violet → on passe **sous terre**. Grottes fluorescentes, champignons géants, rivières de boue chaude.
- **Règle wtf** : **on creuse ses propres tunnels** (façon Minecraft/Satisfactory). Le terrain est modifiable. Le brouillard remonte parfois → remonter vite.
- **Ressource** : **Mycélium-cuivre** (champignon conducteur d'électricité).
- **Danger** : air toxique (jauge de la tenue), effondrements, vers-foreuses.
- **Robot trouvé ici** : **PICO**, petit robot-astromécano rond de l'Archipel (original : une sphère avec hélice repliable et bras-outils), **coincé dans la boue**, son hélice tourne dans le vide.

### 5. GELURE — Glace (Sud-Ouest)
- **Ambiance** : un **tsunami gelé en plein déferlement**, vague de glace de 2 km de haut. Les voies passent DANS la vague.
- **Règle wtf** : la glace est **transparente** : on voit des choses figées dedans (bateaux, créatures, un autre train…). Faire fondre libère ce qu'il y a dedans, en bien ou en mal.
- **Ressource** : **Glace-mémoire** (glace qui rejoue des sons du passé quand on la fond).
- **Danger** : froid (tenue), fonte qui fait bouger la vague, craquements.
- **Robot trouvé ici** : **SHÉRIF-7** du western, **figé dans la glace en plein saut de monocycle**, chapeau encore en l'air.

### 6. LE COLOSSE — Créature géante (Est) — *carte blanche*
- **Ambiance** : la voie est posée **sur le dos d'une créature titanesque qui marche**. Forêts sur sa carapace, villages dans ses écailles.
- **Règle wtf** : **la carte bouge**. Le Colosse marche, se gratte, respire : les voies s'inclinent, se tordent. Quand il éternue, tout le monde s'accroche.
- **Ressource** : **Écaille-ambre** (carburant organique ultra-puissant).
- **Danger** : parasites géants, le Colosse se couche (voies submergées dans un lac).
- **Robot trouvé ici** : **AÉRO-9**, robot-sentinelle volant de Néon-Bas (original : drone-raie aux ailes en lames, phares en guise d'yeux) **pris dans le pelage**, il vole en rond comme une mouche.

### 7. CHRONOCLINE — Le temps détraqué (Nord-Ouest) — *carte blanche*
- **Ambiance** : jungle d'horloges géantes, engrenages, sablier-montagnes.
- **Règle wtf** : **le temps change par zone**. Zone rapide : jour/nuit toutes les 10 s, plantes qui poussent à vue d'œil. Zone lente : tout est au ralenti, y compris toi. Zone rembobinée : le train recule vers où il était 30 s avant.
- **Ressource** : **Secondes cristallisées** (accélèrent les machines du Moyeu).
- **Danger** : boucles temporelles (rejouer un tronçon jusqu'à le réussir), ton « toi du passé » qui bloque la voie.
- **Robot trouvé ici** : **MOUSSE**, robot-jardinier des Entrailles (original : champignon mécanique à pattes d'araignée) qui **a vieilli de 1000 ans en 3 secondes**, couvert de lierre.

### 8. FONDERIE-RÊVE — Le monde qui fond (Sud) — *carte blanche*
- **Ambiance** : un monde **fait de choses fondues** : montagnes de cire, rivières de chocolat-métal, villes en caramel. Ciel orange, lumière de bougie.
- **Règle wtf** : **la chaleur fait fondre le décor ET les rails**. Le jour tout fond, la nuit tout se refige… dans une nouvelle forme. La carte change chaque nuit.
- **Ressource** : **Cire-étoile** (matériau de construction moulable).
- **Danger** : rails ramollis, coulées, ton train qui fond si tu restes trop.
- **Robot trouvé ici** : **GIVRE**, robot-chasse-neige de Gelure (original : un grand robot-pelle à vapeur qui crache du froid), **à moitié fondu dans un lac de cire**, il essaie désespérément de tout refroidir.

### Les liens (le cycle des robots)
Chaque gardien est dans un mauvais monde → le ramener chez lui crée des allers-retours **à travers le labyrinthe**, oblige à croiser les autres joueurs, et donne des **interactions drôles** (Givre fond en Fonderie, Shérif-7 gelé, Pico embourbé…).

| Robot | Monde d'origine | Coincé dans |
|---|---|---|
| SHÉRIF-7 | Western | Gelure |
| BOBINE | Colosse | Néon-Bas |
| VERNIER | Chronocline | Archipel |
| PICO | Archipel | Entrailles |
| GIVRE | Gelure | Fonderie-Rêve |
| AÉRO-9 | Néon-Bas | Colosse |
| MOUSSE | Entrailles | Chronocline |
| CENDRE | Fonderie-Rêve | ??? (le 8e : introuvable → c'est lui le coupable/clé de la fin ; il est caché dans le Moyeu depuis le début) |

Note IP : designs **originaux**, pas de copies de R2-D2 / WALL-E (archétypes oui, formes et noms non).

---

## 5. Les boucles de jeu

### Boucle 30 secondes
Conduire, gérer la chaudière/le carburant, aiguiller, ramasser une ressource sur la voie, éviter un danger.

### Boucle 10 minutes (une expédition)
Partir du Moyeu → explorer une branche → récolter ressource rare / trouvaille → réparer une portion de voie → rentrer (ou poser une gare relais) → vendre/livrer → améliorer.

### Boucle 1-2 heures (une session)
Débloquer un nouveau monde, sauver un robot, monter un palier de la base, nouvelle locomotive.

### Boucle globale (~15-25 h)
Rallumer les 8 branches de L'Octave → ramener les 8 robots → fin.

---

## 6. Le Moyeu (base statique)

- **Produit les ressources de base** : charbon, pétrole, électricité, eau. Pas besoin d'expliquer d'où ils viennent : ce sont des **Constructeurs** des Bâtisseurs qu'on remet en route et qu'on améliore.
- **Usine façon Satisfactory** dans le Moyeu : convoyeurs, transformateurs, assembleurs, stockage. Les ressources rares des mondes servent à fabriquer pièces, wagons, améliorations.
- **Gares de départ** : 8 quais, un par direction.
- **Hall des trouvailles** : vitrine où apparaissent les objets trouvés (leçon « Vide un désert » : voir sa collection physiquement).
- **Hall des robots** : les robots ramenés reviennent visiter le Moyeu et donnent des bonus.
- **Paliers** : le Moyeu grandit visuellement (lumières qui se rallument, quais qui s'ouvrent) → satisfaction visible.

---

## 7. Les trains

### Locomotives (progression)
1. **Draisine à bras** (départ, 1 joueur pompe)
2. **Vapeur** : pelleter charbon + eau à la main → chaotique en coop
3. **Diesel** : réservoir, moins de corvée, plus de vitesse
4. **Électrique** : nécessite des voies électrifiées (on les construit)
5. **Loco Bâtisseur** (fin de jeu) : propulsée par les 8 ressources rares

### Wagons (modulaires, on les ajoute)
- Wagon-charbon/réservoir, wagon-stockage, wagon-atelier (fabriquer en roulant), wagon-foreuse (récolte en roulant), wagon-grue, wagon-dortoir (point de respawn), wagon-serre, wagon-tourelle (défense), wagon-vitrine (transporter un robot), wagon-ballon (Archipel), wagon-isotherme (Gelure/Fonderie), wagon-pirate (Néon-Bas)…
- **Physique** : trop de wagons en montée → décrochage, wagons qui dévalent, poursuite. Chargement mal équilibré → déraillement. (Clips viraux.)

### Voies
- On répare, pose, électrifie, et **construit des aiguillages**.
- **Gares relais** : poser des mini-gares loin du Moyeu pour ne pas revenir à chaque fois (leçon « entonnoirs reliés » de Vide un désert).

---

## 8. Multijoueur (1 à 8)

- **Chacun son train**, une base partagée. On peut aussi monter à plusieurs dans un même train.
- **Croisements** = moment phare :
  - échanger des wagons ou ressources au vol (couplage en marche !)
  - course jusqu'à la gare suivante
  - **aiguiller le pote** vers un autre monde (troll)
  - collision possible (mode chaos activable)
- **Rôles naturels** : chauffeur, mécano, éclaireur à pied, ingénieur au Moyeu.
- **Chat vocal de proximité** (comme RV There Yet? / R.E.P.O.) : on entend son pote quand les trains se croisent → effet Doppler drôle.
- **Solo** : wagons-robots automatisés compensent.

---

## 9. Le joueur et sa tenue

- **Combinaison modulaire** améliorable : isolation (Gelure), filtre (Entrailles), refroidissement (Fonderie), aimants (Archipel), brouilleur (Néon-Bas), stabilisateur temporel (Chronocline)…
- **Outils** (progression absurde à la « Vide un désert ») : pelle → pioche → grappin → foreuse portative → canon à vapeur → gant tracteur…
- Pas de combat complexe : on évite, on repousse, on fuit.

---

## 10. Anti-répétition (leçons de la vidéo Aywen)

- **Trouvailles** enfouies/cachées dans chaque monde + **radar** → collection dans le Hall.
- **Commandes** des robots et habitants (« apporte-moi 20 glaces-mémoire ») → récompenses, choix de cadeau.
- **Événements aléatoires** : train fantôme, pluie de météorites, éternuement du Colosse, panne générale de Néon-Bas, tempête temporelle.
- **Arbre de recherche** alimenté par les ressources rares.
- Pas de mini-jeux hors sujet.
- **Fin** spectaculaire et émotionnelle.

---

## 11. Direction artistique

- **Style** : stylisé, low-poly propre, couleurs fortes **par monde** (chaque direction a sa palette dominante : rouge western, magenta néon, bleu ciel archipel, violet toxique, cyan glace, vert-ambre colosse, or chrono, orange fonderie).
- **Moyeu** : laiton, verre, lumières chaudes qui se rallument.
- **VFX** : vapeur, étincelles sur les rails, néons, poussière, givre, distorsion temporelle, gravité (objets qui flottent), bloom et post-traitement.
- **UI** : style « billets de train » et plans de réseau (carte façon plan de métro qui se dévoile).

## 12. Son et musique

- **Musique adaptative** : un thème principal décliné dans le style de chaque monde (banjo western, synthwave néon, cordes aériennes, basses souterraines, cristal glacé, percussions organiques, tic-tac chrono, orgue fondu).
- **Le train = instrument** : le rythme des roues suit le tempo, la vitesse fait monter l'intensité.
- **Sons croisement** : sifflets personnalisables, effet Doppler.
- Robots : langage de bips propre à chacun.
- Pas de voix générées (retour négatif de la vidéo) → bulles + bips.

---

## 13. Monétisation et lancement

- Prix 9,99 $, pas de microtransactions.
- Démo Steam (Moyeu + Western + 1 robot) pour Steam Next Fest.
- Marketing : clips de croisements, déraillements, Colosse qui éternue → TikTok / streamers.
- Pack 4 joueurs (achat groupé).

---

## 14. Périmètre du prototype (vertical slice)

**Objectif** : prouver le fun en 1 session de 30-45 min.
- Moyeu avec 3 constructeurs + convoyeurs basiques
- 2 mondes : **Western** et **Gelure** (+ un croisement entre les deux)
- Locos : draisine → vapeur
- 5 wagons
- 1 robot à sauver : SHÉRIF-7 (dans la glace → à ramener au western)
- Multijoueur 2-4 joueurs
- Tenue niveau 1, 4 outils
- Musique et sons de base, VFX principaux

## 15. Questions ouvertes
- Moteur : Unity / Godot / web (Three.js) ? → à décider avec le repo du jeu.
- Durée de la fin de jeu / mode infini (9e voie, génération procédurale) ?
- Monde persistant (serveur dédié) ou hébergé par un joueur ?
