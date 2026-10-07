#include <napi.h>

#include <string>
#include <vector>

#include "src/addon.h"
#include "src/entryReader.h"
#include "src/lister.h"
#include "src/sevenZip.h"

namespace {

/** Builds the immutable JavaScript array containing every compiled archive-handler name. */
Napi::Value FormatNamesArray(Napi::Env env) {
    std::vector<std::string> const names = sevenzip::FormatNames();
    Napi::Array out = Napi::Array::New(env, names.size());
    for (size_t i = 0; i < names.size(); i++) {
        out.Set(static_cast<uint32_t>(i), Napi::String::New(env, names[i]));
    }
    return out;
}

/** Validates JavaScript listing arguments and starts the asynchronous native listing job. */
Napi::Value ListEntriesJs(const Napi::CallbackInfo& info) {
    Napi::Env const env = info.Env();
    try {
        if (info.Length() < 2 || !info[0].IsString() || !info[1].IsNumber()) {
            Napi::TypeError::New(env, "expected (path: string, formatIndex: number)").ThrowAsJavaScriptException();
            return env.Undefined();
        }
        return sevenzip::ListEntries(env, info[0].As<Napi::String>().Utf8Value(),
                                     info[1].As<Napi::Number>().Uint32Value());
    } catch (...) {
        Napi::Error::New(env, "failed to start listing the archive").ThrowAsJavaScriptException();
        return env.Undefined();
    }
}

/** Initializes 7-Zip, per-environment state, and every JavaScript export for this addon. */
Napi::Object Init(Napi::Env env, Napi::Object exports) {
    try {
        sevenzip::EnsureInitialized();
        // The registry this creates must exist before any export below can start
        // a thread
        sevenzip::InitAddonData(env);
        exports.Set("formats", FormatNamesArray(env));
        exports.Set("listEntries", Napi::Function::New(env, ListEntriesJs));
        exports.Set("EntryReader", sevenzip::EntryReader::GetClass(env));
    } catch (...) {
        // A throw here would abort at `require()` time with no diagnostic at
        // all; a thrown JavaScript error at least names the addon
        Napi::Error::New(env, "failed to initialize the 7-Zip addon").ThrowAsJavaScriptException();
    }
    return exports;
}

}  // namespace

NODE_API_MODULE(NODE_GYP_MODULE_NAME, Init)  // NOLINT
