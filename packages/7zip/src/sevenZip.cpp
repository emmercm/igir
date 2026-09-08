#include "sevenZip.h"

#include <algorithm>
#include <atomic>
#include <cctype>
#include <cstring>
#include <mutex>
#include <string>
#include <utility>

#include "7zCrc.h"
#include "7zip/Archive/IArchive.h"
#include "7zip/Common/FileStreams.h"
#include "7zip/PropID.h"
#include "Common/StringConvert.h"
#include "Common/UTFConvert.h"
#include "Common/Wildcard.h"
#include "Windows/PropVariant.h"
#include "Windows/PropVariantConv.h"

// 7-Zip's own archive factory exports, declared here because the vendored tree
// ships no header for them.
STDAPI GetNumberOfFormats(UInt32* numFormats);
STDAPI GetHandlerProperty2(UInt32 formatIndex, PROPID propID, PROPVARIANT* value);
STDAPI CreateArchiver(const GUID* clsid, const GUID* iid, void** outObject);

namespace sevenzip {

// Z7_COM7F_IMF and friends expand to 7-Zip's own `throw()` specification on
// every COM method below. It comes from the vendored interface declarations
// these definitions have to match, so none of them can be respelled `noexcept`
// from here.
// NOLINTBEGIN(modernize-use-noexcept)

// PROPVARIANT is a tagged union whose `vt` field is the tag, so reading the
// member that `vt` names is the only way its API can be used at all. Every
// cppcoreguidelines-pro-type-union-access suppression below is that, and each
// one is guarded by a `vt` check on the line above it.

namespace {

// A once_flag is mutable by definition, and this one guards a process-wide
// initialization that 7-Zip only lets us perform once.
// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
std::once_flag g_initOnce;

std::string ToUtf8(const BSTR bstr) {  // NOLINT(misc-misplaced-const): BSTR is
                                       // a typedef for a pointer, and this is
                                       // 7-Zip's own spelling of the parameter.
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
    // Upstream requires this once, before any other CRC function is called.
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

// The handler set is fixed at build time -- each compiled-in handler registers
// itself from a static initializer before main() -- so this table is built once
// and read thereafter, and no archive open re-enumerates the handlers.
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
            if (GetHandlerProperty2(i, NArchive::NHandlerPropID::kName, &nameProp) != S_OK || nameProp.vt != VT_BSTR) {
                continue;
            }
            NWindows::NCOM::CPropVariant clsProp;
            if (GetHandlerProperty2(i, NArchive::NHandlerPropID::kClassID, &clsProp) != S_OK || clsProp.vt != VT_BSTR) {
                continue;
            }
            // kClassID is a raw 16-byte GUID carried in a BSTR.
            // NOLINTNEXTLINE(cppcoreguidelines-pro-type-union-access)
            if (::SysStringByteLen(clsProp.bstrVal) != sizeof(GUID)) {
                continue;
            }
            Format format;
            // NOLINTNEXTLINE(cppcoreguidelines-pro-type-union-access)
            format.name = ToUtf8(nameProp.bstrVal);
            // NOLINTNEXTLINE(cppcoreguidelines-pro-type-union-access)
            memcpy(&format.classId, clsProp.bstrVal, sizeof(GUID));
            out.push_back(std::move(format));
        }
        return out;
    }();
    return formats;
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

std::string FormatLabel(uint32_t formatIndex) {
    const std::vector<Format>& formats = Formats();
    if (formatIndex >= formats.size()) {
        return "format #" + std::to_string(formatIndex);
    }
    std::string name = formats[formatIndex].name;
    std::ranges::transform(name, name.begin(), [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
    return name;
}

namespace {

// Opens one file as a seekable IInStream. Returns nullptr when the file cannot
// be opened; the CInFileStream's destructor closes the handle. Takes a UString
// because its other caller, OpenCallback::GetStream, is handed volume names in
// 7-Zip's own wide-string type.
CMyComPtr<IInStream> OpenFile(const UString& path) {
    // 7-Zip's COM classes declare AddRef/Release private (Z7_COM_UNKNOWN_IMP),
    // so the owning pointer has to be typed as the interface, not the class --
    // which means Open() has to be called through the raw pointer, before
    // ownership is handed over. The reference count starts at 0, so until
    // CMyComPtr's constructor AddRef()s it below, nothing else can be holding
    // this and deleting it directly is the whole of the cleanup.
    auto* file = new CInFileStream;
    if (!file->Open(us2fs(path))) {
        delete file;
        return {};
    }
    return {file};
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
//   - the Split handler queries for this interface and refuses to open anything
//     at all when the query fails.
//   - the Zip handler dereferences the callback with no null check for any .zip
//     whose end-of-central-directory still carries its span-mode marker, so
//     passing nullptr would SIGSEGV on such archives.
// clang-format off: the macro opens a class body clang-format cannot see, so it
// reads everything below as file scope and unindents it. The NOLINT is about
// the code the macro generates, not about anything written here.
// NOLINTNEXTLINE(misc-const-correctness,readability-inconsistent-ifelse-braces)
Z7_CLASS_IMP_COM_2(OpenCallback, IArchiveOpenCallback, IArchiveOpenVolumeCallback)
    UString dirPrefix_;
    UString name_;
    // Borrowed, not owned. It lives in the Pump or ListJob driving this open,
    // which outlives the open by construction -- the open runs inside one of
    // that object's own methods. Null when the caller cannot be cancelled.
    const std::atomic<bool>* abort_ = nullptr;

   public:
    // `path` is the volume the caller named. Split into the directory to
    // resolve sibling volumes against and the file name to report as kpidName.
    OpenCallback(const UString& path, const std::atomic<bool>* abort) : abort_(abort) {
        SplitPathToParts_2(path, dirPrefix_, name_);
    }

    [[nodiscard]] bool Aborted() const { return abort_ != nullptr && abort_->load(std::memory_order_relaxed); }
};
// clang-format on

Z7_COM7F_IMF(OpenCallback::SetTotal(const UInt64* /*files*/, const UInt64* /*bytes*/)) {
    return Aborted() ? E_ABORT : S_OK;
}

// The only place an in-progress open can be interrupted. The handlers call this
// as they work through the header; returning anything but S_OK unwinds Open().
Z7_COM7F_IMF(OpenCallback::SetCompleted(const UInt64* /*files*/, const UInt64* /*bytes*/)) {
    return Aborted() ? E_ABORT : S_OK;
}

Z7_COM7F_IMF(OpenCallback::GetProperty(PROPID propID, PROPVARIANT* value)) {
    NWindows::NCOM::CPropVariant prop;
    // kpidName is the only property the handlers ask for here. Answering an
    // unrecognized PROPID with an empty variant is how upstream's own callbacks
    // report "not available".
    try {
        if (propID == kpidName) {
            // Copies the name into a BSTR, so it allocates -- and this method
            // carries upstream's `throw()`, which C++17 makes a synonym for
            // noexcept, so an escaping exception would call std::terminate()
            // instead of failing the open.
            prop = name_;
        }
    } catch (...) {
        return E_OUTOFMEMORY;
    }
    // Nothrow: Detach() moves the variant's bytes into `value` and leaves this
    // one empty.
    prop.Detach(value);
    return S_OK;
}

Z7_COM7F_IMF(OpenCallback::GetStream(const wchar_t* name, IInStream** inStream)) {
    *inStream = nullptr;
    // Checked here too: a spanned set opens one file per volume, and a handler
    // that never reports progress would otherwise walk all of them after a
    // cancel. Returning S_FALSE rather than E_ABORT would be wrong -- that means
    // "no such volume", which the handlers take as a normal end of the set.
    if (Aborted()) {
        return E_ABORT;
    }
    // A missing volume is not an error: S_FALSE is how a handler learns it has
    // reached the end of the set, and it opens what it already has.
    //
    // Building the path and constructing the CInFileStream both allocate, and
    // this method carries upstream's `throw()` -- noexcept under C++17 -- so an
    // escaping std::bad_alloc would call std::terminate() rather than fail the
    // open. E_OUTOFMEMORY rather than S_FALSE deliberately: S_FALSE would turn
    // running out of memory into a silently short archive.
    try {
        // Initialized from the call rather than assigned to afterwards, so that
        // the stream is only ever owned by one pointer.
        CMyComPtr<IInStream> stream = OpenFile(dirPrefix_ + name);
        if (!stream) {
            return S_FALSE;
        }
        *inStream = stream.Detach();
    } catch (...) {
        return E_OUTOFMEMORY;
    }
    return S_OK;
}

}  // namespace

HRESULT OpenArchive(const std::string& path, uint32_t formatIndex, OpenedArchive* out, const std::atomic<bool>* abort) {
    const std::vector<Format>& formats = Formats();
    if (path.empty() || formatIndex >= formats.size()) {
        return E_INVALIDARG;
    }
    GUID const clsid = formats[formatIndex].classId;

    UString const widePath = GetUnicodeString(path.c_str(), CP_UTF8);
    CMyComPtr<IInStream> const stream = OpenFile(widePath);
    if (!stream) {
        return kVolumeOpenFailed;
    }

    CMyComPtr<IInArchive> archive;
    // CreateArchiver takes the out-parameter as void**, which is how every
    // COM factory in the vendored tree is declared; there is no way to reach
    // it without the cast.
    // NOLINTNEXTLINE(cppcoreguidelines-pro-type-reinterpret-cast)
    RINOK(CreateArchiver(&clsid, &IID_IInArchive, reinterpret_cast<void**>(&archive)))
    if (!archive) {
        return E_FAIL;
    }
    // Only the first volume is opened here. When the archive spans several, the
    // handler pulls the rest through this callback's GetStream(), and each one
    // it takes is owned by the handler -- so `out->stream` below is the first
    // volume's handle alone, and closing the archive still releases them all.
    CMyComPtr<IArchiveOpenCallback> const openCallback(new OpenCallback(widePath, abort));
    RINOK(archive->Open(stream, nullptr, openCallback))

    out->archive = archive;
    out->stream = stream;
    return S_OK;
}

bool GetStringProp(IInArchive& archive, uint32_t index, PROPID id, std::string* out) {
    NWindows::NCOM::CPropVariant prop;
    if (archive.GetProperty(index, id, &prop) != S_OK || prop.vt != VT_BSTR) {
        return false;
    }
    // NOLINTNEXTLINE(cppcoreguidelines-pro-type-union-access)
    *out = ToUtf8(prop.bstrVal);
    return true;
}

bool GetUInt64Prop(IInArchive& archive, uint32_t index, PROPID id, uint64_t* out) {
    NWindows::NCOM::CPropVariant prop;
    if (archive.GetProperty(index, id, &prop) != S_OK) {
        return false;
    }
    UInt64 value = 0;
    // ConvertPropVariantToUInt64() throws for a variant type it does not
    // recognize. Every caller runs inside a boundary that must not let an
    // exception escape, and a missing or odd property is not worth failing the
    // whole operation over, so it is absorbed here rather than at each of them.
    try {
        if (!ConvertPropVariantToUInt64(prop, value)) {
            return false;
        }
    } catch (...) {
        return false;
    }
    *out = value;
    return true;
}

bool GetUInt32Prop(IInArchive& archive, uint32_t index, PROPID id, uint32_t* out) {
    NWindows::NCOM::CPropVariant prop;
    if (archive.GetProperty(index, id, &prop) != S_OK || prop.vt != VT_UI4) {
        return false;
    }
    // NOLINTNEXTLINE(cppcoreguidelines-pro-type-union-access)
    *out = prop.ulVal;
    return true;
}

bool GetBoolProp(IInArchive& archive, uint32_t index, PROPID id) {
    NWindows::NCOM::CPropVariant prop;
    if (archive.GetProperty(index, id, &prop) != S_OK) {
        return false;
    }
    // NOLINTNEXTLINE(cppcoreguidelines-pro-type-union-access)
    return prop.vt == VT_BOOL && VARIANT_BOOLToBool(prop.boolVal);
}

std::string NormalizeEntryPath(std::string entryPath) {
    std::ranges::replace(entryPath, '\\', '/');
    return entryPath;
}

bool EntryIndexMatches(IInArchive& archive, uint32_t index, const std::string& normalizedPath) {
    // Bounds-checked before anything is read with it. The index reaches here
    // straight from the caller, and 7-Zip's handlers index their item tables
    // with an unchecked operator[] -- so an out-of-range value is not a lookup
    // that fails, it is a read of whatever happens to sit past the end.
    UInt32 count = 0;
    if (archive.GetNumberOfItems(&count) != S_OK || index >= count) {
        return false;
    }

    std::string candidate;
    if (!GetStringProp(archive, index, kpidPath, &candidate)) {
        // A format that records no name has nothing to match against.
        return false;
    }
    return NormalizeEntryPath(std::move(candidate)) == normalizedPath;
}

HRESULT FindEntryIndex(IInArchive& archive, const std::string& entryPath, uint32_t* out) {
    // Both sides normalized, so `sub\\file.bin` and `sub/file.bin` name the same
    // entry however the archive spells it.
    std::string const wanted = NormalizeEntryPath(entryPath);

    UInt32 count = 0;
    RINOK(archive.GetNumberOfItems(&count))
    for (UInt32 i = 0; i < count; i++) {
        if (EntryIndexMatches(archive, i, wanted)) {
            *out = i;
            return S_OK;
        }
    }
    return kEntryNotFound;
}

// NOLINTEND(modernize-use-noexcept)

}  // namespace sevenzip
