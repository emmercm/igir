# RomM

[RomM](https://github.com/rommapp/romm) is a web-based ROM management solution that allows you to scan, enrich, and browse your game collection with a clean and responsive interface. With support for multiple platforms, various naming schemes, and custom tags, RomM is a must-have for anyone who plays on emulators.

## ROMs

RomM uses its own [proprietary ROM folder structure](https://github.com/rommapp/romm/wiki/Supported-Platforms), so Igir has a replaceable `{romm}` token to sort ROMs into the right place. See the [replaceable tokens page](../../output/tokens.md) for more information.

You can run RomM using [Docker Compose](https://docs.docker.com/compose/). Create a file named `docker-compose.yml` with the following contents, but change all of the environment variables with the value of `CHANGEME!`:

```yaml
version: "3"

# https://github.com/rommapp/romm/blob/997d2cacd4b1980484eb63c2b3ffe65c83133966/examples/docker-compose.example.yml
services:
  romm:
    image: rommapp/romm
    container_name: romm
    restart: unless-stopped
    environment:
      - DB_HOST=romm-db
      - DB_NAME=romm
      - DB_USER=romm
      - DB_PASSWD=CHANGEME!
      - ENABLE_RESCAN_ON_FILESYSTEM_CHANGE=true
      - ENABLE_SCHEDULED_RESCAN=true
      - IGDB_CLIENT_ID=CHANGEME!
      - IGDB_CLIENT_SECRET=CHANGEME!
      - ROMM_AUTH_SECRET_KEY=CHANGEME!
      - ROMM_AUTH_USERNAME=admin
      - ROMM_AUTH_PASSWORD=CHANGEME!
    volumes:
      - ./romm/assets:/romm/assets
      - ./romm/config:/romm/config
      - ./romm/logs:/romm/logs
      - ./romm/redis:/redis-data
      - ./romm/resources:/romm/resources
      - ./romm/roms:/romm/library/roms
    ports:
      - 80:8080
    depends_on:
      - romm-db
  romm-db:
    image: mariadb:latest
    container_name: romm-mariadb
    restart: unless-stopped
    environment:
      - MARIADB_RANDOM_ROOT_PASSWORD=true
      - MARIADB_DATABASE=romm
      - MARIADB_USER=romm
      - MARIADB_PASSWORD=CHANGEME!
    expose:
      - 3306
    volumes:
      - ./romm-db:/var/lib/mysql
```

then, run Docker Compose as you would with any other config:

```shell
docker compose up
```

This will create all of the local directories necessary. On your host machine (not from inside the container) you can sort your ROMs into the correct directories like this:

=== ":fontawesome-brands-windows: Windows"

    ```batch
    igir copy zip test clean ^
      --dat "No-Intro*.zip" ^
      --input "ROMs\" ^
      --output "romm\roms\{romm}"
    ```

=== ":fontawesome-brands-apple: macOS"

    ```shell
    igir copy zip test clean \
      --dat "No-Intro*.zip" \
      --input "ROMs/" \
      --output "romm/roms/{romm}"
    ```

=== ":simple-linux: Linux"

    ```shell
    igir copy zip test clean \
      --dat "No-Intro*.zip" \
      --input "ROMs/" \
      --output "romm/roms/{romm}"
    ```
