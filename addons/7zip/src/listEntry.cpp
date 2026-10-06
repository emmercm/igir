#include "listEntry.h"

#include <utility>

#include "7zip/PropID.h"
#include "sevenZip.h"

namespace sevenzip::detail {

void ReadEntry(IInArchive& archive, uint32_t i, Entry& entry) {
    entry.index = i;

    std::string entryPath;
    if (GetStringProp(archive, i, kpidPath, &entryPath)) {
        // An empty string stays an empty string: the format did record a
        // name, and that name is "". Only a missing kpidPath is undefined.
        //
        // Normalized rather than passed through, because some handlers
        // rewrite `/` to the host's separator on the way out, so the same
        // archive would list `sub/file.bin` on Linux and `sub\file.bin` on
        // Windows.
        entry.entryPath = NormalizeEntryPath(std::move(entryPath));
    }
    uint64_t size = 0;
    if (GetUInt64Prop(archive, i, kpidSize, &size)) {
        entry.size = size;
    }
    uint32_t crc = 0;
    if (GetUInt32Prop(archive, i, kpidCRC, &crc)) {
        entry.crc32 = crc;
    }
    entry.isDirectory = GetBoolProp(archive, i, kpidIsDir);
    entry.isEncrypted = GetBoolProp(archive, i, kpidEncrypted);
}

void WriteEntry(Napi::Env env, const Entry& entry, Napi::Object object) {
    object.Set("entryIndex", Napi::Number::New(env, entry.index));

    // Undefined rather than "" when the format records no name: "" is a
    // name an entry could really have
    object.Set("entryPath",
               entry.entryPath.has_value() ? Napi::Value(Napi::String::New(env, *entry.entryPath)) : env.Undefined());

    // Undefined rather than 0 when the format records no size: 0 is a real
    // length, and a single-stream member genuinely can be empty
    object.Set("size", entry.size.has_value() ? Napi::Value(Napi::Number::New(env, static_cast<double>(*entry.size)))
                                              : env.Undefined());

    // A number, left for JavaScript to format as hex
    object.Set("crc32", entry.crc32.has_value() ? Napi::Value(Napi::Number::New(env, *entry.crc32)) : env.Undefined());
    object.Set("isDirectory", Napi::Boolean::New(env, entry.isDirectory));
    object.Set("isEncrypted", Napi::Boolean::New(env, entry.isEncrypted));
}

}  // namespace sevenzip::detail
