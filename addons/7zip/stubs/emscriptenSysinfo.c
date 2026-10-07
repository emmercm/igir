/**
 * Defines sysinfo(), which Emscripten declares but doesn't define. 7-Zip sizes its memory limits
 * from it, so report the WebAssembly heap's maximum as the total and its unused remainder as free.
 */
#include <emscripten/heap.h>
#include <string.h>
#include <sys/sysinfo.h>

int sysinfo(struct sysinfo *info) {
    memset(info, 0, sizeof(*info));
    info->totalram = emscripten_get_heap_max();
    info->freeram = emscripten_get_heap_max() - emscripten_get_heap_size();
    info->mem_unit = 1;
    return 0;
}
