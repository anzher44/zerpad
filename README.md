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
| 5 | Stick drift | resting deviation 10 % or less, noise 2.5 or less |
| 6 | Stick range | full travel on both axes, contour 90 %, circularity error under 15 % |
| 7 | Return to center | 5 releases per stick, back within 10 %, median overshoot under 18 % |
| 8 | L2 / R2 | full travel and return to rest |
| 9 | Touchpad | 95 % of the surface and two fingers at once |
| 10 | Motion at rest | gyro under 3 °/s, gravity between 0.9 and 1.1 g |
| 11 | Motion | each gyro axis over 150 °/s, each accelerometer axis reaches 0.7 g |
| 12-18 | Rumble, adaptive triggers, lightbar, LEDs | confirmed by the operator |
| 19-21 | Speaker, microphone, headphone jack | optional |

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
