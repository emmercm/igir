#include <napi.h>

#include <algorithm>
#include <array>
#include <bit>
#include <cerrno>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <exception>
#include <limits>
#include <memory>
#include <new>
#include <span>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

#include "deps/maxcso/libdeflate/libdeflate.h"
#include "deps/maxcso/lz4/lib/lz4.h"
#include "deps/maxcso/src/cso.h"
#include "deps/maxcso/src/dax.h"
#include "deps/maxcso/zlib/zlib.h"

#ifdef _WIN32
#include <windows.h>
#else
#include <fcntl.h>
#include <unistd.h>
#endif

static_assert(sizeof(maxcso::CSOHeader) == 24, "CSOHeader must match the on-disk layout");
static_assert(sizeof(maxcso::DAXHeader) == 32, "DAXHeader must match the on-disk layout");
static_assert(sizeof(maxcso::DAXNCArea) == 8, "DAXNCArea must match the on-disk layout");
// Headers and index tables are read straight into native integers
static_assert(std::endian::native == std::endian::little, "only little-endian targets are supported");

// ---- file I/O ----

// A read-only file on a raw OS handle, like Dolphin's DirectIOFile, rather than stdio. The handle
// is never inherited by a spawned child process: CreateFileW handles are non-inheritable without
// SECURITY_ATTRIBUTES, and O_CLOEXEC closes the descriptor on exec. Reads are positioned, so there
// is no shared seek state or stdio buffer.
class File {
   public:
#ifdef _WIN32
    using PathString = std::wstring;
#else
    using PathString = std::string;
#endif

    explicit File(const PathString& path) : handle_(Open(path)) {}
    ~File() { Close(handle_); }
    File(const File&) = delete;
    File& operator=(const File&) = delete;
    File(File&&) = delete;
    File& operator=(File&&) = delete;

    [[nodiscard]] uint64_t Size() const;

    // Read exactly out.size() bytes starting at `offset`, or throw
    void ReadAt(uint64_t offset, std::span<std::byte> out) const {
        std::span<std::byte> rest = out;
        uint64_t position = offset;
        while (!rest.empty()) {
            size_t const got = ReadSome(position, rest);
            if (got == 0) {
                throw std::runtime_error("failed to read " + std::to_string(out.size()) + " bytes at offset " +
                                         std::to_string(offset));
            }
            rest = rest.subspan(got);
            position += got;
        }
    }

   private:
    // Caps each OS read, not the total: ReadFile takes a 32-bit length and macOS rejects a pread
    // longer than INT_MAX, so ReadAt() issues as many reads as a larger span needs
    static constexpr size_t kMaxReadBytes = size_t{1} << 30U;

#ifdef _WIN32
    using Handle = HANDLE;

    static Handle Open(const PathString& path) {
        Handle const handle =
            CreateFileW(path.c_str(), GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, nullptr,
                        OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
        if (handle == INVALID_HANDLE_VALUE) {
            throw std::runtime_error("failed to open the file");
        }
        return handle;
    }

    static void Close(Handle handle) { static_cast<void>(CloseHandle(handle)); }

    // Returns the bytes read, or 0 on an error or the end of the file
    [[nodiscard]] size_t ReadSome(uint64_t offset, std::span<std::byte> out) const {
        OVERLAPPED overlapped{};
        overlapped.Offset = static_cast<DWORD>(offset);
        overlapped.OffsetHigh = static_cast<DWORD>(offset >> 32U);
        auto const request = static_cast<DWORD>(std::min(out.size(), kMaxReadBytes));
        DWORD got = 0;
        return ReadFile(handle_, out.data(), request, &got, &overlapped) == 0 ? 0 : size_t{got};
    }
#else
    using Handle = int;

    static Handle Open(const PathString& path) {
        Handle handle = -1;
        do {
            // NOLINTNEXTLINE(cppcoreguidelines-pro-type-vararg,hicpp-vararg): open() is variadic for its mode
            handle = open(path.c_str(), O_RDONLY | O_CLOEXEC);
        } while (handle < 0 && errno == EINTR);
        if (handle < 0) {
            throw std::runtime_error("failed to open the file");
        }
        return handle;
    }

    // Not retried on EINTR: the descriptor is released either way
    static void Close(Handle handle) { static_cast<void>(close(handle)); }

    // Returns the bytes read, or 0 on an error or the end of the file
    [[nodiscard]] size_t ReadSome(uint64_t offset, std::span<std::byte> out) const {
        if (offset > static_cast<uint64_t>(std::numeric_limits<off_t>::max())) {
            return 0;
        }
        ssize_t got = -1;
        do {
            got = pread(handle_, out.data(), std::min(out.size(), kMaxReadBytes), static_cast<off_t>(offset));
        } while (got < 0 && errno == EINTR);
        return got < 0 ? 0 : static_cast<size_t>(got);
    }
#endif

    Handle handle_;
};

#ifdef _WIN32
uint64_t File::Size() const {
    LARGE_INTEGER size{};
    if (GetFileSizeEx(handle_, &size) == 0 || size.QuadPart < 0) {
        throw std::runtime_error("failed to determine the file size");
    }
    return static_cast<uint64_t>(size.QuadPart);
}
#else
uint64_t File::Size() const {
    // lseek() rather than fstat(), so block devices report their size too. Reads are positioned,
    // so moving the offset is harmless.
    off_t const size = lseek(handle_, 0, SEEK_END);
    if (size < 0) {
        throw std::runtime_error("failed to determine the file size");
    }
    return static_cast<uint64_t>(size);
}
#endif

using PathString = File::PathString;

#ifdef _WIN32
static PathString ToPath(const Napi::String& value) {
    std::u16string const utf16 = value.Utf16Value();
    return {utf16.begin(), utf16.end()};
}
#else
static PathString ToPath(const Napi::String& value) { return value.Utf8Value(); }
#endif

struct DecompressorFreer {
    void operator()(libdeflate_decompressor* decompressor) const { libdeflate_free_decompressor(decompressor); }
};
using DecompressorPtr = std::unique_ptr<libdeflate_decompressor, DecompressorFreer>;

static DecompressorPtr NewDecompressor() {
    DecompressorPtr decompressor(libdeflate_alloc_decompressor());
    if (!decompressor) {
        throw std::bad_alloc();
    }
    return decompressor;
}

// ---- codecs ----

// Upstream Input::DetectFormat reads this many header bytes for every format
constexpr uint64_t kHeaderBytes = 24;
constexpr uint32_t kSectorSize = maxcso::SECTOR_SIZE;
constexpr uint32_t kMaxBlockSize = 0x40000;
constexpr uint32_t kMinCacheSize = 32768;
constexpr uint64_t kCsoIndexOffset = sizeof(maxcso::CSOHeader);
constexpr uint64_t kDaxIndexOffset = sizeof(maxcso::DAXHeader);

static void CheckAligned(uint64_t size) {
    if (size % kSectorSize != 0) {
        throw std::runtime_error("uncompressed size " + std::to_string(size) + " is not a multiple of 2048");
    }
}

// Returns the bytes produced, or 0 on a decode error. maxcso pads blocks out to the index
// alignment, so decoding stops at the output size instead of requiring the input to end there.
static size_t DecodeLz4(std::span<const uint8_t> in, std::span<uint8_t> out) {
    int const size = static_cast<int>(out.size());
    // LZ4's API takes char pointers; uint8_t and char are both byte types, so this only renames them.
    // NOLINTNEXTLINE(cppcoreguidelines-pro-type-reinterpret-cast)
    const char* const src = reinterpret_cast<const char*>(in.data());
    // NOLINTNEXTLINE(cppcoreguidelines-pro-type-reinterpret-cast)
    char* const dst = reinterpret_cast<char*>(out.data());
    int const produced = LZ4_decompress_safe_partial(src, dst, static_cast<int>(in.size()), size, size);
    return produced < 0 ? 0 : static_cast<size_t>(produced);
}

// Returns the bytes produced, or 0 on a decode error. With `zlib`, the input is a zlib stream: its
// 2-byte header is checked and skipped, and its Adler-32 trailer is verified.
static size_t DecodeDeflate(libdeflate_decompressor* decompressor, std::span<const uint8_t> in, std::span<uint8_t> out,
                            bool zlib) {
    if (zlib) {
        if (in.size() < 6) {
            return 0;
        }
        uint32_t const cmf = in[0];
        uint32_t const flg = in[1];
        if ((cmf & 0x0FU) != 8 || (cmf >> 4U) > 7 || (flg & 0x20U) != 0 || ((cmf * 256) + flg) % 31 != 0) {
            return 0;
        }
        in = in.subspan(2);
    }
    size_t actualIn = 0;
    size_t actualOut = 0;
    if (libdeflate_deflate_decompress_ex(decompressor, in.data(), in.size(), out.data(), out.size(), &actualIn,
                                         &actualOut) != LIBDEFLATE_SUCCESS) {
        return 0;
    }
    if (zlib) {
        std::span<const uint8_t> const trailer = in.subspan(actualIn);
        if (trailer.size() < 4) {
            return 0;
        }
        uint32_t const expected = (uint32_t{trailer[0]} << 24U) | (uint32_t{trailer[1]} << 16U) |
                                  (uint32_t{trailer[2]} << 8U) | uint32_t{trailer[3]};
        if (static_cast<uint32_t>(adler32(1, out.data(), static_cast<uInt>(actualOut))) != expected) {
            return 0;
        }
    }
    return actualOut;
}

// ---- container ----

enum class Codec : uint8_t { kStored, kDeflate, kLz4, kZlib };
enum class Format : uint8_t { kCso1, kCso2, kZso, kDax };

static const char* CodecName(Codec codec) {
    switch (codec) {
        case Codec::kLz4:
            return "LZ4";
        case Codec::kZlib:
            return "zlib";
        default:
            return "deflate";
    }
}

// The index entry that covers an uncompressed position, as upstream Input::ReadSector finds it
struct Block {
    uint64_t entry = 0;
    // How far into the entry the position is, which upstream calls the offset
    uint32_t skip = 0;
    uint64_t offset = 0;
    // Upstream holds the entry length in an unsigned int, so it wraps
    uint32_t length = 0;
    Codec codec = Codec::kStored;
};

// An opened CSO, ZSO, or DAX file, decoded as upstream maxcso's Input class decodes it. Upstream's
// checks are kept as they are. The only ones added guard reads, writes, allocations, and shifts
// that would be memory-unsafe or undefined in upstream; each one says why.
class Container {
   public:
    explicit Container(const PathString& path)
        : file_(path), fileSize_(file_.Size()), decompressor_(NewDecompressor()) {
        if (fileSize_ < kHeaderBytes) {
            throw std::runtime_error("file is too small to be a CSO, ZSO, or DAX file");
        }
        auto const magic = ReadHeader<std::array<char, 4>>();
        if (std::memcmp(magic.data(), maxcso::DAX_MAGIC, magic.size()) == 0) {
            ParseDax();
        } else if (std::memcmp(magic.data(), maxcso::CSO_MAGIC, magic.size()) == 0) {
            ParseCso(false);
        } else if (std::memcmp(magic.data(), maxcso::ZSO_MAGIC, magic.size()) == 0) {
            ParseCso(true);
        } else {
            throw std::runtime_error("not a CSO, ZSO, or DAX file (unrecognized magic)");
        }
        // Upstream Input::SetupCache
        cacheSize_ = blockSize_;
        while (cacheSize_ < kMinCacheSize) {
            cacheSize_ <<= 1U;
        }
        scratch_.resize(cacheSize_);
        decoded_.resize(blockSize_);
    }

    [[nodiscard]] uint64_t Size() const { return size_; }
    [[nodiscard]] uint32_t BlockSize() const { return blockSize_; }

    [[nodiscard]] std::string FormatName() const {
        switch (format_) {
            case Format::kDax:
                return "DAX";
            case Format::kZso:
                return "ZSO";
            default:
                return "CSO";
        }
    }

    // Run upstream Input::ReadSector from the current position, including the calls it would make
    // next for the same index entry, and return the sectors they emit. It's empty at the end of the
    // image, and valid until the next call.
    std::span<const uint8_t> Next() {
        if (pos_ >= size_) {
            return {};
        }
        Block const block = Locate(pos_);
        return block.codec == Codec::kStored ? NextStored(block) : NextCompressed(block);
    }

   private:
    template <typename T>
    [[nodiscard]] T ReadHeader() const {
        T header{};
        std::span<std::byte> const bytes = std::as_writable_bytes(std::span(&header, 1));
        file_.ReadAt(0, bytes.first(std::min<size_t>(bytes.size(), kHeaderBytes)));
        return header;
    }

    void ParseCso(bool zso) {
        auto const header = ReadHeader<maxcso::CSOHeader>();
        // Copy the packed fields out before using them. Like upstream, header_size is ignored.
        uint64_t const size = header.uncompressed_size;
        uint32_t const blockSize = header.sector_size;
        uint32_t const version = header.version;
        if (version > 2) {
            throw std::runtime_error("unsupported CSO/ZSO version " + std::to_string(version));
        }
        if (blockSize < kSectorSize || blockSize > kMaxBlockSize) {
            throw std::runtime_error("block size " + std::to_string(blockSize) + " is not from 2048 to 262144");
        }
        CheckAligned(size);
        // Upstream adds blockSize - 1 to the size as a signed 64-bit integer, which overflows for sizes
        // above INT64_MAX - (blockSize - 1)
        if (size > static_cast<uint64_t>(std::numeric_limits<int64_t>::max()) - (blockSize - 1)) {
            throw std::runtime_error("uncompressed size " + std::to_string(size) + " is too large");
        }
        // Upstream shifts by the block size's log2, rounded down, instead of dividing by it
        blockShift_ = static_cast<uint32_t>(std::bit_width(blockSize)) - 1;
        uint64_t const entries = ((size + blockSize - 1) >> blockShift_) + 1;
        // A CSO format limit, not an OS one: upstream holds the index's sector count in a uint32_t
        if (entries > std::numeric_limits<uint32_t>::max()) {
            throw std::runtime_error("CSO index has too many entries");
        }
        if (entries > (fileSize_ - kCsoIndexOffset) / sizeof(uint32_t)) {
            throw std::runtime_error("CSO index does not fit in the file");
        }
        index_.resize(static_cast<size_t>(entries));
        file_.ReadAt(kCsoIndexOffset, std::as_writable_bytes(std::span(index_)));

        size_ = size;
        blockSize_ = blockSize;
        shift_ = header.index_shift;
        if (zso) {
            format_ = Format::kZso;
        } else if (version == 2) {
            format_ = Format::kCso2;
        } else {
            format_ = Format::kCso1;
        }
    }

    void ParseDax() {
        auto const header = ReadHeader<maxcso::DAXHeader>();
        if (header.version > 1) {
            throw std::runtime_error("unsupported DAX version " + std::to_string(header.version));
        }
        uint64_t const size = header.uncompressed_size;
        CheckAligned(size);
        uint64_t const frames = (size + maxcso::DAX_FRAME_SIZE - 1) >> maxcso::DAX_FRAME_SHIFT;
        // A DAX format limit, not an OS one: upstream holds the frame count in a uint32_t
        if (frames > std::numeric_limits<uint32_t>::max()) {
            throw std::runtime_error("DAX frame table has too many frames");
        }
        // Upstream holds the NC area count in an int, so a larger count is negative and reads none
        uint64_t areas = header.version >= 1 ? header.nc_areas : 0U;
        if (areas > static_cast<uint64_t>(std::numeric_limits<int32_t>::max())) {
            areas = 0;
        }
        uint64_t const tableBytes = (frames * 6) + (areas * sizeof(maxcso::DAXNCArea));
        if (tableBytes != 0 && kDaxIndexOffset + tableBytes > fileSize_) {
            throw std::runtime_error("DAX frame table does not fit in the file");
        }

        size_ = size;
        blockSize_ = maxcso::DAX_FRAME_SIZE;
        blockShift_ = maxcso::DAX_FRAME_SHIFT;
        format_ = Format::kDax;
        index_.resize(static_cast<size_t>(frames));
        daxSizes_.resize(static_cast<size_t>(frames));
        std::vector<maxcso::DAXNCArea> ncAreas(static_cast<size_t>(areas));
        file_.ReadAt(kDaxIndexOffset, std::as_writable_bytes(std::span(index_)));
        file_.ReadAt(kDaxIndexOffset + (frames * 4), std::as_writable_bytes(std::span(daxSizes_)));
        file_.ReadAt(kDaxIndexOffset + (frames * 6), std::as_writable_bytes(std::span(ncAreas)));

        daxStored_.assign(static_cast<size_t>(frames), 0);
        for (size_t i = 0; i < ncAreas.size(); ++i) {
            MarkDaxArea(i, ncAreas[i]);
        }
    }

    void MarkDaxArea(size_t i, const maxcso::DAXNCArea& area) {
        if (area.count == 0) {
            return;
        }
        // Upstream marks the area's frames without a range check, which writes out of bounds
        if (area.start >= daxStored_.size() || area.count > daxStored_.size() - area.start) {
            throw std::runtime_error("DAX NC area " + std::to_string(i) + " is out of range");
        }
        std::ranges::fill(std::span(daxStored_).subspan(area.start, area.count), uint8_t{1});
    }

    [[nodiscard]] uint64_t Position(uint64_t entry) const {
        // Upstream shifts a 64-bit integer by this, which is undefined from 64
        if (shift_ >= 64) {
            throw std::runtime_error("index shift " + std::to_string(shift_) + " is 64 or more");
        }
        return uint64_t{index_[static_cast<size_t>(entry)] & ~maxcso::CSO_INDEX_UNCOMPRESSED} << shift_;
    }

    // Where the entry covering `pos` is and how it's encoded, by the rules of upstream ReadSector
    [[nodiscard]] Block Locate(uint64_t pos) const {
        uint64_t const entry = pos >> blockShift_;
        auto const skip = static_cast<uint32_t>(pos & (blockSize_ - 1));
        auto const i = static_cast<size_t>(entry);
        if (format_ == Format::kDax) {
            return {.entry = entry,
                    .skip = skip,
                    .offset = index_[i],
                    .length = daxSizes_[i],
                    .codec = daxStored_[i] != 0 ? Codec::kStored : Codec::kZlib};
        }
        uint64_t const offset = Position(entry);
        auto const length = static_cast<uint32_t>(Position(entry + 1) - offset);
        bool const flagged = (index_[i] & maxcso::CSO_INDEX_UNCOMPRESSED) != 0;
        Codec codec = Codec::kDeflate;
        if (format_ == Format::kCso2 && length >= blockSize_) {
            codec = Codec::kStored;
        } else if (flagged) {
            codec = format_ == Format::kCso2 ? Codec::kLz4 : Codec::kStored;
        } else if (format_ == Format::kZso) {
            codec = Codec::kLz4;
        }
        return {.entry = entry, .skip = skip, .offset = offset, .length = length, .codec = codec};
    }

    // Upstream reads an entry through a cacheSize_-byte buffer and fails when it gets fewer bytes
    // than the entry's length
    void CheckRead(uint64_t entry, uint64_t offset, uint32_t length) const {
        if (length > cacheSize_) {
            throw std::runtime_error("block " + std::to_string(entry) + " is longer than " +
                                     std::to_string(cacheSize_) + " bytes");
        }
        if (offset > fileSize_ || length > fileSize_ - offset) {
            throw std::runtime_error("block " + std::to_string(entry) + " points past the end of the file");
        }
    }

    [[noreturn]] static void ThrowTooFew(uint64_t entry) {
        throw std::runtime_error("block " + std::to_string(entry) + " has too few bytes for its sectors");
    }

    // Upstream emits one sector per call from a stored entry, starting `skip` bytes into it
    std::span<const uint8_t> NextStored(const Block& block) {
        uint64_t const offset = block.offset + block.skip;
        uint32_t const length = block.length - block.skip;
        CheckRead(block.entry, offset, length);
        uint32_t run = 0;
        while (pos_ + run < size_ && length - run >= kSectorSize && Continues(block, run)) {
            run += kSectorSize;
        }
        if (run == 0) {
            // Upstream would fill the rest of the sector from stale memory
            ThrowTooFew(block.entry);
        }
        std::span<uint8_t> const out = std::span(scratch_).first(run);
        file_.ReadAt(offset, std::as_writable_bytes(out));
        pos_ += run;
        return out;
    }

    // Whether upstream's call for the sector `run` bytes on would read the same entry, `run` bytes
    // further in
    [[nodiscard]] bool Continues(const Block& block, uint32_t run) const {
        uint64_t const pos = pos_ + run;
        return (pos >> blockShift_) == block.entry && (pos & (blockSize_ - 1)) == block.skip + run;
    }

    // Upstream decodes the whole entry, drops what's past the end of the image, and emits sectors
    // from `skip` bytes in until the decoded bytes run out
    std::span<const uint8_t> NextCompressed(const Block& block) {
        CheckRead(block.entry, block.offset, block.length);
        std::span<uint8_t> const in = std::span(scratch_).first(block.length);
        file_.ReadAt(block.offset, std::as_writable_bytes(in));
        size_t const produced = block.codec == Codec::kLz4
                                    ? DecodeLz4(in, decoded_)
                                    : DecodeDeflate(decompressor_.get(), in, decoded_, block.codec == Codec::kZlib);
        if (produced == 0) {
            throw std::runtime_error("block " + std::to_string(block.entry) + " failed to decompress (" +
                                     CodecName(block.codec) + ")");
        }
        uint64_t const available = std::min<uint64_t>(produced, size_ - (pos_ - block.skip));
        if (available <= block.skip) {
            // Upstream would call ReadSector for this position again, forever
            ThrowTooFew(block.entry);
        }
        uint64_t const end = block.skip + ((available - block.skip + kSectorSize - 1) / kSectorSize * kSectorSize);
        if (end > produced) {
            // Upstream would fill the rest of the last sector from stale memory
            ThrowTooFew(block.entry);
        }
        pos_ += end - block.skip;
        return std::span(decoded_).subspan(block.skip, static_cast<size_t>(end - block.skip));
    }

    File file_;
    uint64_t fileSize_ = 0;
    DecompressorPtr decompressor_;
    Format format_ = Format::kCso1;
    uint64_t size_ = 0;
    uint32_t blockSize_ = 0;
    uint32_t blockShift_ = 0;
    uint32_t shift_ = 0;
    uint32_t cacheSize_ = 0;
    uint64_t pos_ = 0;
    std::vector<uint32_t> index_;
    std::vector<uint16_t> daxSizes_;
    std::vector<uint8_t> daxStored_;
    std::vector<uint8_t> scratch_;
    std::vector<uint8_t> decoded_;
};

// ---- shared pull-reader scaffolding ----

// Runs a Source's Produce() on a worker thread so blocking/decompressing blob reads
// never run on the V8 main thread, then tells the Reader the read is done. They must expose:
//   size_t Source::Produce(uint8_t* out, size_t maxBytes);  // worker thread
//   void   Reader::FinishRead();                             // main thread, post-Execute
template <typename Reader, typename Source>
class ReadWorker : public Napi::AsyncWorker {
   public:
    ReadWorker(Napi::Env env, std::shared_ptr<Reader*> reader, std::shared_ptr<Source> source, size_t maxBytes)
        : Napi::AsyncWorker(env),
          deferred_(Napi::Promise::Deferred::New(env)),
          reader_(std::move(reader)),
          source_(std::move(source)),
          // new[] rather than std::vector, deliberately: a vector would
          // value-initialize every byte, and Produce() overwrites the only part
          // of it anyone is ever shown. Zeroing a chunk per read just to memcpy
          // over it is measurable on a multi-gigabyte image and buys nothing --
          // n_ bounds what is exposed, and the bytes past it never leave here.
          buf_(new uint8_t[maxBytes]),
          cap_(maxBytes) {}

    Napi::Promise GetPromise() { return deferred_.Promise(); }

    void Execute() override {
        try {
            n_ = source_->Produce(buf_.get(), cap_);
        } catch (const std::exception& e) {
            SetError(e.what());
        } catch (...) {
            SetError("unknown blob read error");
        }
    }

    void OnOK() override {
        Napi::Env const env = Env();
        if (n_ == 0) {
            deferred_.Resolve(env.Null());
        } else {
            // Give JS the worker's own allocation as the Buffer's backing store
            // rather than copying it: the finalizer frees it once JS is done.
            // Only the first n_ bytes are exposed; the rest are uninitialized.
            // `raw` is unowned between release() and a successful New(), which
            // is what the failure path below cleans up.
            uint8_t* raw = buf_.release();
            // The finalizer takes ownership of the bytes, and its signature is the one
            // Napi::Buffer::New requires; a pointer-to-const would not match it
            Napi::Buffer<uint8_t> const out =
                // NOLINTNEXTLINE(readability-non-const-parameter)
                Napi::Buffer<uint8_t>::New(env, raw, n_, [](Napi::Env /*unused*/, uint8_t* data) { delete[] data; });
            if (out.IsEmpty()) {
                // With C++ exceptions disabled a failed New() returns an empty
                // value and leaves a JS exception pending. Reject rather than
                // resolving with an empty value, which JavaScript would read as
                // the end of the stream.
                delete[] raw;
                deferred_.Reject(env.IsExceptionPending()
                                     ? env.GetAndClearPendingException().Value()
                                     : Napi::Error::New(env, "failed to allocate the read result").Value());
            } else {
                deferred_.Resolve(out);
            }
        }
        FinishRead();
    }

    void OnError(const Napi::Error& e) override {
        deferred_.Reject(e.Value());
        FinishRead();
    }

   private:
    // Tell the reader the read is done, if it still exists. An environment tearing down, such as a
    // terminated Worker's, finalizes every object before it runs the callbacks of reads still in
    // flight, so the reader can be destroyed while it holds a Ref().
    void FinishRead() {
        if (*reader_ != nullptr) {
            (*reader_)->FinishRead();  // may release the reader
        }
    }

    Napi::Promise::Deferred deferred_;
    // Cleared by the reader's destructor
    std::shared_ptr<Reader*> reader_;
    // Keeps the file open until this worker is destroyed, even if the reader is closed or destroyed first
    std::shared_ptr<Source> source_;
    // A runtime-sized owning buffer, which is exactly what unique_ptr<T[]> is
    // for; std::array would need the size at compile time.
    // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays,modernize-avoid-c-arrays)
    std::unique_ptr<uint8_t[]> buf_;
    size_t cap_ = 0;
    size_t n_ = 0;
};

// CRTP base for the async pull-reader lifecycle used by MaxcsoReader. Each Derived
// constructor stores the Source it reads from in source_.
//
// Safety invariant: the reader and the read worker in flight each hold the Source, so it is
// freed on the main thread only once neither does. Produce (worker thread) never runs on a
// freed Source, even if the reader is closed or destroyed mid-read. reading_ rejects a
// concurrent read(); Ref()/Unref() keep the object alive across the async read.
template <typename Derived, typename Source>
class ReaderBase : public Napi::ObjectWrap<Derived> {
   public:
    explicit ReaderBase(const Napi::CallbackInfo& info)
        : Napi::ObjectWrap<Derived>(info), self_(std::make_shared<ReaderBase*>(this)) {}

    ~ReaderBase() override { *self_ = nullptr; }

    ReaderBase(const ReaderBase&) = delete;
    ReaderBase& operator=(const ReaderBase&) = delete;
    ReaderBase(ReaderBase&&) = delete;
    ReaderBase& operator=(ReaderBase&&) = delete;

    Napi::Value Read(const Napi::CallbackInfo& info);

    // Release this reader's hold on the file. A read worker in flight holds it too, so the
    // file closes once the worker thread is done with it.
    void Close(const Napi::CallbackInfo& /*unused*/) { source_.reset(); }

    // Mark the read as done. Called on the main thread by the read worker after Execute has returned.
    void FinishRead() {
        reading_ = false;
        this->Unref();  // balances the Ref() taken in Read(); may allow GC of this object
    }

   protected:
    // Empty after Close(), and after a constructor that threw, whose object JavaScript never receives
    std::shared_ptr<Source> source_;

   private:
    // Shared with every read worker so they know whether this reader still exists
    std::shared_ptr<ReaderBase*> self_;
    bool reading_ = false;
};

// Defined out-of-line because it constructs a ReadWorker, whose full
// definition must precede this. Shared by every ReaderBase subclass.
template <typename Derived, typename Source>
Napi::Value ReaderBase<Derived, Source>::Read(const Napi::CallbackInfo& info) {
    Napi::Env const env = info.Env();
    Napi::Promise::Deferred const deferred = Napi::Promise::Deferred::New(env);
    if (!source_) {
        deferred.Reject(Napi::Error::New(env, "read after close").Value());
        return deferred.Promise();
    }
    if (reading_) {
        // Only one read worker may touch this reader's mutable state at a time
        deferred.Reject(Napi::Error::New(env, "concurrent read not allowed").Value());
        return deferred.Promise();
    }
    double const requested = info.Length() < 1 || !info[0].IsNumber() ? 0 : info[0].As<Napi::Number>().DoubleValue();
    // Bounded so the static_cast<size_t> below is defined, and to Number.MAX_SAFE_INTEGER, past
    // which JavaScript cannot request an exact byte count
    constexpr double kMaxRequestBytes =
        std::min(9007199254740991.0, static_cast<double>(std::numeric_limits<size_t>::max()));
    bool const valid = requested >= 1 && requested <= kMaxRequestBytes;
    if (!valid) {
        deferred.Reject(Napi::TypeError::New(env, "maxBytes must be a positive number").Value());
        return deferred.Promise();
    }
    auto const maxBytes = static_cast<size_t>(requested);
    // Allocate the worker (and its maxBytes buffer) BEFORE mutating reader state:
    // if that allocation throws, reading_/Ref() must not be left dangling
    ReadWorker<ReaderBase, Source>* worker = nullptr;
    try {
        worker = new ReadWorker<ReaderBase, Source>(env, self_, source_, maxBytes);
    } catch (const std::bad_alloc&) {
        deferred.Reject(Napi::Error::New(env, "failed to allocate the read buffer").Value());
        return deferred.Promise();
    }
    Napi::Promise promise = worker->GetPromise();
    // Queue() reports failure only as a pending exception, so none may be pending before it
    if (!env.IsExceptionPending()) {
        worker->Queue();
    }
    if (env.IsExceptionPending()) {
        // The worker was never queued, so it will never run or free itself, and reader state must
        // not be left marked as reading
        delete worker;
        deferred.Reject(env.GetAndClearPendingException().Value());
        return deferred.Promise();
    }
    // OnOK/OnError run later on this same thread, so setting these after Queue() is not a race
    reading_ = true;
    this->Ref();  // keep this object (and its file) alive while the worker thread reads
    return promise;
}

// ---- maxcso reader ----

// A container's decompressed ISO bytes. The file is opened and parsed lazily by the first read's
// worker, so no filesystem I/O runs on the main thread. Each source owns its own file handle,
// decompressor, and buffers, so concurrent readers are independent.
class MaxcsoSource {
   public:
    explicit MaxcsoSource(PathString path) : path_(std::move(path)) {}

    // Emit up to maxBytes of decompressed bytes. Runs on the worker thread. What the container
    // returns that doesn't fit stays in pending_, which the next read drains first.
    size_t Produce(uint8_t* out, size_t maxBytes) {
        if (!container_) {
            container_ = std::make_unique<Container>(path_);
        }
        std::span<uint8_t> const dest(out, maxBytes);
        size_t written = 0;
        while (written < maxBytes) {
            if (pending_.empty()) {
                pending_ = container_->Next();
                if (pending_.empty()) {
                    break;
                }
            }
            size_t const count = std::min(pending_.size(), maxBytes - written);
            std::ranges::copy(pending_.first(count), dest.subspan(written).begin());
            pending_ = pending_.subspan(count);
            written += count;
        }
        return written;
    }

   private:
    PathString path_;
    std::unique_ptr<Container> container_;
    // Points into container_'s buffers
    std::span<const uint8_t> pending_;
};

// A pull reader over a MaxcsoSource
class MaxcsoReader : public ReaderBase<MaxcsoReader, MaxcsoSource> {
   public:
    static Napi::Function GetClass(Napi::Env env) {
        return DefineClass(env, "MaxcsoReader",
                           {
                               InstanceMethod("read", &MaxcsoReader::Read),
                               InstanceMethod("close", &MaxcsoReader::Close),
                           });
    }

    explicit MaxcsoReader(const Napi::CallbackInfo& info) : ReaderBase<MaxcsoReader, MaxcsoSource>(info) {
        Napi::Env const env = info.Env();
        if (info.Length() < 1 || !info[0].IsString()) {
            Napi::TypeError::New(env, "MaxcsoReader(inputFilename) required").ThrowAsJavaScriptException();
            return;
        }
        try {
            source_ = std::make_shared<MaxcsoSource>(ToPath(info[0].As<Napi::String>()));
        } catch (const std::exception& e) {
            Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
        }
    }
};

// ---- maxcso info ----

// Opens and validates a container on a worker thread and resolves its header information
class InfoWorker : public Napi::AsyncWorker {
   public:
    InfoWorker(Napi::Env env, PathString path)
        : Napi::AsyncWorker(env), deferred_(Napi::Promise::Deferred::New(env)), path_(std::move(path)) {}

    Napi::Promise GetPromise() { return deferred_.Promise(); }

    void Execute() override {
        try {
            Container const container(path_);
            format_ = container.FormatName();
            size_ = container.Size();
            blockSize_ = container.BlockSize();
        } catch (const std::exception& e) {
            SetError(e.what());
        } catch (...) {
            SetError("unknown maxcso info error");
        }
    }

    void OnOK() override {
        Napi::Env const env = Env();
        Napi::Object const out = Napi::Object::New(env);
        out.Set("format", format_);
        out.Set("uncompressedSize", Napi::Number::New(env, static_cast<double>(size_)));
        out.Set("blockSize", Napi::Number::New(env, static_cast<double>(blockSize_)));
        deferred_.Resolve(out);
    }

    void OnError(const Napi::Error& e) override { deferred_.Reject(e.Value()); }

   private:
    Napi::Promise::Deferred deferred_;
    PathString path_;
    std::string format_;
    uint64_t size_ = 0;
    uint32_t blockSize_ = 0;
};

static Napi::Value Info(const Napi::CallbackInfo& info) {
    Napi::Env const env = info.Env();
    Napi::Promise::Deferred const deferred = Napi::Promise::Deferred::New(env);
    if (info.Length() < 1 || !info[0].IsString()) {
        deferred.Reject(Napi::TypeError::New(env, "inputFilename (string) required").Value());
        return deferred.Promise();
    }
    try {
        auto* worker = new InfoWorker(env, ToPath(info[0].As<Napi::String>()));
        Napi::Promise promise = worker->GetPromise();
        worker->Queue();
        return promise;
    } catch (const std::exception& e) {
        deferred.Reject(Napi::Error::New(env, e.what()).Value());
        return deferred.Promise();
    }
}

// ---- addon init ----

struct Addon {
    Napi::FunctionReference maxcsoReader;
};

static Napi::Value OpenReader(const Napi::CallbackInfo& info) {
    Napi::Env const env = info.Env();
    Napi::Function const ctor = env.GetInstanceData<Addon>()->maxcsoReader.Value();
    return ctor.New({info[0]});
}

static Napi::Object InitAll(Napi::Env env, Napi::Object exports) {
    Napi::Function const cls = MaxcsoReader::GetClass(env);
    env.SetInstanceData(new Addon{.maxcsoReader = Napi::Persistent(cls)});
    exports.Set("info", Napi::Function::New(env, Info));
    exports.Set("openReader", Napi::Function::New(env, OpenReader));
    return exports;
}
NODE_API_MODULE(NODE_GYP_MODULE_NAME, InitAll)
