# OCTORAIL

> *Huit voies. Huit mondes. Un seul réseau à rallumer.*

Jeu coop (1 à 8 joueurs) d'aventure ferroviaire et d'automatisation sur **Halcyre**, une planète-musée dont le réseau de trains en étoile, **L'Octave**, a déraillé. Chaque joueur a son train, une base partagée au centre (le Moyeu), et huit mondes absurdes à rallumer en ramenant chez eux les robots-gardiens perdus.

Game design complet : [`docs/GDD.md`](docs/GDD.md)

## Démo jouable (vertical slice)

- **Le Moyeu** : capsules cryo, Comptoir, Charbonnière, Château d'eau, Hall des trouvailles, 8 quais.
- **Poussière-sur-Rail** (western) : mesas, cactus, pépites d'Or-moteur qui fuient, ville avec cactus-automates pianistes.
- **Gelure** : la voie traverse un **tsunami gelé** ; cristaux de glace-mémoire qui rejouent des souvenirs ; froid (jauge de chaleur).
- Les 6 autres mondes sont visibles derrière des barrières (aperçus colorés).
- **Trains** : draisine à bras (il faut pomper !) → locomotive à vapeur (pelleter le charbon, gérer pression et eau), wagons modulaires, aiguillages, croisements labyrinthe entre l'Ouest et le Sud-Ouest.
- **Quête complète** : réveil → or → locomotive → ville → le Shérif-7 figé dans la glace → chalumeau + wagon-vitrine → retour au piédestal → cinématique → *1 / 8*.
- **Multijoueur** 1-8 par code de salon (WebSocket), progression partagée.
- **Audio 100 % procédural** : musique générative par monde, rythme lié à la vitesse du train, sifflet spatialisé, chuff de la vapeur.
- **VFX** : fumée, vapeur, étincelles de frein, neige, poussière, feux d'artifice, bloom, ciel shader.

Aucun asset externe : tout (modèles, textures, sons, musique) est généré par le code.

## Lancer

```bash
npm install
npm start          # build + serveur sur http://localhost:8787 (solo + multijoueur)
```

Développement : `npm run dev` (Vite, port 5173) + `npm run server` dans un autre terminal pour le multijoueur.

## Contrôles

| | |
|---|---|
| Souris | regarder (clic pour capturer) |
| ZQSD / WASD | marcher · en cabine : Z/W avancer, S reculer |
| Maj | courir |
| E | interagir / monter-descendre du train |
| F | pomper (draisine) · pelleter (vapeur) · maintenir : miner / faire fondre |
| A / D | aiguillage : bifurcation / tout droit |
| Espace | sauter · frein |
| H | sifflet |
| M | plan du réseau |

`?debug` dans l'URL donne 2000 crédits pour tester.

## Technique

Three.js + Vite, serveur Node (`ws`). Prévu : emballage Electron/Steamworks pour la version Steam.
