# Builds MAME 0.145's chdman (February 2012), the last release that writes v4 CHDs, to create the v4 test fixtures.
#
# Usage:
#   docker build --platform linux/amd64 --file mame0145.Dockerfile --tag chdman:0.145 .
#   docker run --rm --platform linux/amd64 --volume "$PWD:/work" --workdir /work chdman:0.145 -createcd cd.cue cd-v4.chd
#
# Old chdman syntax is "-createcd <input.(toc|cue|nrg|gdi)> <output.chd>", though 0.145 rejects .toc input.

FROM --platform=linux/amd64 debian:wheezy

# Debian 7 (wheezy) ships a gcc that still compiles 2012-era MAME. Its archive's signing keys have
# expired, hence the disabled Valid-Until check and --force-yes.
RUN printf 'deb http://archive.debian.org/debian wheezy main\ndeb http://archive.debian.org/debian-security wheezy/updates main\n' > /etc/apt/sources.list \
 && apt-get -o Acquire::Check-Valid-Until=false update \
 && apt-get install -y --force-yes build-essential python libsdl1.2-dev libsdl-ttf2.0-dev libxinerama-dev \
 && rm -rf /var/lib/apt/lists/*

ADD --checksum=sha256:748cf3dab8ccbd8c02db1cf7479d499575285d26fab58bc4325b7fa011d8a860 \
    https://codeload.github.com/mamedev/mame/tar.gz/refs/tags/mame0145 /tmp/mame.tar.gz
RUN mkdir /mame \
 && tar -xzf /tmp/mame.tar.gz -C /mame --strip-components=1 \
 && rm /tmp/mame.tar.gz
WORKDIR /mame

# version.o depends on every emulator library, so build it alone and tell make not to remake it
RUN make NOWERROR=1 PTR64=1 maketree \
 && gcc -c src/version.c -o obj/sdl64/version.o \
 && make -j"$(nproc)" NOWERROR=1 PTR64=1 -o obj/sdl64/version.o chdman \
 && cp chdman /usr/local/bin/

ENTRYPOINT ["chdman"]
