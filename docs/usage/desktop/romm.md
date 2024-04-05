# RomM

[RomM](https://github.com/rommapp/romm) is a web based ROM management solution that allows you to scan, enrich, and browse your game collection with a clean and responsive interface. With support for multiple platforms, various naming schemes and custom tags, RomM is a must-have for anyone who plays on emulators.

## ROMs

RomM uses its own [proprietary ROM folder structure](https://github.com/rommapp/romm/wiki/Supported-Platforms), so `igir` has a replaceable `{romm}` token to sort ROMs into the right place. See the [replaceable tokens page](../../output/tokens.md) for more information.

=== ":simple-linux: EmulationStation (Linux)"

    You can copy ROMs from a USB drive named "USB-Drive" like this:

    ```shell
    igir copy zip test clean \
      --dat "/media/USB-Drive/No-Intro*.zip" \
      --input "/media/USB-Drive/ROMs/" \
      --output "./romm/roms/{romm}"
    ```

    You can start RomM using Docker Compose like this:

    ```
    ---
    services:
      romm:
        container_name: romm
        environment:
          - DB_HOST=romm-mariadb
          - DB_PASSWD=XXXX
          - DB_USER=romm
          - ENABLE_RESCAN_ON_FILESYSTEM_CHANGE=true
          - ENABLE_SCHEDULED_RESCAN=true
          - IGDB_CLIENT_ID=XXXX
          - IGDB_CLIENT_SECRET=XXXX
          - ROMM_AUTH_SECRET_KEY=XXXX
          - ROMM_HOST=localhost
        image: rommapp/romm
        ports:
          - 80:8080
        restart: unless-stopped
        volumes:
          - ./romm/assets:/romm/assets
          - ./romm/config:/romm/config
          - ./romm/logs:/romm/logs
          - ./romm/redis:/redis-data
          - ./romm/resources:/romm/resources
          - ./romm/roms:/romm/library/roms
      romm-mariadb:
        container_name: romm-mariadb
        environment:
          - MARIADB_DATABASE=romm
          - MARIADB_PASSWORD=XXXX
          - MARIADB_RANDOM_ROOT_PASSWORD=true
          - MARIADB_USER=romm
        expose:
          - 3306
        image: mariadb
        restart: unless-stopped
        volumes:
          - ./romm-mariadb:/var/lib/mysql
    ```
