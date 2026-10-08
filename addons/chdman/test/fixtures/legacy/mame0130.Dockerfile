# Builds MAME 0.130's chdman (March 2009), the last release that writes v3 CHDs, to create the v3 test fixtures.
#
# Usage:
#   docker build --platform linux/amd64 --file mame0130.Dockerfile --tag chdman:0.130 .
#   docker run --rm --platform linux/amd64 --volume "$PWD:/work" --workdir /work chdman:0.130 -createcd gd.gdi gd-v3.chd
#
# Old chdman syntax is "-createcd <input.(toc|gdi)> <output.chd>"; 0.130 has no .cue support.

FROM --platform=linux/amd64 debian:wheezy

# Debian 7 (wheezy) ships a gcc that still compiles 2009-era MAME. Its archive's signing keys have
# expired, hence the disabled Valid-Until check and --force-yes.
RUN printf 'deb http://archive.debian.org/debian wheezy main\ndeb http://archive.debian.org/debian-security wheezy/updates main\n' > /etc/apt/sources.list \
 && apt-get -o Acquire::Check-Valid-Until=false update \
 && apt-get install -y --force-yes build-essential python \
 && rm -rf /var/lib/apt/lists/*

ADD --checksum=sha256:c0916c2324b0c93ab5639a2069991cc377b792f7839001a6252f31dcad15cafe \
    https://codeload.github.com/mamedev/mame/tar.gz/refs/tags/mame0130 /tmp/mame.tar.gz
RUN mkdir /mame \
 && tar -xzf /tmp/mame.tar.gz -C /mame --strip-components=1 \
 && rm /tmp/mame.tar.gz
WORKDIR /mame

# 0.130's tagged source lacks its SDL OS layer, so this builds against the minimal osdmini layer
# instead, which is incomplete and out of date and needs these patches below to compile and link
COPY <<'EOF' /tmp/miniwork_multiple.c

osd_work_item *osd_work_item_queue_multiple(osd_work_queue *queue, osd_work_callback callback, INT32 numitems, void *parambase, INT32 paramstep, UINT32 flags)
{
	osd_work_item *item = NULL;
	INT32 i;

	for (i = 0; i < numitems; i++)
	{
		if (item != NULL)
			free(item);
		item = malloc(sizeof(*item));
		if (item == NULL)
			return NULL;
		item->result = (*callback)((UINT8 *)parambase + i * paramstep, 0);
	}
	return item;
}
EOF
COPY <<'EOF' /tmp/minifile_rmfile.c

file_error osd_rmfile(const char *filename)
{
	return (remove(filename) == 0) ? FILERR_NONE : FILERR_FAILURE;
}
EOF

RUN sed -i 's/-Werror//g' makefile \
 && sed -i '/^osd_work_item \*osd_work_item_queue(/,/^}/d' src/osd/osdmini/miniwork.c \
 && cat /tmp/miniwork_multiple.c >> src/osd/osdmini/miniwork.c \
 && cat /tmp/minifile_rmfile.c >> src/osd/osdmini/minifile.c \
 && printf '\n\n$(LIBOCORE): $(OSDCOREOBJS)\n' >> src/osd/osdmini/osdmini.mak \
 && make OSD=osdmini MAMEOS=osd/osdmini NOWERROR=1 PTR64=1 maketree \
 && mkdir -p obj/osdmini/mame/osd/osdmini \
 && make -j"$(nproc)" OSD=osdmini MAMEOS=osd/osdmini NOWERROR=1 PTR64=1 LIBS=-lm chdman \
 && cp chdman /usr/local/bin/

ENTRYPOINT ["chdman"]
