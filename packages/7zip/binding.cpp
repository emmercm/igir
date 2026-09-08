#include <napi.h>

#include <string>
#include <vector>

#include "src/addon.h"
#include "src/entryReader.h"
#include "src/lister.h"
#include "src/sevenZip.h"

namespace {

// The handler list is fixed at build time, so it is read once at load and
// exported as a plain `formats` property rather than as a callable.
Napi::Value FormatsImpl(Napi::Env env) {
    std::vector<std::string> const names = sevenzip::FormatNames();
    Napi::Array out = Napi::Array::New(env, names.size());
    for (size_t i = 0; i < names.size(); i++) {
        out.Set(static_cast<uint32_t>(i), Napi::String::New(env, names[i]));
    }
    return out;
}

Napi::Value ListEntriesImpl(const Napi::CallbackInfo& info) {
    Napi::Env const env = info.Env();
    if (info.Length() < 2 || !info[0].IsString() || !info[1].IsNumber()) {
        Napi::TypeError::New(env, "expected (path: string, formatIndex: number)").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    return sevenzip::ListEntries(env, info[0].As<Napi::String>().Utf8Value(), info[1].As<Napi::Number>().Uint32Value());
}

// Entered from JavaScript, where N-API is built with NAPI_DISABLE_CPP_EXCEPTIONS
// and the wrapper is a bare `return callback();` -- so an escaping C++ exception
// aborts the process instead of throwing into JavaScript. The work goes in a
// helper called from inside this one catch-all.
Napi::Value ListEntriesJs(const Napi::CallbackInfo& info) {
    Napi::Env const env = info.Env();
    try {
        return ListEntriesImpl(info);
    } catch (...) {
        Napi::Error::New(env, "failed to start listing the archive").ThrowAsJavaScriptException();
        return env.Undefined();
    }
}

Napi::Object InitImpl(Napi::Env env, Napi::Object exports) {
    sevenzip::EnsureInitialized();
    // Before anything can start a thread: both listing and extraction register
    // with the registry this creates, and refuse to start without one.
    sevenzip::InitAddonData(env);
    exports.Set("formats", FormatsImpl(env));
    exports.Set("listEntries", Napi::Function::New(env, ListEntriesJs));
    exports.Set("EntryReader", sevenzip::EntryReader::GetClass(env));
    return exports;
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    try {
        return InitImpl(env, exports);
    } catch (...) {
        // A throw here would abort at `require()` time with no diagnostic at
        // all; a thrown JavaScript error at least names the addon.
        Napi::Error::New(env, "failed to initialize the 7-Zip addon").ThrowAsJavaScriptException();
        return exports;
    }
}

}  // namespace

NODE_API_MODULE(NODE_GYP_MODULE_NAME, Init)  // NOLINT
