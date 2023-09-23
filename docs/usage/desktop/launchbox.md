# LaunchBox

[LaunchBox](https://www.launchbox-app.com/) is a game launcher for Windows for both retro games and modern games.

LaunchBox uses [RetroArch](retroarch.md) for its game emulation by default, as of [v12.2 (2021)](https://www.launchbox-app.com/about/changelog). RetroArch will be downloaded the first time you import a ROM from LaunchBox's UI.

!!! failure

    LaunchBox has its own ROM importing mechanism that copies files to `\Games\*\*` in your install directory (so `%USERPROFILE%\LaunchBox\Games\*\*` by default). There _is_ a mechanism to scan for ROMs added to these folders manually, but they must be sorted into the correct "platform" folder. LaunchBox doesn't have documentation cataloging these "platform" folders, so `igir` does not currently support them.
