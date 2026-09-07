#include <algorithm>
#include <atomic>
#include <cctype>
#include <cstring>
#include <mutex>
#include <string>
#include <utility>

#include "sevenZip.h"
#include "7zip/Archive/IArchive.h"
#include "7zip/PropID.h"
#include "Common/UTFConvert.h"
#include "Windows/PropVariant.h"
#include "7zCrc.h"
#include "7zip/Common/FileStreams.h"
#include "Common/StringConvert.h"
#include "Common/Wildcard.h"
#include "Windows/PropVariantConv.h"

// Declared in deps/7zip/CPP/7zip/Archive/ArchiveExports.cpp, compiled through
// stubs/archiveExports.cpp.
STDAPI GetNumberOfFormats(UInt32* numFormats);
STDAPI GetHandlerProperty2(UInt32 formatIndex, PROPID propID, PROPVARIANT* value);
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
    std::transform(name.begin(), name.end(), name.begin(),
                   [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
    return name;
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
    // Borrowed, not owned. It lives in the Pump or ListJob driving this open,
    // which outlives the open by construction -- the open runs inside one of
    // that object's own methods. Null when the caller cannot be cancelled.
    const std::atomic<bool>* abort_ = nullptr;

   public:
    // `path` is the volume the caller named. Split into the directory to resolve
    // sibling volumes against and the file name to report as kpidName.
    OpenCallback(const UString& path, const std::atomic<bool>* abort) : abort_(abort) {
        SplitPathToParts_2(path, dirPrefix_, name_);
    }

    bool Aborted() const { return abort_ != nullptr && abort_->load(std::memory_order_relaxed); }
};

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
    // Checked here too: a spanned set opens one file per volume, and a handler
    // that never reports progress would otherwise walk all of them after a
    // cancel. Returning S_FALSE rather than E_ABORT would be wrong -- that means
    // "no such volume", which the handlers take as a normal end of the set.
    if (Aborted()) {
        return E_ABORT;
    }
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

HRESULT OpenArchive(const std::string& path, uint32_t formatIndex, OpenedArchive* out,
                    const std::atomic<bool>* abort) {
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
    *out = prop.ulVal;
    return true;
}

bool GetBoolProp(IInArchive& archive, uint32_t index, PROPID id) {
    NWindows::NCOM::CPropVariant prop;
    if (archive.GetProperty(index, id, &prop) != S_OK) {
        return false;
    }
    return prop.vt == VT_BOOL && VARIANT_BOOLToBool(prop.boolVal);
}

std::string NormalizeEntryPath(std::string entryPath) {
    std::replace(entryPath.begin(), entryPath.end(), '\\', '/');
    return entryPath;
}

bool EntryIndexMatches(IInArchive& archive, uint32_t index, const std::string& normalizedPath) {
    std::string candidate;
    if (!GetStringProp(archive, index, kpidPath, &candidate)) {
        // A format that records no name has nothing to match against.
        return false;
    }
    return NormalizeEntryPath(std::move(candidate)) == normalizedPath;
}

HRESULT FindEntryIndex(IInArchive& archive, const std::string& entryPath, uint32_t* out) {
    // See the note in sevenZip.h: the separator tolerance is input-side only.
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

}  // namespace sevenzip
