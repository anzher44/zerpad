# 🎮 Testeur DualSense (PS5)

Site web pour **tester et valider entièrement une manette PS5 DualSense / DualSense Edge**, directement dans le navigateur, sans rien installer.

👉 **Utilisation en ligne :** https://anzher44.github.io/dualsense-testerPS5/ (une fois GitHub Pages activé)

## Ce que l'outil fait

**Infos lues dans la manette**
- Modèle (DualSense / Edge), VID:PID, connexion USB ou Bluetooth
- Adresse MAC, version firmware, version de mise à jour, version matérielle, date de compilation du firmware
- Calibration usine du gyroscope / accéléromètre (et sa cohérence)
- Batterie (%), état de charge et erreurs de charge, prise jack, fréquence des rapports (Hz)

**Tests en direct** : boutons, sticks (trace, contour, circularité), gâchettes analogiques, pavé tactile (2 doigts), gyroscope et accéléromètre avec graphique, vue hexadécimale brute.

**Sorties** : vibrations gauche/droite, gâchettes adaptatives (résistance, arme, vibration, rigide), barre lumineuse RVB, LED joueur, LED micro, haut-parleur et micro (USB).

**Validation guidée (19 tests)** avec verdict **VALIDÉE / NON VALIDÉE / INCOMPLÈTE** :

| # | Test | Critère |
|---|------|---------|
| 1 | Communication & identité | rapports reçus, firmware, MAC, calibration lisibles |
| 2 | Batterie & charge | pas d'erreur ; en USB la manette doit charger |
| 3 | Tous les boutons | chaque bouton pressé puis relâché (19, ou 23 pour l'Edge) |
| 4 | Dérive des sticks (drift) | écart au repos ≤ 10 % sur 3 s |
| 5 | Amplitude & circularité | butées atteintes, contour ≥ 90 %, erreur < 15 % |
| 6 | Gâchettes L2/R2 | course 0 → ≥ 250, retour ≤ 5, bit numérique cohérent |
| 7 | Pavé tactile | ≥ 95 % de surface + 2 doigts simultanés |
| 8 | Capteurs au repos | gyro < 3 °/s, bruit < 2 °/s, gravité 0,9–1,1 g |
| 9 | Capteurs en mouvement | chaque axe gyro > 150 °/s, chaque axe accéléro ±0,7 g |
| 10–11 | Vibrations G / D | confirmation opérateur |
| 12–13 | Gâchettes adaptatives L2 / R2 | confirmation opérateur |
| 14–16 | Barre lumineuse, LED joueur, LED micro | confirmation opérateur |
| 17–19 | Haut-parleur, micro, prise jack | optionnels (USB) |

Le rapport s'exporte en **JSON** ou en **PDF** (bouton imprimer). Un historique est gardé dans le navigateur.

## Utilisation

1. Ouvrir le site dans **Google Chrome** ou **Microsoft Edge** sur ordinateur (WebHID requis ; Firefox/Safari non compatibles).
2. Brancher la manette en **USB** (recommandé, permet aussi les tests audio) ou l'appairer en Bluetooth.
3. Cliquer **Connecter la manette** → choisir « DualSense Wireless Controller ».
4. Onglet **Validation** → lancer les tests dans l'ordre → **Rapport PDF**.

Hors ligne : télécharger le dépôt (Code → Download ZIP) et ouvrir `index.html` dans Chrome/Edge.

## Sécurité

- Aucune donnée envoyée sur internet, tout se passe dans le navigateur.
- **Lecture seule** : aucune écriture de firmware ni de calibration. Seules les sorties standard (LED, vibrations, gâchettes) sont envoyées.

## Développement

- `dualsense.js` : protocole HID (rapports d'entrée USB 0x01 / Bluetooth 0x31, feature reports 0x05 / 0x09 / 0x20, sortie avec CRC32 en Bluetooth, effets de gâchettes)
- `app.js` : interface et tests ; `style.css` : thème clair/sombre
- `test/mock-test.js` : test automatisé avec une manette simulée dans Chromium (Playwright) :
  ```
  node test/mock-test.js
  ```

Références : pilote Linux `hid-playstation.c`, SDL, projets [daidr/dualsense-tester](https://github.com/daidr/dualsense-tester) et [dualshock-tools](https://github.com/dualshock-tools/dualshock-tools.github.io).

Licence MIT.
