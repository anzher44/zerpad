# ZerPad

[![Tests](https://github.com/anzher44/zerpad/actions/workflows/test.yml/badge.svg)](https://github.com/anzher44/zerpad/actions/workflows/test.yml)

Free online PS5 controller tester: test, validate and recalibrate a DualSense or DualSense Edge in the browser. Checks stick drift, adaptive triggers, buttons, battery, gyroscope, factory info and usage history, and prints a one-page PDF report.

Live version: https://anzher44.github.io/zerpad/

It runs entirely in the browser through WebHID. Nothing is installed and nothing is sent over the network.
The interface is available in French, English, Spanish, German, Italian and Portuguese (menu in the top bar, detected from the browser language by default).

## Features

- Live view of buttons, sticks, triggers, touchpad, gyroscope and accelerometer
- Output tests: rumble, adaptive triggers, lightbar, player LEDs, mic LED, speaker and microphone
- Speaker and headphone test tone played by the controller itself, with no audio setup
- Factory info: serial number, color, board revision, PCBA ID, battery and motor barcodes, battery voltage
- Usage counters stored in the controller: hours of use, charge cycles, presses per button, connections, charging errors
- Counterfeit detection
- Stick drift with noise and a recommended deadzone, plus a return-to-center test
- Signal jump test that finds worn potentiometer tracks on the sticks and triggers
- Stick recalibration (center and range)
- Guided validation with a one-page PDF report (or JSON)
- The controller is shown in its own color, detected from the serial number
- Before / after comparison with an earlier JSON report
- Three small games played with the controller: reflexes, stick precision, trigger control
- Works offline once loaded, and can be installed as an app

## Requirements

- Chrome or Edge on a desktop computer. Firefox, Safari and phones do not support WebHID: they get a quick test instead (buttons, sticks, triggers, drift, vibration where the browser allows it) through the Gamepad API.
- USB cable recommended. Bluetooth works for most tests, but factory info is partial and audio tests and calibration need USB.

## Usage

1. Open the site and plug in the controller.
2. Click "Connecter la manette" and select "DualSense Wireless Controller".
3. The "Manette" tab shows the controller in its own color, its identity, factory info and usage counters.
4. "Démarrer le contrôle" opens the "Contrôle" tab, which walks through the tests one by one and prints the report.
5. The "Jeux" tab has three games, the "Calibration" tab recalibrates the sticks.

## Validation tests

| # | Test | Pass criterion |
|---|------|----------------|
| 1 | Communication | over 100 reports/s, under 5 % lost reports, firmware, MAC and IMU calibration readable |
| 2 | Authenticity | no counterfeit signs, serial number readable |
| 3 | Battery | no charging error, charges when plugged in |
| 4 | Buttons | every button pressed and released, no switch bounce |
| 5 | Stick drift | resting offset 6 % or less, noise 1.5 % or less |
| 6 | Stick range | full travel on both axes, contour 90 %, mean circularity error under 15 % |
| 7 | Return to center | 5 releases per stick, back within 8 %, median overshoot under 18 %, settle time shown |
| 8 | L2 / R2 | full travel and return to rest |
| 9 | Signal jumps (optional) | no jump on the 6 axes while they move slowly: a value that leaves by 20 or more (8 %) and comes back within 15 ms |
| 10 | Touchpad | 95 % of the surface and two fingers at once |
| 11 | Motion at rest | gyro under 3 °/s, noise under 1 °/s, gravity between 0.92 and 1.08 g, restarts if the controller moves |
| 12 | Motion | each gyro axis over 150 °/s, each accelerometer axis reaches 0.7 g |
| 13-19 | Rumble, adaptive triggers, lightbar, LEDs | confirmed by the operator |
| 20-22 | Speaker (controller test tone), microphone, headphone jack | optional |

## How the pass criteria were chosen

The thresholds are based on published measurements, not guesses:

| Test | Threshold | Reference |
|------|-----------|-----------|
| Stick resting offset | 6 % max (1.25 % = within one step, 3.5 % = mild drift) | [sense-calibrator](https://github.com/martino-vigiani/sense-calibrator) tiers built from real controllers; [Gamepadla](https://gamepadla.com/sony-dualsense.html) measured 2.7 % and 5.1 % centering on a new DualSense; [Controller Toolkit](https://github.com/mRbRaIn0/DualShock-Controller-Toolkit) rates 5 % slight and 8 % moderate drift |
| Stick noise | 1.5 % max (95th percentile) | sense-calibrator uses the same limit to flag a worn potentiometer |
| Circularity | mean error under 15 % | Gamepadla measured 7.8 % and 8.2 % on a new DualSense; Controller Toolkit warns at the same 15 % |
| Return to center | 8 % max, median overshoot under 18 %, slow above 300 ms | overshoot bands from [dualsense-doctor](https://github.com/Sufxx/dualsense-doctor); settle time and 2 % settle band from Controller Toolkit |
| L2 / R2 | rest 5 or less, full press 250 or more | same values in Controller Toolkit |
| Gyroscope at rest | mean under 3 °/s, noise under 1 °/s | a working controller read 0.56 °/s and 0.25 °/s; Controller Toolkit warns at 1 °/s noise and 5 °/s bias |
| Accelerometer at rest | 0.92 to 1.08 g, movement above 0.02 g noise | a working controller read 1.007 g; Controller Toolkit allows 0.12 g and uses the same 0.02 g movement limit |
| Report rate and loss | over 100 reports/s, under 5 % lost | a DualSense over USB reports about 250 times per second; Controller Toolkit uses the same 100 Hz minimum and 5 % loss limit |
| Button bounce | a release and new press within 25 ms | faster than any finger; idea from [GamepadTester](https://github.com/SekaPsyka/GamepadTester) |
| Signal jump | 20 or more out and back within 15 ms, only while the axis moved under 3 per report | a thumb cannot reverse that fast; a real release (with bounce) and fast flicks are excluded and covered by the automated test |

These values will be refined as more controllers are measured. If a controller you know is good fails a test, please open an issue with the JSON report.

## Stick calibration

Calibration fixes a resting position that is off center and travel that does not reach the edge. It does not fix a worn or dirty stick.

It only runs over USB, on a standard DualSense (the Edge does not keep it), with the battery at 30 % or charging.
New values stay in temporary memory until you click "Sauvegarder définitivement". "Annuler" reboots the controller and restores the previous values.

Don't unplug the controller during a step. Writing to the controller always carries some risk.

## Development

Plain HTML, CSS and JavaScript, no build step.

- `dualsense.js`: HID protocol (input and output reports, feature reports, factory commands, telemetry, calibration)
- `app.js`: interface, tests and reports
- `i18n.js`, `i18n-*.js`: interface languages (French keys, one dictionary per language)
- `games.js`: the three games
- `calibration.js`: calibration steps
- `assets/controllers/`: controller illustrations per edition (Gamepad Asset Pack, MIT)
- `assets/fonts/`: IBM Plex Sans and Mono (SIL Open Font License)
- `sw.js`, `manifest.webmanifest`: offline support
- `test/mock-test.js`, `test/bt-test.js`: end-to-end tests with a simulated controller over USB and Bluetooth (Playwright)
- `test/glitch-test.js`: signal jump detection (clean sweep, real stick release, injected spike)
- `test/i18n-check.js`: every interface string exists in every language, with the same tags

Run locally:

```bash
python3 -m http.server 8000
```

Run the tests (USB and Bluetooth, simulated controller):

```bash
node test/mock-test.js
node test/bt-test.js
node test/glitch-test.js
node test/i18n-check.js
```

They also run on GitHub for every push.

## Acknowledgements

Typefaces: IBM Plex (SIL Open Font License). Controller illustrations from the [Gamepad Asset Pack](https://github.com/AL2009man/Gamepad-Asset-Pack) by Al. Lopez (MIT). Input, output and calibration parsing follow the Linux `hid-playstation` driver. Thanks to its authors and to [daidr/dualsense-tester](https://github.com/daidr/dualsense-tester) and [dualshock-tools](https://github.com/dualshock-tools/dualshock-tools.github.io) for documenting the DualSense protocol. License notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## License

MIT
