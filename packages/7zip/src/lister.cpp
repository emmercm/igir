#include <optional>
#include <string>
#include <utility>
#include <vector>

#include "lister.h"
#include "7zip/PropID.h"
#include "errors.h"
#include "sevenZip.h"

namespace sevenzip {

namespace {

struct Entry {
    std::optional<std::string> entryPath;
    std::optional<uint64_t> size;
    std::optional<uint32_t> crc32;
    bool isDirectory = false;
    bool isEncrypted = false;
};

class ListWorker : public Napi::AsyncWorker {
   public:
    ListWorker(Napi::Env env, std::string path, uint32_t formatIndex)
        : Napi::AsyncWorker(env),
          deferred_(Napi::Promise::Deferred::New(env)),
          path_(std::move(path)),
          formatIndex_(formatIndex) {}

    Napi::Promise GetPromise() { return deferred_.Promise(); }

    void Execute() override {
        // Nothing may escape this boundary: N-API is built here with
        // NAPI_DISABLE_CPP_EXCEPTIONS, so an exception leaving Execute()
        // aborts the process rather than rejecting the promise. Several
        // vendored calls throw by design -- ConvertUnicodeToUTF8() throws when
        // its two length-calculation passes disagree, and any allocation can
        // throw 7-Zip's kMemException -- and archives are untrusted input.
        try {
            Run();
        } catch (...) {
            SetError("failed to list the archive's entries");
        }
    }

    void Run() {
        OpenedArchive opened;
        HRESULT const hr = OpenArchive(path_, formatIndex_, &opened);
        if (hr != S_OK) {
            SetError(OpenErrorMessage(hr, path_, formatIndex_));
            return;
        }

        uint32_t count = 0;
        if (opened.archive->GetNumberOfItems(&count) != S_OK) {
            SetError("could not read the archive's item count; it is likely corrupt");
            return;
        }
        // Deliberately NOT entries_.reserve(count): `count` comes out of an
        // untrusted header, and a corrupt archive claiming 4 billion items would
        // otherwise ask for ~200 GB before a single property is read. Growing
        // the vector costs an amortized reallocation and is bounded by what the
        // archive can actually produce.
        for (uint32_t i = 0; i < count; i++) {
            Entry entry;

            std::string entryPath;
            if (GetStringProp(*opened.archive, i, kpidPath, &entryPath)) {
                // An empty string stays an empty string: the format DID record a
                // name and that name is "". Only a missing kpidPath is undefined.
                entry.entryPath = std::move(entryPath);
            }
            uint64_t size = 0;
            if (GetUInt64Prop(*opened.archive, i, kpidSize, &size)) {
                entry.size = size;
            }
            uint32_t crc = 0;
            if (GetUInt32Prop(*opened.archive, i, kpidCRC, &crc)) {
                entry.crc32 = crc;
            }
            entry.isDirectory = GetBoolProp(*opened.archive, i, kpidIsDir);
            entry.isEncrypted = GetBoolProp(*opened.archive, i, kpidEncrypted);
            entries_.push_back(std::move(entry));
        }
        // `opened` is destroyed here: every file handle is released before OnOK.
    }

    void OnOK() override {
        // Same boundary rule as Execute(), on the other thread: OnOK runs on
        // the JS thread, and an exception leaving it aborts. Building the
        // result allocates once per entry, and a malformed archive can declare
        // a great many of them.
        try {
            Emit();
        } catch (...) {
            deferred_.Reject(Napi::Error::New(Env(), "failed to build the entry list").Value());
        }
    }

    void Emit() {
        Napi::Env const env = Env();
        Napi::Array out = Napi::Array::New(env, entries_.size());
        for (size_t i = 0; i < entries_.size(); i++) {
            const Entry& entry = entries_[i];
            Napi::Object object = Napi::Object::New(env);
            // Undefined rather than "" when the format records no name, for the
            // same reason as `size`: "" is a name an entry could really have.
            object.Set("entryPath", entry.entryPath.has_value()
                                        ? Napi::Value(Napi::String::New(env, *entry.entryPath))
                                        : env.Undefined());
            // Left undefined rather than 0 when the format records no size:
            // 0 is a real length, and .Z/.bz2/.lzma members genuinely can be
            // empty. Only the caller can tell "empty" from "unknown".
            object.Set("size",
                       entry.size.has_value()
                           ? Napi::Value(Napi::Number::New(env, static_cast<double>(*entry.size)))
                           : env.Undefined());
            // Handed to JS as a number and formatted as 8 lowercase hex chars
            // in index.ts. Presentation is cheaper to write, test and change in
            // TypeScript than in C++.
            object.Set("crc32", entry.crc32.has_value()
                                    ? Napi::Value(Napi::Number::New(env, *entry.crc32))
                                    : env.Undefined());
            object.Set("isDirectory", Napi::Boolean::New(env, entry.isDirectory));
            object.Set("isEncrypted", Napi::Boolean::New(env, entry.isEncrypted));
            out.Set(static_cast<uint32_t>(i), object);
        }
        deferred_.Resolve(out);
    }

    void OnError(const Napi::Error& e) override { deferred_.Reject(e.Value()); }

   private:
    Napi::Promise::Deferred deferred_;
    std::string path_;
    uint32_t formatIndex_;
    std::vector<Entry> entries_;
};

}  // namespace

Napi::Value ListEntries(Napi::Env env, std::string path, uint32_t formatIndex) {
    // Allocate before any state changes; N-API deletes the worker after OnOK/OnError.
    auto* worker = new ListWorker(env, std::move(path), formatIndex);
    Napi::Promise promise = worker->GetPromise();
    worker->Queue();
    return promise;
}

}  // namespace sevenzip
