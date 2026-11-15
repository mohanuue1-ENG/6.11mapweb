Driver app downloads
====================

Put the Android app file here, named exactly:

    611-drive-gps.apk

The website's "Get the app" page (/download) offers it as the Android download as soon as the file is
here. Until then the page says the app is being prepared.

To use a Play Store link or a file kept somewhere else, set this when building the website instead:

    VITE_ANDROID_APP_URL=https://...
    VITE_IOS_APP_URL=https://...        (optional: App Store / TestFlight)

How to make the .apk is in DEPLOY.md, section "Publishing the driver app".
