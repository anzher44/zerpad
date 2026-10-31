# Notices tierces

ZherPad réutilise des connaissances de protocole publiées par les projets suivants (licence MIT).
Le code de ZherPad est écrit indépendamment ; la structure de la télémétrie et la liste des
commandes de lecture usine en sont adaptées.

## daidr/dualsense-tester — https://github.com/daidr/dualsense-tester

Structure du bloc de télémétrie (0x70), commandes de lecture usine (n° de série, PCBA, codes-barres,
moteurs de gâchettes, tension batterie, pavé tactile), table des couleurs.

```
MIT License

Copyright (c) 2023 Xuezhou Dai (daidr)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## dualshock-tools — https://github.com/dualshock-tools/dualshock-tools.github.io

Modèles de carte mère (BDM-0x0) d'après la version matérielle, détection de contrefaçon
(date de firmware, requête de réglage fin des sticks), état de la mémoire NVS, couleurs.

```
MIT License

Copyright (c) 2024 the_al

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Idées (sans reprise de code)

- Sufxx/dualsense-doctor (MIT) : test de retour au centre (« snapback »), mesure du bruit (jitter).
- Teerasak-Mairoddee/dualsense-tester : zone morte conseillée après le test de dérive.
- Pilote Linux `hid-playstation.c` : format des rapports d'entrée/sortie, calibration IMU.
