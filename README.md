# ZherPad

Browser tool to test, validate and recalibrate PS5 DualSense controllers.

Live version: https://anzher44.github.io/zherpad/

It runs entirely in the browser through WebHID. Nothing is installed and nothing is sent over the network.
The interface is available in French and English (button in the top bar, detected from the browser language by default).

## Features

- Live view of buttons, sticks, triggers, touchpad, gyroscope and accelerometer
- Output tests: rumble, adaptive triggers, lightbar, player LEDs, mic LED, speaker and microphone
- Factory info: serial number, color, board revision, PCBA ID, battery and motor barcodes, battery voltage
- Usage counters stored in the controller: hours of use, charge cycles, presses per button, connections, charging errors
- Counterfeit detection
- Stick drift with noise and a recommended deadzone, plus a return-to-center test
- Stick recalibration (center and range)
- Guided validation with a PDF or JSON report
- Works offline once loaded, and can be installed as an app

## Requirements

- Chrome or Edge on a desktop computer. Firefox and Safari do not support WebHID.
- USB cable recommended. Bluetooth works for most tests, but factory info is partial and audio tests and calibration need USB.

## Usage

1. Open the site and plug in the controller.
2. Click "Connecter la manette" and select "DualSense Wireless Controller".
3. The Infos tab shows identity, factory info and usage counters.
4. The Validation tab runs the tests one by one and prints the report.
5. The Calibration tab recalibrates the sticks.

## Validation tests

| # | Test | Pass criterion |
|---|------|----------------|
| 1 | Communication | input reports, firmware, MAC and IMU calibration readable |
| 2 | Authenticity | no counterfeit signs, serial number readable |
| 3 | Battery | no charging error, charges when plugged in |
| 4 | Buttons | every button pressed and released |
| 5 | Stick drift | resting offset 6 % or less, noise 1.5 % or less |
| 6 | Stick range | full travel on both axes, contour 90 %, mean circularity error under 15 % |
| 7 | Return to center | 5 releases per stick, back within 8 %, median overshoot under 18 % |
| 8 | L2 / R2 | full travel and return to rest |
| 9 | Touchpad | 95 % of the surface and two fingers at once |
| 10 | Motion at rest | gyro under 2 °/s, noise under 1 °/s, gravity between 0.95 and 1.05 g |
| 11 | Motion | each gyro axis over 150 °/s, each accelerometer axis reaches 0.7 g |
| 12-18 | Rumble, adaptive triggers, lightbar, LEDs | confirmed by the operator |
| 19-21 | Speaker, microphone, headphone jack | optional |

## How the pass criteria were chosen

The thresholds are based on published measurements, not guesses:

| Test | Threshold | Reference |
|------|-----------|-----------|
| Stick resting offset | 6 % max (1.25 % = within one step, 3.5 % = mild drift) | [sense-calibrator](https://github.com/martino-vigiani/sense-calibrator) tiers built from real controllers; [Gamepadla](https://gamepadla.com/sony-dualsense.html) measured 2.7 % and 5.1 % centering on a new DualSense |
| Stick noise | 1.5 % max (95th percentile) | sense-calibrator uses the same limit to flag a worn potentiometer |
| Circularity | mean error under 15 % | Gamepadla measured 7.8 % and 8.2 % on a new DualSense |
| Return to center | 8 % max, median overshoot under 18 % | overshoot bands from [dualsense-doctor](https://github.com/Sufxx/dualsense-doctor); return limit set above the centering measured on new units |
| Gyroscope at rest | mean under 2 °/s, noise under 1 °/s | about 4× the values measured on a working controller (0.56 °/s, 0.25 °/s) |
| Accelerometer at rest | 0.95 to 1.05 g | gravity is 1 g; a working controller read 1.007 g |
| Report rate | over 100 reports/s | a DualSense over USB reports about 250 times per second |

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
- `i18n.js`, `i18n-en.js`: French / English interface
- `calibration.js`: calibration steps
- `sw.js`, `manifest.webmanifest`: offline support
- `test/mock-test.js`: end-to-end test with a simulated controller (Playwright)

Run locally:

```bash
python3 -m http.server 8000
```

Run the test:

```bash
node test/mock-test.js
```

## Acknowledgements

Thanks to the authors of the Linux `hid-playstation` driver, [daidr/dualsense-tester](https://github.com/daidr/dualsense-tester) and [dualshock-tools](https://github.com/dualshock-tools/dualshock-tools.github.io) for documenting the DualSense protocol. License notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## License

MIT
