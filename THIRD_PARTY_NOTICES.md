# Third-party notices

ZherPad builds on protocol knowledge published by the following MIT-licensed projects.
ZherPad's code is written independently; the telemetry layout, the factory read commands and
the stick calibration sequence are adapted from them.

## daidr/dualsense-tester - https://github.com/daidr/dualsense-tester

Telemetry block layout (0x70), factory read commands (serial number, PCBA, barcodes, trigger motors,
battery voltage, touchpad), color table.

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

## dualshock-tools - https://github.com/dualshock-tools/dualshock-tools.github.io

Board revisions (BDM-0x0) from the hardware version, counterfeit detection (firmware date,
stick fine-tune query), NVS memory state, stick center/range calibration and NVS save sequence, colors.

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

## Gamepad Asset Pack - https://github.com/AL2009man/Gamepad-Asset-Pack

Controller illustrations in `assets/controllers/`. The White, Midnight Black, Cosmic Red, Nova Pink,
Galactic Purple and Starlight Blue images come from the pack, resized. The other editions are recolored
from the white image; their colors are approximations.

```
MIT License

Copyright (c) 2024 Al. Lopez

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

## Ideas (no code reused)

- Sufxx/dualsense-doctor (MIT): return-to-center (snapback) test, noise (jitter) measurement.
- Teerasak-Mairoddee/dualsense-tester: recommended deadzone after the drift test.
- Ohjurot/DualSense-Windows (MIT): adaptive trigger feedback bytes in the input report.
- nowrep/dualsensectl (GPL-3.0, protocol facts only): audio output path and volume fields,
  Bluetooth power-off feature report, bow/galloping/machine trigger effect layouts.
- DualSenseClient (GPL-3.0, protocol facts only): status bits of input byte 53 (mic muted, USB data, USB power).
- mRbRaIn0/DualShock-Controller-Toolkit (MIT): cross-check of thresholds, return-to-center settle time,
  movement detection during the rest test, packet loss limit, rumble refresh on recent firmwares.
- SekaPsyka/GamepadTester (MIT): button bounce (chatter) detection.
- remteh-by/dualsense-tester (proprietary, idea only, no code read into ZherPad): before/after report comparison.
- Linux driver `hid-playstation.c`: input/output report format, IMU calibration.
