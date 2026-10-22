#include "sevenZip.h"

#include <algorithm>
#include <atomic>
#include <cctype>
#include <cstring>
#include <limits>
#include <mutex>
#include <string>
#include <utility>

#include "7zCrc.h"
#include "7zip/Archive/IArchive.h"
#include "7zip/IStream.h"
#include "7zip/PropID.h"
#include "Common/MyCom.h"
#include "Common/StringConvert.h"
#include "Common/UTFConvert.h"
#include "Common/Wildcard.h"
#include "Windows/PropVariant.h"
#include "Windows/PropVariantConv.h"

#ifdef _WIN32
#include "Windows/FileName.h"
#else
#include <fcntl.h>
#include <sys/types.h>
#include <unistd.h>

#include <cerrno>
#endif

// 7-Zip's own archive factory exports, declared here because the vendored tree
// ships no header for them
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

/** Converts a nullable 7-Zip BSTR property to an owning UTF-8 string. */
std::string ToUtf8(const BSTR bstr) {  // NOLINT(misc-misplaced-const): BSTR is
                                       // a typedef for a pointer, and this is
                                       // 7-Zip's own spelling of the parameter
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
    // Upstream requires this once, before any other CRC function is called
    std::call_once(g_initOnce, []() { CrcGenerateTable(); });
}

namespace {

/**
 * Pairs one handler's display name with its COM class ID from the same property
 * sweep, so an unreadable field causes the whole handler to be omitted.
 */
struct Format {
    std::string name;
    GUID classId{};
};

/**
 * Lazily enumerates the fixed, statically registered handler set once and
 * returns the immutable table without re-enumerating on archive opens.
 */
const std::vector<Format>& Formats() {
    // Function-local static: initialized on first use, and the C++ runtime makes
    // that thread-safe. Archives are opened from libuv pool threads, so this
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

// Caps each OS read: ReadFile takes a 32-bit length and macOS rejects a pread
// longer than INT_MAX, so a longer read returns short, which Read() allows
constexpr UInt32 kMaxReadBytes = UInt32{1} << 30U;

// The furthest position Seek() moves to, which every OS can read at
constexpr UInt64 kMaxPosition = static_cast<UInt64>(std::numeric_limits<Int64>::max());

// ---- OS calls ----

#ifdef _WIN32
using FileHandle = HANDLE;

/** The paths to try opening: `path`, then the long-path form when there is one. */
struct OpenPaths {
    FString path;
    UString superPath;
    bool hasSuperPath = false;
};

/** The handle that refers to no file. */
FileHandle NoFile() { return INVALID_HANDLE_VALUE; }

/** The paths to try opening for `path`. Allocates, and throws CNewException. */
OpenPaths ToOpenPaths(const UString& path) {
    OpenPaths paths;
    paths.path = us2fs(path);
    paths.hasSuperPath = NWindows::NFile::NName::GetSuperPath(paths.path, paths.superPath, true);
    return paths;
}

/** Opens `path` read-only, sharing every kind of access, returning NoFile() on an error. */
FileHandle OpenSharedPath(const wchar_t* path) {
    return ::CreateFileW(path, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, nullptr,
                         OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
}

/**
 * Opens `paths` read-only, sharing every kind of access, falling back to the
 * long-path form the same way CInFile does. Returns NoFile() on an error.
 */
FileHandle OpenShared(const OpenPaths& paths) {
    FileHandle const handle = OpenSharedPath(paths.path);
    if (handle == NoFile() && paths.hasSuperPath) {
        return OpenSharedPath(paths.superPath);
    }
    return handle;
}

/** Closes `handle`, ignoring errors, since it is released either way. */
void CloseFile(FileHandle handle) { static_cast<void>(::CloseHandle(handle)); }

/**
 * Reads up to `size` bytes at `offset`, reading nothing at or past the end.
 * Returns false on an error, leaving it in GetLastError().
 */
bool ReadAt(FileHandle handle, UInt64 offset, void* data, UInt32 size, UInt32& got) {
    got = 0;
    OVERLAPPED overlapped{};
    overlapped.Offset = static_cast<DWORD>(offset);
    overlapped.OffsetHigh = static_cast<DWORD>(offset >> 32U);
    DWORD read = 0;
    // A positioned read at or past the end fails with ERROR_HANDLE_EOF, where
    // CInFileStream reads nothing
    if (::ReadFile(handle, data, size, &read, &overlapped) == FALSE && ::GetLastError() != ERROR_HANDLE_EOF) {
        return false;
    }
    got = read;
    return true;
}

/** Sets `size` to the file's current size. Returns false on an error, leaving it in GetLastError(). */
bool CurrentSize(FileHandle handle, UInt64& size) {
    LARGE_INTEGER result{};
    if (::GetFileSizeEx(handle, &result) == FALSE) {
        return false;
    }
    size = static_cast<UInt64>(result.QuadPart);
    return true;
}
#else
using FileHandle = int;

/** The path to open. */
struct OpenPaths {
    FString path;
};

/** The descriptor that refers to no file. */
FileHandle NoFile() { return -1; }

/** The paths to try opening for `path`. Allocates, and throws CNewException. */
OpenPaths ToOpenPaths(const UString& path) { return {us2fs(path)}; }

/**
 * Opens `paths` read-only, returning NoFile() on an error. POSIX never stops
 * another process writing, renaming, or deleting an open file. O_CLOEXEC keeps
 * a spawned child from inheriting it.
 */
FileHandle OpenShared(const OpenPaths& paths) {
    // NOLINTNEXTLINE(cppcoreguidelines-pro-type-vararg,hicpp-vararg): open() is variadic for its mode
    FileHandle handle = ::open(paths.path, O_RDONLY | O_CLOEXEC);
    while (handle < 0 && errno == EINTR) {
        // NOLINTNEXTLINE(cppcoreguidelines-pro-type-vararg,hicpp-vararg): open() is variadic for its mode
        handle = ::open(paths.path, O_RDONLY | O_CLOEXEC);
    }
    return handle < 0 ? NoFile() : handle;
}

/** Closes `handle`, ignoring errors. Not retried on EINTR: the descriptor is released either way. */
void CloseFile(FileHandle handle) { static_cast<void>(::close(handle)); }

/**
 * Reads up to `size` bytes at `offset`, reading nothing at or past the end.
 * Returns false on an error, leaving it in errno, which 7-Zip's GetLastError()
 * returns on POSIX.
 */
bool ReadAt(FileHandle handle, UInt64 offset, void* data, UInt32 size, UInt32& got) {
    got = 0;
    if (offset > static_cast<UInt64>(std::numeric_limits<off_t>::max())) {
        return true;
    }
    ssize_t read = ::pread(handle, data, size, static_cast<off_t>(offset));
    while (read < 0 && errno == EINTR) {
        read = ::pread(handle, data, size, static_cast<off_t>(offset));
    }
    if (read < 0) {
        return false;
    }
    got = static_cast<UInt32>(read);
    return true;
}

/** Sets `size` to the file's current size. Returns false on an error, leaving it in errno. */
bool CurrentSize(FileHandle handle, UInt64& size) {
    // lseek() rather than fstat(), so block devices report their size too.
    // Reads are positioned, so moving the offset is harmless.
    off_t const result = ::lseek(handle, 0, SEEK_END);
    if (result < 0) {
        return false;
    }
    size = static_cast<UInt64>(result);
    return true;
}
#endif

/** The last OS error as a failing HRESULT. */
HRESULT LastErrorHResult() {
    DWORD const error = ::GetLastError();
    return error == 0 ? E_FAIL : HRESULT_FROM_WIN32(error);
}

// ---- the stream ----

// clang-format off: the macro opens a class body clang-format cannot see, so it
// reads everything below as file scope and unindents it. The NOLINT is about
// the code the macro generates, not about anything written here.
/**
 * A read-only file stream on a raw OS handle that other processes can write,
 * rename, and delete while it is open, on every OS. CInFileStream only shares
 * reads on Windows, so there a write to, rename of, or deletion of an open
 * volume would fail. Reads are positioned, so the stream keeps its own
 * position.
 */
// NOLINTNEXTLINE(misc-const-correctness,readability-inconsistent-ifelse-braces)
Z7_CLASS_IMP_IInStream(SharedInFileStream)
    FileHandle handle_ = NoFile();
    UInt64 position_ = 0;

   public:
    SharedInFileStream() = default;
    SharedInFileStream(const SharedInFileStream&) = delete;
    SharedInFileStream& operator=(const SharedInFileStream&) = delete;
    SharedInFileStream(SharedInFileStream&&) = delete;
    SharedInFileStream& operator=(SharedInFileStream&&) = delete;

    /** Closes the file. */
    ~SharedInFileStream() {
        if (handle_ != NoFile()) {
            CloseFile(handle_);
        }
    }

    /** Opens `paths` read-only. Allocates nothing, so it cannot throw. */
    bool Open(const OpenPaths& paths) {
        handle_ = OpenShared(paths);
        return handle_ != NoFile();
    }
};
// clang-format on

/** Reads up to `size` bytes from the current position, reporting 0 at the end of the file. */
Z7_COM7F_IMF(SharedInFileStream::Read(void* data, UInt32 size, UInt32* processedSize)) {
    if (processedSize != nullptr) {
        *processedSize = 0;
    }
    UInt32 got = 0;
    if (!ReadAt(handle_, position_, data, std::min(size, kMaxReadBytes), got)) {
        return LastErrorHResult();
    }
    position_ += got;
    if (processedSize != nullptr) {
        *processedSize = got;
    }
    return S_OK;
}

/** Moves the current position, failing rather than moving it before the start or past kMaxPosition. */
Z7_COM7F_IMF(SharedInFileStream::Seek(Int64 offset, UInt32 seekOrigin, UInt64* newPosition)) {
    UInt64 base = 0;
    switch (seekOrigin) {
        case STREAM_SEEK_SET:
            break;
        case STREAM_SEEK_CUR:
            base = position_;
            break;
        case STREAM_SEEK_END:
            // The current size rather than the size at open, the same as
            // CInFileStream, so a file that grew is seen at its new end
            if (!CurrentSize(handle_, base)) {
                return LastErrorHResult();
            }
            break;
        default:
            return STG_E_INVALIDFUNCTION;
    }
    if (offset < 0) {
        // Negated after adding 1, so the most negative offset doesn't overflow
        if (static_cast<UInt64>(-(offset + 1)) + 1 > base) {
            return HRESULT_WIN32_ERROR_NEGATIVE_SEEK;
        }
    } else if (base > kMaxPosition || static_cast<UInt64>(offset) > kMaxPosition - base) {
        return E_INVALIDARG;
    }
    position_ = base + offset;
    if (newPosition != nullptr) {
        *newPosition = position_;
    }
    return S_OK;
}

/**
 * Opens a 7-Zip UString path as an owned seekable stream whose destructor closes
 * its handle, returning null for an ordinary open failure.
 */
CMyComPtr<IInStream> OpenFile(const UString& path) {
    // 7-Zip's COM classes declare AddRef/Release private (Z7_COM_UNKNOWN_IMP),
    // so the owning pointer has to be typed as the interface, not the class,
    // and Open() has to be called through the raw pointer before ownership is
    // handed over. The reference count starts at 0, so until CMyComPtr AddRef()s
    // it below nothing else holds this and `delete` is the whole cleanup.
    //
    // The conversion is hoisted above the `new` rather than written inline in
    // the Open() call, which is what makes that cleanup sufficient: it
    // allocates and throws CNewException, and called inline it would run while
    // `file` was still raw-owned, leaking the stream and its file handle.
    // Nothing left between the new and the delete can throw.
    //
    // A local CMyComPtr taking ownership right after the new would be the more
    // obviously correct shape, but clang-analyzer models the returned copy as
    // elided while still running the local's destructor and reports a
    // use-after-free inside MyCom.h, which a vendored file cannot annotate.
    OpenPaths const paths = ToOpenPaths(path);
    auto* file = new SharedInFileStream;
    if (!file->Open(paths)) {
        delete file;
        return {};
    }
    return {file};
}

// clang-format off: the macro opens a class body clang-format cannot see, so it
// reads everything below as file scope and unindents it. The NOLINT is about
// the code the macro generates, not about anything written here.
/**
 * Provides cancellable open progress and resolves handler-derived sibling
 * volume names relative to the first volume's directory.
 *
 * The callback is mandatory: Split refuses to open without it, while Zip can
 * dereference a missing callback for archives retaining a span marker.
 */
// NOLINTNEXTLINE(misc-const-correctness,readability-inconsistent-ifelse-braces)
Z7_CLASS_IMP_COM_2(OpenCallback, IArchiveOpenCallback, IArchiveOpenVolumeCallback)
    UString dirPrefix_;
    UString name_;

    // Borrowed, not owned. It lives in the Pump or ListJob driving this open,
    // which outlives the open by construction, since the open runs inside one
    // of that object's own methods. Null when the caller cannot be cancelled.
    const std::atomic<bool>* abort_ = nullptr;

   public:
    /** Splits the named first volume into the sibling-resolution directory and kpidName basename. */
    OpenCallback(const UString& path, const std::atomic<bool>* abort) : abort_(abort) {
        SplitPathToParts_2(path, dirPrefix_, name_);
    }

    /** Reads the optional borrowed cancellation flag without imposing synchronization beyond cancellation itself. */
    [[nodiscard]] bool Aborted() const { return abort_ != nullptr && abort_->load(std::memory_order_relaxed); }
};
// clang-format on

/** Accepts 7-Zip's open total unless the owning job has already been cancelled. */
Z7_COM7F_IMF(OpenCallback::SetTotal(const UInt64* /*files*/, const UInt64* /*bytes*/)) {
    return Aborted() ? E_ABORT : S_OK;
}

/** Interrupts an in-progress archive open when its owner has requested cancellation. */
Z7_COM7F_IMF(OpenCallback::SetCompleted(const UInt64* /*files*/, const UInt64* /*bytes*/)) {
    return Aborted() ? E_ABORT : S_OK;
}

/** Supplies the first volume's basename through kpidName and reports other properties unavailable. */
Z7_COM7F_IMF(OpenCallback::GetProperty(PROPID propID, PROPVARIANT* value)) {
    NWindows::NCOM::CPropVariant prop;

    // kpidName is the only property the handlers ask for here. Answering an
    // unrecognized PROPID with an empty variant is how upstream's own callbacks
    // report "not available".
    try {
        if (propID == kpidName) {
            // Copies the name into a BSTR, so it allocates, and this method
            // carries upstream's `throw()`, noexcept under C++17, so an
            // escaping exception would call std::terminate()
            prop = name_;
        }
    } catch (...) {
        return E_OUTOFMEMORY;
    }
    // Nothrow: Detach() moves the variant's bytes into `value` and leaves this
    // one empty
    prop.Detach(value);
    return S_OK;
}

/** Opens a requested sibling volume under the original archive directory. */
Z7_COM7F_IMF(OpenCallback::GetStream(const wchar_t* name, IInStream** inStream)) {
    *inStream = nullptr;
    // Checked here too: a spanned set opens one file per volume, and a handler
    // that never reports progress would otherwise walk all of them after a
    // cancel. S_FALSE would be wrong here: it means "no such volume", which
    // handlers take as a normal end of the set.
    if (Aborted()) {
        return E_ABORT;
    }
    // A missing volume is not an error: S_FALSE is how a handler learns it has
    // reached the end of the set, and it opens what it already has.
    //
    // Building the path and constructing the stream both allocate, and
    // this method carries upstream's `throw()`, so an escaping std::bad_alloc
    // would call std::terminate(). E_OUTOFMEMORY rather than S_FALSE, which
    // would turn running out of memory into a silently short archive.
    try {
        // Initialized from the call rather than assigned to afterwards, so that
        // the stream is only ever owned by one pointer
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

    // CreateArchiver takes its out-parameter as void**, like every COM factory
    // in the vendored tree, so the cast is unavoidable.
    // NOLINTNEXTLINE(cppcoreguidelines-pro-type-reinterpret-cast)
    RINOK(CreateArchiver(&clsid, &IID_IInArchive, reinterpret_cast<void**>(&archive)))
    if (!archive) {
        return E_FAIL;
    }
    // Only the first volume is opened here. When the archive spans several, the
    // handler pulls the rest through this callback's GetStream(), and each one
    // it takes is owned by the handler, so `out->stream` below is the first
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
    // exception escape, and an odd property is not worth failing over, so it is
    // absorbed here rather than at each of them.
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
    // Bounds-checked before anything is read with it. The index comes straight
    // from the caller, and 7-Zip's handlers index their item tables with an
    // unchecked operator[], so an out-of-range value reads past the end rather
    // than failing the lookup.
    UInt32 count = 0;
    if (archive.GetNumberOfItems(&count) != S_OK || index >= count) {
        return false;
    }

    std::string candidate;
    if (!GetStringProp(archive, index, kpidPath, &candidate)) {
        // A format that records no name has nothing to match against
        return false;
    }
    return NormalizeEntryPath(std::move(candidate)) == normalizedPath;
}

HRESULT FindEntryIndex(IInArchive& archive, const std::string& entryPath, uint32_t* out) {
    // Both sides normalized, so `sub\\file.bin` and `sub/file.bin` name the same
    // entry however the archive spells it
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
