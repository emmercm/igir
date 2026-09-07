// Every 7-Zip interface IID (IID_ICompressCoder, IID_IInArchive, etc.) needs
// real storage (a definition, not just an `extern` declaration) exactly once
// in the binary -- see stubs/guidDefs.cpp (built as its own "guiddefs" gyp
// target, linked into this addon) for where that happens and why it has to
// be a separate translation unit compiled before anything else in the build
// processes these same interface headers with INITGUID inactive.
#include <napi.h>

#include <string>
#include <vector>

#include "src/addon.h"
#include "src/entryReader.h"
#include "src/lister.h"
#include "src/sevenZip.h"

namespace {

// Every function below is entered directly from JavaScript, where N-API is
// built with NAPI_DISABLE_CPP_EXCEPTIONS: its wrapper is a bare
// `return callback();`, so an escaping C++ exception aborts the process
// instead of throwing into JavaScript. Each therefore does its work in a
// helper called from inside one top-level catch-all, the same shape
// ListWorker::Execute and EntryReader::Read already use.
// The handler list is fixed at build time, so this is read once at load and
// handed to index.ts as the `formats` property rather than a callable. index.ts
// turns it into the name -> index map it passes back, and does not re-export it:
// callers name a format from a union of string literals, never an index.
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

Napi::Value ListEntriesJs(const Napi::CallbackInfo& info) {
    Napi::Env const env = info.Env();
    try {
        return ListEntriesImpl(info);
    } catch (...) {
        // Copying the path allocates, as does queueing the worker.
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
