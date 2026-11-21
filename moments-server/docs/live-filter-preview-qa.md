# Live camera filter verification

2026-11-21: expanded regression checks for Natural, Vivid, Golden, Soft, Vintage and Mono.

The browser suite selects each look in the guest UI, closes the picker, and checks the main viewfinder canvas against independently calculated expected RGB values from the source camera frame. Filter strengths: 0, 35, 70 and 100 percent. Natural and zero strength must hide the processed canvas and restore the original video. The suite also resets to Natural, switches cameras, reselects Mono, and checks capture/retake, gallery output and camera shutdown.

The server suite checks every non-Natural look at 35, 70 and 100 percent against expected saved JPEG RGB values, allowing JPEG rounding. Natural, zero strength, event defaults and the administrator disable switch are covered.

Run from the repository root (PowerShell):

```powershell
$env:CAMERA_ENGINES='chromium,webkit'
$env:CAMERA_CASES='standard,android-large,landscape'
$env:CAMERA_OUTPUT="$env:TEMP/live-all-filters-qa"
node moments-server/scripts/test-live-camera-layout.cjs
node --test moments-server/test/live-photo-looks.test.mjs
```

Coverage limitations: Chromium uses a synthetic canvas MediaStream; Windows WebKit uses mocked video frames because its test build has no media stack. Mobile touch viewports are 390x844, 412x915 and 844x390. These checks exercise the application renderer in both browser engines but do not certify physical iOS/Android camera decoding, GPU composition, performance or thermal behavior.

Physical acceptance still required: on iPhone and Android, select all six looks, close the picker, confirm the live scene updates while moving the phone, vary strength, switch front/back cameras, rotate, background/resume, capture, retake and compare the saved result. Confirm Natural removes the effect and camera stop removes any stale preview.
