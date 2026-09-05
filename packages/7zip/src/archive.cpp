#include <algorithm>
#include <cctype>
#include <cstdio>
#include <cstring>
#include <mutex>
#include <optional>
#include <string>
#include <utility>

#include "archive.h"
#include "7zip/Archive/IArchive.h"
#include "7zip/PropID.h"
#include "Common/UTFConvert.h"
#include "Windows/PropVariant.h"
#include "7zCrc.h"
#include "7zip/Common/FileStreams.h"
#include "Common/StringConvert.h"
#include "Common/Wildcard.h"
#include "Windows/PropVariantConv.h"

// Declared in deps/7zip/CPP/7zip/Archive/ArchiveExports.cpp.
STDAPI GetNumberOfFormats(UInt32* numFormats);
STDAPI GetHandlerProperty2(UInt32 formatIndex, PROPID propID, PROPVARIANT* value);
// Declared in deps/7zip/CPP/7zip/Archive/ArchiveExports.cpp, compiled through
// stubs/archiveExports.cpp.
STDAPI CreateArchiver(const GUID* clsid, const GUID* iid, void** outObject);

namespace sevenzip {

namespace {

std::once_flag g_initOnce;

std::string ToUtf8(const BSTR bstr) {
    if (bstr == nullptr) {
        return {};
    }
    UString wide;
    wide = bstr;
    AString narrow;
    ConvertUnicodeToUTF8(wide, narrow);
    return {narrow.Ptr(), static_cast<size_t>(narrow.Len())};
}

}  // namespace

void EnsureInitialized() {
    // 7zCrc.h:13 -- "Call CrcGenerateTable one time before other CRC functions".
    std::call_once(g_initOnce, []() { CrcGenerateTable(); });
}

namespace {

// One registered archive handler. Both fields come from the same
// GetHandlerProperty2() sweep, so a handler whose name or class ID could not be
// read is dropped rather than half-populated.
struct Format {
    std::string name;
    GUID classId{};
};

// The handler set is fixed at build time -- the *Register.cpp units listed in
// binding.gyp register themselves from static initializers before main() -- so
// this table is built once and read thereafter. It replaces a
// GetNumberOfFormats() + GetHandlerProperty2() sweep that used to run on every
// single OpenArchive() call.
const std::vector<Format>& Formats() {
    // Function-local static: initialized on first use, and the C++ runtime makes
    // that thread-safe. Extraction opens archives from its own thread, so this
    // is genuinely reachable from more than one.
    static const std::vector<Format> formats = []() {
        EnsureInitialized();
        std::vector<Format> out;
        UInt32 count = 0;
        if (GetNumberOfFormats(&count) != S_OK) {
            return out;
        }
        out.reserve(count);
        for (UInt32 i = 0; i < count; i++) {
            NWindows::NCOM::CPropVariant nameProp;
            if (GetHandlerProperty2(i, NArchive::NHandlerPropID::kName, &nameProp) != S_OK ||
                nameProp.vt != VT_BSTR) {
                continue;
            }
            NWindows::NCOM::CPropVariant clsProp;
            if (GetHandlerProperty2(i, NArchive::NHandlerPropID::kClassID, &clsProp) != S_OK ||
                clsProp.vt != VT_BSTR) {
                continue;
            }
            // kClassID is a raw 16-byte GUID carried in a BSTR.
            if (::SysStringByteLen(clsProp.bstrVal) != sizeof(GUID)) {
                continue;
            }
            Format format;
            format.name = ToUtf8(nameProp.bstrVal);
            memcpy(&format.classId, clsProp.bstrVal, sizeof(GUID));
            out.push_back(std::move(format));
        }
        return out;
    }();
    return formats;
}

// The handler name index.ts asked for, for use in error messages. Lowercased to
// match the names index.ts exposes -- upstream spells two of them `Z` and
// `Split`, and a user should not see one spelling in the API and another in an
// error. Falls back to the raw index, which is all there is to say about an
// out-of-range one.
std::string FormatLabel(uint32_t formatIndex) {
    const std::vector<Format>& formats = Formats();
    if (formatIndex >= formats.size()) {
        return "format #" + std::to_string(formatIndex);
    }
    std::string name = formats[formatIndex].name;
    std::transform(name.begin(), name.end(), name.begin(),
                   [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
    return name;
}

}  // namespace

std::vector<std::string> FormatNames() {
    const std::vector<Format>& formats = Formats();
    std::vector<std::string> names;
    names.reserve(formats.size());
    for (const Format& format : formats) {
        names.push_back(format.name);
    }
    return names;
}

namespace {

// Opens one file as a seekable IInStream. Returns nullptr when the file cannot
// be opened; the CInFileStream's destructor closes the handle. Takes a UString
// because its other caller, OpenCallback::GetStream, is handed volume names in
// 7-Zip's own wide-string type.
CMyComPtr<IInStream> OpenFile(const UString& path) {
    // 7-Zip's COM classes declare AddRef/Release private (Z7_COM_UNKNOWN_IMP),
    // so the owning pointer has to be typed as the interface, not the class.
    // The reference count starts at 0, and CMyComPtr's constructor AddRef()s it.
    CInFileStream* file = new CInFileStream;
    CMyComPtr<IInStream> stream(file);
    if (!file->Open(us2fs(path))) {
        return {};
    }
    return stream;
}

// A callback that reports no progress and resolves an archive's sibling volumes.
//
// Implementing IArchiveOpenVolumeCallback is what lets 7-Zip find a multi-volume
// set by itself, given nothing but the first volume's path. The handler asks for
// the start volume's file name through GetProperty(kpidName), derives each
// successive name from it, and requests them through GetStream(); this class
// only has to resolve a bare name against the directory the archive was opened
// from. That keeps volume discovery -- naming schemes, ordering, how many
// volumes there are -- inside the vendored handlers, which is where the format
// knowledge already lives, instead of pushing it onto the caller.
//
// It is also mandatory for two of the registered handlers rather than merely
// convenient:
//
//   - CHandler::Open2 (SplitHandler.cpp:126-133) queries for this interface and
//     returns S_FALSE the moment the query fails, so without it the "Split"
//     format cannot open anything at all.
//   - CInArchive::Open (ZipIn.cpp) reaches ReadVols() for any .zip whose
//     end-of-central-directory still carries its span-mode marker, and
//     ReadVols() dereferences Callback (ZipIn.cpp:2337) with no null check.
//     Passing nullptr therefore SIGSEGVs on such archives; passing this takes
//     the real spanned-zip path instead.
Z7_CLASS_IMP_COM_2(OpenCallback, IArchiveOpenCallback, IArchiveOpenVolumeCallback)
    UString dirPrefix_;
    UString name_;

   public:
    // `path` is the volume the caller named. Split into the directory to resolve
    // sibling volumes against and the file name to report as kpidName.
    explicit OpenCallback(const UString& path) { SplitPathToParts_2(path, dirPrefix_, name_); }
};

Z7_COM7F_IMF(OpenCallback::SetTotal(const UInt64* /*files*/, const UInt64* /*bytes*/)) {
    return S_OK;
}

Z7_COM7F_IMF(OpenCallback::SetCompleted(const UInt64* /*files*/, const UInt64* /*bytes*/)) {
    return S_OK;
}

Z7_COM7F_IMF(OpenCallback::GetProperty(PROPID propID, PROPVARIANT* value)) {
    NWindows::NCOM::CPropVariant prop;
    // kpidName is the only property the handlers ask for here. Notably kpidSize
    // is not: SplitHandler reads it from the stream instead (its GetProperty
    // call is commented out at SplitHandler.cpp:189-195), and answering an
    // unrecognized PROPID with an empty variant is how upstream's own callbacks
    // report "not available".
    if (propID == kpidName) {
        prop = name_;
    }
    prop.Detach(value);
    return S_OK;
}

Z7_COM7F_IMF(OpenCallback::GetStream(const wchar_t* name, IInStream** inStream)) {
    *inStream = nullptr;
    // A missing volume is not an error: it is how a handler learns it has
    // reached the end of the set. SplitHandler.cpp:217-221 and ZipIn's
    // ReadVols2() both stop on S_FALSE and open what they already have.
    CMyComPtr<IInStream> stream = OpenFile(dirPrefix_ + name);
    if (!stream) {
        return S_FALSE;
    }
    *inStream = stream.Detach();
    return S_OK;
}

}  // namespace

HRESULT OpenArchive(const std::string& path, uint32_t formatIndex, OpenedArchive* out) {
    const std::vector<Format>& formats = Formats();
    if (path.empty() || formatIndex >= formats.size()) {
        return E_INVALIDARG;
    }
    GUID clsid = formats[formatIndex].classId;

    UString const widePath = GetUnicodeString(path.c_str(), CP_UTF8);
    CMyComPtr<IInStream> stream = OpenFile(widePath);
    if (!stream) {
        return kVolumeOpenFailed;
    }

    CMyComPtr<IInArchive> archive;
    RINOK(CreateArchiver(&clsid, &IID_IInArchive, reinterpret_cast<void**>(&archive)))
    if (!archive) {
        return E_FAIL;
    }
    // Only the first volume is opened here. When the archive spans several, the
    // handler pulls the rest through this callback's GetStream(), and each one
    // it takes is owned by the handler -- so `out->stream` below is the first
    // volume's handle alone, and closing the archive still releases them all.
    CMyComPtr<IArchiveOpenCallback> const openCallback(new OpenCallback(widePath));
    RINOK(archive->Open(stream, nullptr, openCallback))

    out->archive = archive;
    out->stream = stream;
    return S_OK;
}

std::string HResultSuffix(HRESULT hr) {
    const auto value = static_cast<unsigned>(hr);
    char buffer[128];
    if ((value & 0xffff0000U) == kErrnoFacility) {
        // Away from Windows, 7-Zip packs errno into its own HRESULT facility
        // (C/7zTypes.h), so the low half is a code the C library can name. This
        // is where an unreadable file, a directory, or a permissions problem
        // ends up, and "Is a directory" beats "HRESULT 0x88000015".
        std::snprintf(buffer, sizeof(buffer), " (%s)",
                      std::strerror(static_cast<int>(value & 0xffffU)));
    } else {
        std::snprintf(buffer, sizeof(buffer), " (HRESULT 0x%08x)", value);
    }
    return buffer;
}

std::string OpenErrorMessage(HRESULT hr, const std::string& path, uint32_t formatIndex) {
    const std::string where = "'" + path + "'";
    const std::string format = FormatLabel(formatIndex);
    if (hr == kVolumeOpenFailed) {
        return "could not read " + where + " (the file may be missing, unreadable, or a directory)";
    }
    if (hr == S_FALSE) {
        // By far the most common failure, and the one a user can act on: the
        // handler read the file and decided it is not one of these. Truncated,
        // corrupt, and simply-the-wrong-format archives all land here, and 7-Zip
        // gives us no way to tell them apart -- so say what we actually know
        // rather than printing S_FALSE as if it were an error code.
        return where + " is not a valid " + format + " archive (it may be corrupt, truncated, or a different format)";
    }
    if (hr == E_INVALIDARG) {
        return "cannot open " + where + " as " + format + ": the path or format is invalid";
    }
    if (hr == E_OUTOFMEMORY) {
        return "ran out of memory opening " + where + " as " + format;
    }
    return "failed to open " + where + " as " + format + HResultSuffix(hr);
}

HRESULT FindEntryIndex(IInArchive& archive, const std::string& entryPath, uint32_t* out) {
    // 7-Zip reports separators as the source archive recorded them, so an entry
    // from a Windows-built .zip carries backslashes. Normalize both sides.
    std::string wanted = entryPath;
    std::replace(wanted.begin(), wanted.end(), '\\', '/');

    UInt32 count = 0;
    RINOK(archive.GetNumberOfItems(&count))
    for (UInt32 i = 0; i < count; i++) {
        NWindows::NCOM::CPropVariant pathProp;
        if (archive.GetProperty(i, kpidPath, &pathProp) != S_OK || pathProp.vt != VT_BSTR) {
            // A format that records no name has nothing to match against.
            continue;
        }
        std::string candidate = ToUtf8(pathProp.bstrVal);
        std::replace(candidate.begin(), candidate.end(), '\\', '/');
        if (candidate == wanted) {
            *out = i;
            return S_OK;
        }
    }
    return kEntryNotFound;
}

std::string FindEntryErrorMessage(HRESULT hr, const std::string& entryPath) {
    if (hr == kEntryNotFound) {
        return "the archive has no entry named '" + entryPath + "'";
    }
    return "failed to look up the entry '" + entryPath + "' in the archive" + HResultSuffix(hr);
}

namespace {

struct Entry {
    std::optional<std::string> entryPath;
    std::optional<uint64_t> size;
    std::optional<uint32_t> crc32;
    bool isDirectory = false;
    bool isEncrypted = false;
};

bool GetBoolProp(IInArchive& archive, UInt32 index, PROPID id) {
    NWindows::NCOM::CPropVariant prop;
    if (archive.GetProperty(index, id, &prop) != S_OK) {
        return false;
    }
    return prop.vt == VT_BOOL && VARIANT_BOOLToBool(prop.boolVal);
}

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

        UInt32 count = 0;
        if (opened.archive->GetNumberOfItems(&count) != S_OK) {
            SetError("could not read the archive's item count; it is likely corrupt");
            return;
        }
        entries_.reserve(count);
        for (UInt32 i = 0; i < count; i++) {
            Entry entry;

            NWindows::NCOM::CPropVariant pathProp;
            if (opened.archive->GetProperty(i, kpidPath, &pathProp) == S_OK &&
                pathProp.vt == VT_BSTR) {
                // An empty BSTR stays an empty string: the format DID record a
                // name and that name is "". Only a missing kpidPath is undefined.
                entry.entryPath = ToUtf8(pathProp.bstrVal);
            }

            NWindows::NCOM::CPropVariant sizeProp;
            if (opened.archive->GetProperty(i, kpidSize, &sizeProp) == S_OK) {
                UInt64 value = 0;
                // ConvertPropVariantToUInt64() throws for a variant type it does
                // not recognize. Exceptions must not escape Execute(), and a
                // missing/odd size is not worth failing the whole listing over.
                try {
                    if (ConvertPropVariantToUInt64(sizeProp, value)) {
                        entry.size = value;
                    }
                } catch (...) {  // NOLINT(bugprone-empty-catch)
                    // leave entry.size unset: reported as undefined, not 0
                }
            }

            NWindows::NCOM::CPropVariant crcProp;
            if (opened.archive->GetProperty(i, kpidCRC, &crcProp) == S_OK &&
                crcProp.vt == VT_UI4) {
                entry.crc32 = crcProp.ulVal;
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
            deferred_.Reject(
                Napi::Error::New(Env(), "failed to build the entry list").Value());
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
            object.Set("entryPath",
                       entry.entryPath.has_value()
                           ? Napi::Value(Napi::String::New(env, *entry.entryPath))
                           : env.Undefined());
            // Left undefined rather than 0 when the format records no size:
            // 0 is a real length, and .Z/.bz2/.lzma members genuinely can be
            // empty. Only the caller can tell "empty" from "unknown".
            object.Set("size", entry.size.has_value()
                                   ? Napi::Value(Napi::Number::New(
                                         env, static_cast<double>(*entry.size)))
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
