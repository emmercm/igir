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
#include <type_traits>
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

// A std::allocator that default-initializes elements instead of value-initializing them, so that
// sizing a vector leaves trivial elements uninitialized instead of zeroing them. Only for storage
// that is entirely written before it is read.
template <typename T>
struct DefaultInitAllocator : std::allocator<T> {
    template <typename U>
    struct rebind {
        using other = DefaultInitAllocator<U>;
    };

    DefaultInitAllocator() = default;
    template <typename U>
    // NOLINTNEXTLINE(google-explicit-constructor,hicpp-explicit-conversions): allocators must convert implicitly
    DefaultInitAllocator(const DefaultInitAllocator<U>& /*unused*/) noexcept {}

    template <typename U>
    void construct(U* ptr) noexcept(std::is_nothrow_default_constructible_v<U>) {
        ::new (static_cast<void*>(ptr)) U;
    }
    template <typename U, typename... Args>
    void construct(U* ptr, Args&&... args) {
        std::construct_at(ptr, std::forward<Args>(args)...);
    }
};

template <typename T>
using UninitVector = std::vector<T, DefaultInitAllocator<T>>;

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

    // Open the file for reading, or throw
    explicit File(const PathString& path) : handle_(Open(path)) {}

    // Close the handle
    ~File() { Close(handle_); }

    File(const File&) = delete;
    File& operator=(const File&) = delete;
    File(File&&) = delete;
    File& operator=(File&&) = delete;

    // The file's size in bytes, or throw
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

    // Open `path` read-only, or throw
    static Handle Open(const PathString& path) {
        Handle const handle =
            CreateFileW(path.c_str(), GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, nullptr,
                        OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
        if (handle == INVALID_HANDLE_VALUE) {
            throw std::runtime_error("failed to open the file");
        }
        return handle;
    }

    // Close the handle, ignoring errors, since the handle is released either way
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

    // Open `path` read-only, or throw
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

    // Close the descriptor, ignoring errors. Not retried on EINTR: the descriptor is released
    // either way.
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

// A table of fixed-size entries in a file, read one window of entries at a time rather than all at
// once, so its memory doesn't grow with the file. Reads are expected to move forward through it.
template <typename T>
class TableWindow {
   public:
    TableWindow() = default;

    // `count` entries starting at `offset` in the file, read up to `bytes` bytes at a time
    TableWindow(uint64_t offset, uint64_t count, size_t bytes)
        : offset_(offset),
          count_(count),
          entries_(static_cast<size_t>(std::min<uint64_t>(count, std::max<size_t>(bytes / sizeof(T), 1)))) {}

    // Entry `i`, or throw when it's past the end of the table. A window starting at `i` is read when
    // `i` isn't in the current one.
    [[nodiscard]] T At(const File& file, uint64_t i) {
        if (i >= count_) {
            throw std::runtime_error("entry " + std::to_string(i) + " is past the end of a " + std::to_string(count_) +
                                     "-entry table");
        }
        if (i < first_ || i - first_ >= loaded_) {
            loaded_ = 0;
            auto const count = static_cast<size_t>(std::min<uint64_t>(entries_.size(), count_ - i));
            file.ReadAt(offset_ + (i * sizeof(T)), std::as_writable_bytes(std::span(entries_).first(count)));
            first_ = i;
            loaded_ = count;
        }
        return entries_[static_cast<size_t>(i - first_)];
    }

   private:
    uint64_t offset_ = 0;
    uint64_t count_ = 0;
    uint64_t first_ = 0;
    size_t loaded_ = 0;

    // Only ever read after being written
    UninitVector<T> entries_;
};

// A buffer that reads a file a whole buffer at a time, so that the many small reads of a forward
// scan become a few large ones
class ReadAhead {
   public:
    ReadAhead() = default;

    // A buffer of `size` bytes
    explicit ReadAhead(size_t size) : buffer_(size) {}

    // The `length` bytes at `offset` in a file of `fileSize` bytes, valid until the next call, or
    // throw when they don't lie within the file or don't fit in the buffer. When they aren't all in
    // the buffer, it's refilled from `offset`.
    [[nodiscard]] std::span<const uint8_t> Fetch(const File& file, uint64_t fileSize, uint64_t offset, size_t length) {
        if (length > buffer_.size() || offset > fileSize || length > fileSize - offset) {
            throw std::runtime_error("cannot buffer " + std::to_string(length) + " bytes at offset " +
                                     std::to_string(offset) + " with a " + std::to_string(buffer_.size()) +
                                     "-byte buffer");
        }
        if (offset < start_ || offset - start_ > loaded_ || length > loaded_ - (offset - start_)) {
            loaded_ = 0;
            auto const size = static_cast<size_t>(std::min<uint64_t>(buffer_.size(), fileSize - offset));
            file.ReadAt(offset, std::as_writable_bytes(std::span(buffer_).first(size)));
            start_ = offset;
            loaded_ = size;
        }
        return std::span<const uint8_t>(buffer_).subspan(static_cast<size_t>(offset - start_), length);
    }

   private:
    uint64_t start_ = 0;
    size_t loaded_ = 0;

    // Only ever read after being written
    UninitVector<uint8_t> buffer_;
};

using PathString = File::PathString;

// Convert a JavaScript string to a path that File can open
#ifdef _WIN32
static PathString ToPath(const Napi::String& value) {
    std::u16string const utf16 = value.Utf16Value();
    return {utf16.begin(), utf16.end()};
}
#else
static PathString ToPath(const Napi::String& value) { return value.Utf8Value(); }
#endif

// Frees a libdeflate decompressor, for DecompressorPtr
struct DecompressorFreer {
    void operator()(libdeflate_decompressor* decompressor) const { libdeflate_free_decompressor(decompressor); }
};
using DecompressorPtr = std::unique_ptr<libdeflate_decompressor, DecompressorFreer>;

// Allocate a libdeflate decompressor, or throw std::bad_alloc
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

// Throw unless an uncompressed size is a whole number of sectors, as upstream requires
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

// How an index entry's bytes are encoded
enum class Codec : uint8_t { kStored, kDeflate, kLz4, kZlib };

// Which container format a file is
enum class Format : uint8_t { kCso1, kCso2, kZso, kDax };

// The codec's name, for error messages
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

// What a Container is opened for
enum class Open : uint8_t {
    // Only the header information: the checks upstream makes while opening run, but the index
    // isn't read and nothing is allocated for decoding, so Next() may not be called
    kHeader,
    kRead
};

// An opened CSO, ZSO, or DAX file, decoded as upstream maxcso's Input class decodes it. Upstream's
// checks are kept as they are. The only ones added guard reads, writes, allocations, and shifts
// that would be memory-unsafe or undefined in upstream; each one says why.
class Container {
   public:
    // Open and parse `path`, or throw. For Open::kRead, the index and the entries' data are read
    // from the file `readBytes` bytes at a time, though never less than a whole entry's data.
    Container(const PathString& path, Open open, size_t readBytes) : file_(path), fileSize_(file_.Size()) {
        if (fileSize_ < kHeaderBytes) {
            throw std::runtime_error("file is too small to be a CSO, ZSO, or DAX file");
        }
        auto const magic = ReadHeader<std::array<char, 4>>();
        if (std::memcmp(magic.data(), maxcso::DAX_MAGIC, magic.size()) == 0) {
            ParseDax(open, readBytes);
        } else if (std::memcmp(magic.data(), maxcso::CSO_MAGIC, magic.size()) == 0) {
            ParseCso(false, open, readBytes);
        } else if (std::memcmp(magic.data(), maxcso::ZSO_MAGIC, magic.size()) == 0) {
            ParseCso(true, open, readBytes);
        } else {
            throw std::runtime_error("not a CSO, ZSO, or DAX file (unrecognized magic)");
        }
        if (open == Open::kHeader) {
            return;
        }
        // Upstream Input::SetupCache
        cacheSize_ = blockSize_;
        while (cacheSize_ < kMinCacheSize) {
            cacheSize_ <<= 1U;
        }
        decompressor_ = NewDecompressor();

        // CheckRead() bounds every entry's data by both cacheSize_ and the file's size, so a
        // buffer of at least the smaller of the two holds any entry
        data_ =
            ReadAhead(static_cast<size_t>(std::min<uint64_t>(std::max<uint64_t>(readBytes, cacheSize_), fileSize_)));
        decoded_.resize(blockSize_);
    }

    // The uncompressed image's size in bytes
    [[nodiscard]] uint64_t Size() const { return size_; }

    // The size of the uncompressed data each index entry covers
    [[nodiscard]] uint32_t BlockSize() const { return blockSize_; }

    // The format's name, as index.ts reports it
    [[nodiscard]] const char* FormatName() const {
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
    // image. Decoded sectors are written to the start of `dest` when it can hold a whole block.
    // Otherwise, and for stored sectors, they're in this container's buffers, valid until the next
    // call.
    std::span<const uint8_t> Next(std::span<uint8_t> dest) {
        if (pos_ >= size_) {
            return {};
        }
        Block const block = Locate(pos_);
        return block.codec == Codec::kStored ? NextStored(block) : NextCompressed(block, dest);
    }

   private:
    // Read the file's first header bytes into a T, leaving any of T past them zeroed
    template <typename T>
    [[nodiscard]] T ReadHeader() const {
        T header{};
        std::span<std::byte> const bytes = std::as_writable_bytes(std::span(&header, 1));
        file_.ReadAt(0, bytes.first(std::min<size_t>(bytes.size(), kHeaderBytes)));
        return header;
    }

    // Parse a CSO or ZSO header, and set up its index for Open::kRead
    void ParseCso(bool zso, Open open, size_t readBytes) {
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
        if (open == Open::kRead) {
            index_ = TableWindow<uint32_t>(kCsoIndexOffset, entries, readBytes);
        }

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

    // Parse a DAX header and its NC areas, and set up its frame table for Open::kRead
    void ParseDax(Open open, size_t readBytes) {
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

        // Read even for Open::kHeader, because an out-of-range area fails the open
        UninitVector<maxcso::DAXNCArea> ncAreas(static_cast<size_t>(areas));
        file_.ReadAt(kDaxIndexOffset + (frames * 6), std::as_writable_bytes(std::span(ncAreas)));
        for (size_t i = 0; i < ncAreas.size(); ++i) {
            CheckDaxArea(i, ncAreas[i], frames);
        }
        if (open == Open::kHeader) {
            return;
        }

        index_ = TableWindow<uint32_t>(kDaxIndexOffset, frames, readBytes);
        daxSizes_ = TableWindow<uint16_t>(kDaxIndexOffset + (frames * 4), frames, readBytes);
        daxStored_.assign(static_cast<size_t>(frames), 0);
        for (const maxcso::DAXNCArea& area : ncAreas) {
            // An empty area may start anywhere, even past the last frame
            if (area.count == 0) {
                continue;
            }
            std::ranges::fill(std::span(daxStored_).subspan(area.start, area.count), uint8_t{1});
        }
    }

    // Throw unless the NC area lies within the frame table. Upstream marks the area's frames
    // without a range check, which writes out of bounds.
    static void CheckDaxArea(size_t i, const maxcso::DAXNCArea& area, uint64_t frames) {
        if (area.count != 0 && (area.start >= frames || area.count > frames - area.start)) {
            throw std::runtime_error("DAX NC area " + std::to_string(i) + " is out of range");
        }
    }

    // Where a CSO or ZSO index entry with the value `value` has its data start in the file
    [[nodiscard]] uint64_t Position(uint32_t value) const {
        // Upstream shifts a 64-bit integer by this, which is undefined from 64
        if (shift_ >= 64) {
            throw std::runtime_error("index shift " + std::to_string(shift_) + " is 64 or more");
        }
        return uint64_t{value & ~maxcso::CSO_INDEX_UNCOMPRESSED} << shift_;
    }

    // Where the entry covering `pos` is and how it's encoded, by the rules of upstream ReadSector
    [[nodiscard]] Block Locate(uint64_t pos) {
        uint64_t const entry = pos >> blockShift_;
        auto const skip = static_cast<uint32_t>(pos & (blockSize_ - 1));
        if (format_ == Format::kDax) {
            return {.entry = entry,
                    .skip = skip,
                    .offset = index_.At(file_, entry),
                    .length = daxSizes_.At(file_, entry),
                    .codec = daxStored_[static_cast<size_t>(entry)] != 0 ? Codec::kStored : Codec::kZlib};
        }
        uint32_t const value = index_.At(file_, entry);
        uint64_t const offset = Position(value);
        auto const length = static_cast<uint32_t>(Position(index_.At(file_, entry + 1)) - offset);
        bool const flagged = (value & maxcso::CSO_INDEX_UNCOMPRESSED) != 0;
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

    // Throw unless an entry can be read in full. Upstream reads an entry through a
    // cacheSize_-byte buffer and fails when it gets fewer bytes than the entry's length.
    void CheckRead(uint64_t entry, uint64_t offset, uint32_t length) const {
        if (length > cacheSize_) {
            throw std::runtime_error("block " + std::to_string(entry) + " is longer than " +
                                     std::to_string(cacheSize_) + " bytes");
        }
        if (offset > fileSize_ || length > fileSize_ - offset) {
            throw std::runtime_error("block " + std::to_string(entry) + " points past the end of the file");
        }
    }

    // Throw for an entry that doesn't hold enough bytes for the sectors upstream would emit from it
    [[noreturn]] static void ThrowTooFew(uint64_t entry) {
        throw std::runtime_error("block " + std::to_string(entry) + " has too few bytes for its sectors");
    }

    // Next() for a stored entry. Upstream emits one sector per call from a stored entry,
    // starting `skip` bytes into it.
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
        std::span<const uint8_t> const out = data_.Fetch(file_, fileSize_, offset, run);
        pos_ += run;
        return out;
    }

    // Whether upstream's call for the sector `run` bytes on would read the same entry, `run` bytes
    // further in
    [[nodiscard]] bool Continues(const Block& block, uint32_t run) const {
        uint64_t const pos = pos_ + run;
        return (pos >> blockShift_) == block.entry && (pos & (blockSize_ - 1)) == block.skip + run;
    }

    // Next() for a compressed entry. Upstream decodes the whole entry, drops what's past the end
    // of the image, and emits sectors from `skip` bytes in until the decoded bytes run out.
    std::span<const uint8_t> NextCompressed(const Block& block, std::span<uint8_t> dest) {
        CheckRead(block.entry, block.offset, block.length);
        std::span<const uint8_t> const in = data_.Fetch(file_, fileSize_, block.offset, block.length);

        // Decoded straight into `dest` when the sectors start the entry and a whole block fits. The
        // decoder gets exactly a block of space either way, so it behaves the same.
        std::span<uint8_t> const decoded =
            block.skip == 0 && dest.size() >= blockSize_ ? dest.first(blockSize_) : std::span(decoded_);
        size_t const produced = block.codec == Codec::kLz4
                                    ? DecodeLz4(in, decoded)
                                    : DecodeDeflate(decompressor_.get(), in, decoded, block.codec == Codec::kZlib);
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
        return decoded.subspan(block.skip, static_cast<size_t>(end - block.skip));
    }

    File file_;
    uint64_t fileSize_ = 0;
    Format format_ = Format::kCso1;
    uint64_t size_ = 0;
    uint32_t blockSize_ = 0;
    uint32_t blockShift_ = 0;
    uint32_t shift_ = 0;
    uint32_t cacheSize_ = 0;
    uint64_t pos_ = 0;

    // Every member from here on is empty for Open::kHeader
    TableWindow<uint32_t> index_;
    TableWindow<uint16_t> daxSizes_;
    std::vector<uint8_t> daxStored_;
    DecompressorPtr decompressor_;
    ReadAhead data_;

    // Only ever read after being written
    UninitVector<uint8_t> decoded_;
};

// ---- shared pull-reader scaffolding ----

// The most one read() may request. Each read allocates a buffer of the requested size, and Node.js
// 22 aborts the process when it cannot allocate one instead of throwing. This bound is far past
// any useful read size, and small enough to allocate on 32-bit targets.
constexpr size_t kMaxRequestBytes = 64U << 20U;  // 64 MiB

// Create and queue a worker, which deletes itself once OnOK() or OnError() has run. A worker that
// cannot be created or queued throws a Napi::Error instead, having been freed.
template <typename Worker, typename... Args>
static void QueueWorker(Args&&... args) {
    auto* const worker = new Worker(std::forward<Args>(args)...);
    try {
        worker->Queue();
    } catch (...) {
        delete worker;
        throw;
    }
}

// Drops a Source's last reference on the thread pool, so that its file closes there, as Node.js'
// own fs.close() does. A read worker in flight may hold the other reference, in which case it
// drops the last one at the end of its own Execute(), also on the thread pool.
template <typename Source>
class CloseWorker : public Napi::AsyncWorker {
   public:
    CloseWorker(Napi::Env env, std::shared_ptr<Source> source) : Napi::AsyncWorker(env), source_(std::move(source)) {}

    // Release the Source. Runs on the worker thread.
    void Execute() override { source_.reset(); }

    // Nothing to settle: close() does not report its outcome
    void OnOK() override {}

   private:
    std::shared_ptr<Source> source_;
};

#ifdef __EMSCRIPTEN__
// Copies bytes into a new Buffer. It calls Node-API directly because Napi::Buffer makes emnapi mirror
// the Buffer on the WebAssembly heap until garbage collection.
static Napi::Value CopyToBuffer(Napi::Env env, const uint8_t* data, size_t length) {
    napi_value value = nullptr;
    napi_status const status = napi_create_buffer_copy(env, length, data, nullptr, &value);
    NAPI_THROW_IF_FAILED(env, status, Napi::Value());
    return {env, value};
}
#endif

// Runs one read() on the thread pool: fills memory from a Source's Produce(), then tells the Reader
// the read is done and settles the read's promise. Source and Reader must provide:
//   size_t Source::Produce(uint8_t* out, size_t maxBytes);  // worker thread
//   void   Reader::FinishRead();                             // main thread, after Execute()
//
// Under Emscripten, it fills scratch memory and resolves with a copy, because emnapi frees a Buffer's
// WebAssembly heap memory only on garbage collection.
template <typename Reader, typename Source>
class ReadWorker : public Napi::AsyncWorker {
   public:
    // Natively, fills a Buffer, which is V8's own allocation rather than an external one: freeing an
    // external Buffer's memory posts its finalizer to the owning environment's thread, which races a
    // terminating Worker closing that environment's handles. The reference keeps the Buffer alive
    // while the worker thread writes to it; an environment tearing down waits for thread pool work
    // to finish before it releases any reference.
    ReadWorker(Napi::Env env, Napi::Promise::Deferred deferred, std::shared_ptr<Reader*> reader,
               std::shared_ptr<Source> source, size_t maxBytes)
        : Napi::AsyncWorker(env),
          deferred_(deferred),
          reader_(std::move(reader)),
          source_(std::move(source)),
#ifndef __EMSCRIPTEN__
          buffer_(Napi::Persistent(Napi::Buffer<uint8_t>::New(env, maxBytes))),
          data_(buffer_.Value().Data()),
#endif
          cap_(maxBytes) {
    }

    // Fill the memory from the Source. Runs on the worker thread.
    void Execute() override {
        try {
#ifdef __EMSCRIPTEN__
            // Allocated here so that failing to allocate rejects the read
            // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays,modernize-avoid-c-arrays)
            scratch_ = std::make_unique_for_overwrite<uint8_t[]>(cap_);
            n_ = source_->Produce(scratch_.get(), cap_);
#else
            n_ = source_->Produce(data_, cap_);
#endif
        } catch (const std::exception& e) {
            SetError(e.what());
        } catch (...) {
            SetError("unknown maxcso read error");
        }

        // If the reader was closed mid-read, this is the last reference, and the file closes here
        // on the thread pool rather than when this worker is destroyed on the main thread
        source_.reset();
    }

    // Resolve with the bytes read, or null at the end
    void OnOK() override {
        // First, so that resolving can't throw past it and leave the reader Ref()'d and reading
        NotifyReader();
        Napi::Env const env = Env();
        if (n_ == 0) {
            deferred_.Resolve(env.Null());
            return;
        }
#ifdef __EMSCRIPTEN__
        deferred_.Resolve(CopyToBuffer(env, scratch_.get(), n_));
#else
        Napi::Buffer<uint8_t> const buffer = buffer_.Value();
        if (n_ == cap_) {
            deferred_.Resolve(buffer);
        } else {
            // A view of the first n_ bytes, which shares the Buffer's memory rather than copying
            // it. Only those bytes were written; the rest are uninitialized.
            deferred_.Resolve(
                buffer.Get("subarray")
                    .As<Napi::Function>()
                    .Call(buffer, {Napi::Number::New(env, 0), Napi::Number::New(env, static_cast<double>(n_))}));
        }
#endif
    }

    // Reject with the error Execute() set
    void OnError(const Napi::Error& e) override {
        NotifyReader();
        deferred_.Reject(e.Value());
    }

   private:
    // Tell the reader the read is done, unless it was destroyed. The reader holds a Ref() while it
    // reads, so only an environment tearing down, such as a terminated Worker's, destroys it first.
    void NotifyReader() {
        if (*reader_ != nullptr) {
            (*reader_)->FinishRead();  // may release the reader
        }
    }

    Napi::Promise::Deferred deferred_;

    // Cleared by the reader's destructor
    std::shared_ptr<Reader*> reader_;

    // Keeps the file open until Execute() is done with it, even if the reader is closed or destroyed first
    std::shared_ptr<Source> source_;

    // The memory that Execute() fills, and its size
#ifdef __EMSCRIPTEN__
    std::unique_ptr<uint8_t[]> scratch_;  // NOLINT(cppcoreguidelines-avoid-c-arrays,modernize-avoid-c-arrays)
#else
    Napi::Reference<Napi::Buffer<uint8_t>> buffer_;
    uint8_t* data_;
#endif
    size_t cap_;
    size_t n_ = 0;
};

// CRTP base for the JavaScript pull reader MaxcsoReader, which reads a Source on the thread pool,
// one read at a time. Each Derived constructor stores the Source it reads from in source_.
//
// Safety invariant: the reader and the read worker in flight each hold the Source, so it is
// freed only once neither does. Produce() never runs on a freed Source, even if the reader is
// closed or destroyed mid-read. close() and the read worker both drop their references on the
// thread pool; only a reader garbage collected without close() frees its Source on the main
// thread, as Node.js does for a FileHandle that was never closed.
template <typename Derived, typename Source>
class ReaderBase : public Napi::ObjectWrap<Derived> {
   public:
    // Construct without a Source, which the Derived constructor then sets
    explicit ReaderBase(const Napi::CallbackInfo& info)
        : Napi::ObjectWrap<Derived>(info), self_(std::make_shared<ReaderBase*>(this)) {}

    // Tell any read worker still in flight that this reader no longer exists
    ~ReaderBase() override { *self_ = nullptr; }

    ReaderBase(const ReaderBase&) = delete;
    ReaderBase& operator=(const ReaderBase&) = delete;
    ReaderBase(ReaderBase&&) = delete;
    ReaderBase& operator=(ReaderBase&&) = delete;

    // read(maxBytes): resolve up to maxBytes bytes, or null at the end. Rejects a read after
    // close() or while another read is in flight.
    Napi::Value Read(const Napi::CallbackInfo& info);

    // Release this reader's hold on the file, on the thread pool. A read worker in flight holds
    // it too, so the file closes once the worker thread is done with it.
    void Close(const Napi::CallbackInfo& info) {
        if (!source_) {
            return;
        }
        // Moved out first, so that the worker's reference is never the last one while this
        // reader's is still being dropped here on the main thread
        std::shared_ptr<Source> source = std::move(source_);
        try {
            QueueWorker<CloseWorker<Source>>(info.Env(), std::move(source));
        } catch (...) {  // NOLINT(bugprone-empty-catch)
            // The worker could not be created or queued, so the file closes here instead, on the
            // main thread, when `source` goes out of scope
        }
    }

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
    double const requested = info[0].IsNumber() ? info[0].As<Napi::Number>().DoubleValue() : 0;

    // Also catches NaN, which fails every comparison
    if (!(requested >= 1)) {
        deferred.Reject(Napi::TypeError::New(env, "maxBytes must be a positive number").Value());
        return deferred.Promise();
    }
    if (requested > static_cast<double>(kMaxRequestBytes)) {
        deferred.Reject(Napi::RangeError::New(env, "maxBytes is too large").Value());
        return deferred.Promise();
    }
    try {
        QueueWorker<ReadWorker<ReaderBase, Source>>(env, deferred, self_, source_, static_cast<size_t>(requested));
    } catch (const Napi::Error& e) {
        deferred.Reject(e.Value());
        return deferred.Promise();
    }
    // OnOK()/OnError() run later on this same thread, so setting these after Queue() is not a race
    reading_ = true;
    this->Ref();  // keep this object from being collected while the worker thread reads
    return deferred.Promise();
}

// ---- maxcso reader ----

// A container's decompressed ISO bytes. The file is opened and parsed lazily by the first read's
// worker, so no filesystem I/O runs on the main thread. Each source owns its own file handle,
// decompressor, and buffers, so concurrent readers are independent.
class MaxcsoSource {
   public:
    // Remember the path; the file isn't opened until the first Produce()
    explicit MaxcsoSource(PathString path) : path_(std::move(path)) {}

    // Emit up to maxBytes of decompressed bytes. Runs on the worker thread. The container writes
    // straight into `out` where it can; what it returns in its own buffers that doesn't fit stays
    // in pending_, which the next read drains first.
    size_t Produce(uint8_t* out, size_t maxBytes) {
        if (!container_) {
            // The first read's size, which is the stream's highWaterMark, sets how much the
            // container reads from the file at a time for the rest of the stream
            container_ = std::make_unique<Container>(path_, Open::kRead, maxBytes);
        }
        std::span<uint8_t> const dest(out, maxBytes);
        size_t written = 0;
        while (written < maxBytes) {
            if (pending_.empty()) {
                std::span<uint8_t> const rest = dest.subspan(written);
                std::span<const uint8_t> const next = container_->Next(rest);
                if (next.empty()) {
                    break;
                }
                if (next.data() == rest.data()) {
                    // Already in place
                    written += next.size();
                    continue;
                }
                pending_ = next;
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
    // Define the JavaScript class, with its read() and close() methods
    static Napi::Function GetClass(Napi::Env env) {
        return DefineClass(env, "MaxcsoReader",
                           {
                               InstanceMethod("read", &MaxcsoReader::Read),
                               InstanceMethod("close", &MaxcsoReader::Close),
                           });
    }

    // new MaxcsoReader(inputFilename): throws to JavaScript for a missing filename; the file is
    // opened by the first read()
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

// Opens a container on the thread pool, making the checks upstream makes while opening, and
// resolves its header information
class InfoWorker : public Napi::AsyncWorker {
   public:
    InfoWorker(Napi::Env env, Napi::Promise::Deferred deferred, PathString path)
        : Napi::AsyncWorker(env), deferred_(deferred), path_(std::move(path)) {}

    // Open the container for Open::kHeader and keep its header information. Runs on the worker
    // thread.
    void Execute() override {
        try {
            Container const container(path_, Open::kHeader, 0);
            format_ = container.FormatName();
            size_ = container.Size();
            blockSize_ = container.BlockSize();
        } catch (const std::exception& e) {
            SetError(e.what());
        } catch (...) {
            SetError("unknown maxcso info error");
        }
    }

    // Resolve with the header information
    void OnOK() override {
        Napi::Env const env = Env();
        Napi::Object const out = Napi::Object::New(env);
        out.Set("format", format_);
        out.Set("uncompressedSize", static_cast<double>(size_));
        out.Set("blockSize", blockSize_);
        deferred_.Resolve(out);
    }

    // Reject with the error Execute() set
    void OnError(const Napi::Error& e) override { deferred_.Reject(e.Value()); }

   private:
    Napi::Promise::Deferred deferred_;
    PathString path_;
    const char* format_ = "";
    uint64_t size_ = 0;
    uint32_t blockSize_ = 0;
};

// info(inputFilename): resolve a container's format, uncompressed size, and block size
static Napi::Value Info(const Napi::CallbackInfo& info) {
    Napi::Env const env = info.Env();
    Napi::Promise::Deferred const deferred = Napi::Promise::Deferred::New(env);
    if (info.Length() < 1 || !info[0].IsString()) {
        deferred.Reject(Napi::TypeError::New(env, "inputFilename (string) required").Value());
        return deferred.Promise();
    }
    try {
        QueueWorker<InfoWorker>(env, deferred, ToPath(info[0].As<Napi::String>()));
    } catch (const Napi::Error& e) {
        deferred.Reject(e.Value());
    }
    return deferred.Promise();
}

// ---- addon init ----

// Holds the class constructors for every ObjectWrap type registered by this addon. Stored as the
// addon's instance data so factories can retrieve them without a global.
struct Addon {
    Napi::FunctionReference maxcsoReader;
};

// openReader(inputFilename): construct a MaxcsoReader from the stored class constructor
static Napi::Value OpenReader(const Napi::CallbackInfo& info) {
    Napi::Env const env = info.Env();
    Napi::Function const ctor = env.GetInstanceData<Addon>()->maxcsoReader.Value();
    return ctor.New({info[0]});
}

// Register the reader class as instance data and export the addon's functions
static Napi::Object InitAll(Napi::Env env, Napi::Object exports) {
    Napi::Function const cls = MaxcsoReader::GetClass(env);
    env.SetInstanceData(new Addon{.maxcsoReader = Napi::Persistent(cls)});
    exports.Set("info", Napi::Function::New(env, Info));
    exports.Set("openReader", Napi::Function::New(env, OpenReader));
    return exports;
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, InitAll)
