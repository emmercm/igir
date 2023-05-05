# RetroPie

!!! info

    [RetroPie](https://retropie.org.uk/) is an installer for [EmulationStation](https://emulationstation.org/) & [RetroArch](https://www.retroarch.com/) on single-board computers (SBCs).

Because RetroPie uses RetroArch under the hood, the instructions are generally the [same as RetroArch](retroarch.md). By default, the RetroPie BIOS directory is `/home/pi/RetroPie/BIOS`:

=== "RetroPie (Linux)"

    ```shell
    igir copy extract test clean \
      --dat "https://raw.githubusercontent.com/libretro/libretro-database/master/dat/System.dat" \
      --input BIOS/ \
      --output /home/pi/RetroPie/BIOS
    ```
