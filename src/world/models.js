import * as THREE from 'three';
import { Kit, MAT, G, mat } from './kit.js';
import { saguaroGeometry } from './flora.js';

const PI = Math.PI, H = PI / 2;

// Véhicules (loco, draisine, wagons, roues) -> vehicles.js ; personnages (passager, SHÉRIF-7) -> characters.js
export * from './vehicles.js';
export * from './characters.js';

// ------------------------------------------------------------------ Décor
export function cactusGeometry(variant = 0) { return saguaroGeometry(variant); } // modèle détaillé dans flora.js (couleurs de sommets)
