# 🎮 ZherPad

**Diagnostic complet et validation de manette PS5 DualSense / DualSense Edge, directement dans le navigateur.**
Rien à installer, aucune donnée envoyée sur internet, lecture seule (aucune écriture firmware ni calibration).

👉 **En ligne :** https://anzher44.github.io/zherpad/

## Pourquoi ZherPad ?

Les autres testeurs montrent les touches. ZherPad **lit tout ce que la manette sait d'elle-même** et rend un **verdict** avec rapport PDF :

| | ZherPad | Testeurs classiques |
|---|:-:|:-:|
| Test touches, sticks, gâchettes, pavé, gyroscope | ✔ | ✔ |
| Vibrations, gâchettes adaptatives, LED, haut-parleur, micro | ✔ | partiel |
| **Infos usine** : n° de série, couleur/édition, carte mère (BDM), codes-barres batterie et moteurs | ✔ | rare |
| **Historique d'usage** enregistré dans la manette : heures d'utilisation, charges, appuis par bouton, connexions, erreurs | ✔ | rare |
| **Détection de contrefaçon** | ✔ | rare |
| Dérive + **bruit + zone morte conseillée**, **retour au centre** des sticks | ✔ | ✘ |
| **Validation guidée (21 tests)** → VALIDÉE / NON VALIDÉE + **rapport PDF/JSON** | ✔ | ✘ |
| Reconnaît une manette **déjà testée** (historique par n° de série) | ✔ | ✘ |
| Fonctionne **hors ligne** (installable comme application) | ✔ | variable |

## Les 21 tests de validation

| # | Test | Critère |
|---|------|---------|
| 1 | Communication & identité | rapports reçus, firmware, MAC, calibration lisibles |
| 2 | Authenticité & infos usine | aucun signe de contrefaçon, n° de série lisible |
| 3 | Batterie & charge | pas d'erreur ; en USB la manette doit charger |
| 4 | Tous les boutons | chaque bouton pressé puis relâché (19, ou 23 pour l'Edge) |
| 5 | Dérive des sticks | écart au repos ≤ 10 %, bruit ≤ 2,5 + zone morte conseillée |
| 6 | Amplitude & circularité | butées atteintes, contour ≥ 90 %, erreur < 15 % |
| 7 | Retour au centre | 5 lâchers par stick : retour ≤ 10 %, rebond médian < 18 % |
| 8 | Gâchettes L2/R2 | course 0 → ≥ 250, retour ≤ 5, bit numérique cohérent |
| 9 | Pavé tactile | ≥ 95 % de surface + 2 doigts simultanés |
| 10 | Capteurs au repos | gyro < 3 °/s, bruit < 2 °/s, gravité 0,9–1,1 g |
| 11 | Capteurs en mouvement | chaque axe gyro > 150 °/s, chaque axe accéléro ±0,7 g |
| 12–13 | Vibrations G / D | confirmation opérateur |
| 14–15 | Gâchettes adaptatives L2 / R2 | confirmation opérateur |
| 16–18 | Barre lumineuse, LED joueur, LED micro | confirmation opérateur |
| 19–21 | Haut-parleur, micro, prise jack | optionnels (USB) |

## Utilisation

1. Ouvrir le site dans **Google Chrome** ou **Microsoft Edge** sur ordinateur (WebHID ; Firefox/Safari non compatibles).
2. Brancher la manette en **USB** (recommandé : infos usine complètes et tests audio) ou en Bluetooth.
3. **Connecter la manette** → choisir « DualSense Wireless Controller ».
4. Onglet **Infos** : identité, infos usine, historique d'usage. Onglet **Validation** : lancer les tests → **Rapport PDF**.

## Sécurité

- Tout se passe dans le navigateur, **aucune requête réseau**.
- **Lecture seule** : seules des commandes de lecture usine (READ/GET) et les sorties standard (LED, vibrations, gâchettes) sont envoyées. Aucune écriture de calibration ni de firmware.

## Développement

- `dualsense.js` : protocole HID (entrées USB 0x01 / BT 0x31, feature reports 0x05 / 0x09 / 0x20, commandes usine 0x80→0x81, télémétrie 0x70, sortie avec CRC32 en Bluetooth, effets de gâchettes)
- `app.js` : interface, tests, rapports ; `style.css` : thème clair/sombre ; `sw.js` + `manifest.webmanifest` : hors ligne
- `test/mock-test.js` : test automatisé avec une manette simulée (Playwright) : `node test/mock-test.js`

Crédits et licences tierces : voir [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Licence MIT.
