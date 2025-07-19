---
search:
  boost: 0.5
---

# ROM Dumping

!!! danger

    An obligatory warning about downloading ROMs:

    Emulators are generally _legal_, as long as they don't include copyrighted software such as a console BIOS. Downloading ROM files that you do not own is piracy which is _illegal_ in many countries.

!!! info

    [Dumping.Guide](https://dumping.guide/start) and [Emulation General Wiki](https://emulation.gametechwiki.com/index.php/Ripping_games) are some of the best resources for legally creating ROM files from games you own.

Here is a condensed version that isn't guaranteed to be up to date.

## Generation 1-5 cartridge-based consoles

| Dumpable with special hardware | [Open Source Cartridge Reader](https://github.com/sanni/cartreader)<br/>([Save the Hero Builders](https://savethehero.builders/)) | [INLretro Dumper](https://www.infiniteneslives.com/inlretro.php) | [Retrode](https://www.retrode.com/)            | Other hardware                                             |
|--------------------------------|-----------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------|------------------------------------------------|------------------------------------------------------------|
| Nintendo - GB, GBC, GBA        | ✅                                                                                                                                 | ✅                                                                | ✅ (w/ adapter)                                 | [GB Operator](https://www.epilogue.co/product/gb-operator) |
| Nintendo - NES/Famicom         | ✅ (V3 w/ adapter)                                                                                                                 | ✅                                                                | ❌                                              |                                                            |
| Nintendo - Nintendo 64         | ✅ including controller pak saves (V3 w/ addon for EEPROM saves)                                                                   | ✅                                                                | ✅ including controller park saves (w/ adapter) |                                                            |
| Nintendo - SNES/SFC            | ✅ (V3 w/ addon for some)                                                                                                          | ✅                                                                | ✅                                              |                                                            |
| Sega - Game Gear               | ✅ (w/ Retrode Master System adapter)                                                                                              | ❌                                                                | ✅ (w/ Master System adapter)                   |                                                            |
| Sega - Genesis/MD              | ✅                                                                                                                                 | ✅                                                                | ✅                                              |                                                            |
| Sega - Master System           | ✅ (V3 w/ adapter)                                                                                                                 | ❌                                                                | ✅ (w/ adapter)                                 |                                                            |

## Generation 6+ and disk-based consoles

| Dumpable with software  | Software for native hardware                                                                                                                                                                                                    | Other hardware                                                                 |
|-------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------|
| Nintendo - 3DS          | [GodMode9](https://github.com/d0k3/GodMode9)                                                                                                                                                                                    |                                                                                |
| Nintendo - DS, DSi      | [GodMode9](https://github.com/d0k3/GodMode9) (w/ 3DS), [GodMode9i](https://github.com/DS-Homebrew/GodMode9i) (w/ DSi), [wooddumper](https://dumping.guide/carts/nintendo/ds#method_4_-_ds_console_via_slot-2_flashcart) (w/ DS) |                                                                                |
| Nintendo - Famicom Disk |                                                                                                                                                                                                                                 | [FDSStick](https://3dscapture.com/fdsstick/)                                   |
| Nintendo - Switch       | [nxdumptool](https://github.com/DarkMatterCore/nxdumptool/tree/main)                                                                                                                                                            | [Mig Flash Dumper](https://www.migflashunited.shop/products/mig-switch-dumper) |
| Sony - PSP              | [UMD Image Creator](https://github.com/saramibreak/UmdImageCreator), [PSP Filer](http://wiki.redump.org/index.php?title=PlayStation_Portable_Dumping_Guide)                                                                     |                                                                                |
| Sony - PlayStation Vita | [psvgamesd](https://github.com/motoharu-gosuto/psvgamesd)                                                                                                                                                                       |                                                                                |

## Optical-based consoles

| Optical-based consoles     | [Media Preservation Frontend (MPF)](https://github.com/SabreTools/MPF) (w/ PC) | Software for native hardware                                                                                  |
|----------------------------|--------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------|
| Microsoft - Xbox, 360, One | ✅                                                                              |                                                                                                               |
| Nintendo - Gamecube        | ⚠️ with specific drives and workarounds                                        | [CleanRip](https://wiibrew.org/wiki/CleanRip) (w/ Wii)                                                        |
| Nintendo - Wii             | ⚠️ with specific drives and workarounds                                        | [CleanRip](https://wiibrew.org/wiki/CleanRip)                                                                 |
| Nintendo - Wii U           | ❌                                                                              | [wudump](https://github.com/FIX94/wudump)                                                                     |
| Sega - Dreamcast           | ⚠️ with specific drives and workarounds                                        | [SD Rip](https://hiddenpalace.org/Dreamcast_SD_Rip)                                                           |
| Sega - Saturn              | ✅                                                                              |                                                                                                               |
| Sony - PlayStation 1, 2    | ✅                                                                              |                                                                                                               |
| Sony - PlayStation 3       | ❌                                                                              | [ManaGunZ](https://github.com/Zarh/ManaGunZ), [multiMAN](https://store.brewology.com/ahomebrew.php?brewid=24) |
