#pragma once

#include <algorithm>
#include <cerrno>
#include <cstddef>
#include <cstdint>
#include <limits>
#include <memory>
#include <new>
#include <span>
#include <stdexcept>
#include <string>
#include <type_traits>
#include <utility>
#include <vector>

#ifdef _WIN32
#include <windows.h>
#else
#include <fcntl.h>
#include <unistd.h>
#endif

/**
 * A std::allocator that default-initializes elements instead of value-initializing them, so that
 * sizing a vector leaves trivial elements uninitialized instead of zeroing them. Only for storage
 * that is entirely written before it is read.
 */
template <typename T>
struct DefaultInitAllocator : std::allocator<T> {
    /** Rebinds the allocator to another element type without adding state. */
    template <typename U>
    struct rebind {
        using other = DefaultInitAllocator<U>;
    };

    /** Constructs a stateless allocator. */
    DefaultInitAllocator() = default;
    /** Converts between stateless allocator specializations. */
    template <typename U>
    // NOLINTNEXTLINE(google-explicit-constructor,hicpp-explicit-conversions): allocators must convert implicitly
    DefaultInitAllocator(const DefaultInitAllocator<U>& /*unused*/) noexcept {}

    /** Default-initializes storage without zeroing trivial elements; callers must write before reading. */
    template <typename U>
    void construct(U* ptr) noexcept(std::is_nothrow_default_constructible_v<U>) {
        ::new (static_cast<void*>(ptr)) U;
    }
    /** Constructs an element in place with the supplied arguments. */
    template <typename U, typename... Args>
    void construct(U* ptr, Args&&... args) {
        std::construct_at(ptr, std::forward<Args>(args)...);
    }
};

template <typename T>
using UninitVector = std::vector<T, DefaultInitAllocator<T>>;

// ---- file I/O ----

/**
 * A read-only file on a raw OS handle, like Dolphin's DirectIOFile, rather than stdio. The handle
 * is never inherited by a spawned child process: CreateFileW handles are non-inheritable without
 * SECURITY_ATTRIBUTES, and O_CLOEXEC closes the descriptor on exec. Reads are positioned, so there
 * is no shared seek state or stdio buffer.
 */
class File {
   public:
#ifdef _WIN32
    using PathString = std::wstring;
#else
    using PathString = std::string;
#endif

    /** Open the file for reading, or throw */
    explicit File(const PathString& path) : handle_(Open(path)) {}

    /** Close the handle */
    ~File() { Close(handle_); }

    File(const File&) = delete;
    File& operator=(const File&) = delete;
    File(File&&) = delete;
    File& operator=(File&&) = delete;

    /** The file's size in bytes, or throw */
    [[nodiscard]] uint64_t Size() const;

    /** Read exactly out.size() bytes starting at `offset`, or throw */
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

    /** Open `path` read-only, or throw */
    static Handle Open(const PathString& path) {
        Handle const handle =
            CreateFileW(path.c_str(), GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, nullptr,
                        OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
        if (handle == INVALID_HANDLE_VALUE) {
            throw std::runtime_error("failed to open the file");
        }
        return handle;
    }

    /** Close the handle, ignoring errors, since the handle is released either way */
    static void Close(Handle handle) { static_cast<void>(CloseHandle(handle)); }

    /** Returns the bytes read, or 0 on an error or the end of the file */
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

    /** Open `path` read-only, or throw */
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

    /**
     * Close the descriptor, ignoring errors. Not retried on EINTR: the descriptor is released
     * either way.
     */
    static void Close(Handle handle) { static_cast<void>(close(handle)); }

    /** Returns the bytes read, or 0 on an error or the end of the file */
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
inline uint64_t File::Size() const {
    LARGE_INTEGER size{};
    if (GetFileSizeEx(handle_, &size) == 0 || size.QuadPart < 0) {
        throw std::runtime_error("failed to determine the file size");
    }
    return static_cast<uint64_t>(size.QuadPart);
}
#else
inline uint64_t File::Size() const {
    // lseek() rather than fstat(), so block devices report their size too. Reads are positioned,
    // so moving the offset is harmless.
    off_t const size = lseek(handle_, 0, SEEK_END);
    if (size < 0) {
        throw std::runtime_error("failed to determine the file size");
    }
    return static_cast<uint64_t>(size);
}
#endif

/**
 * A table of fixed-size entries in a file, read one window of entries at a time rather than all at
 * once, so its memory doesn't grow with the file. Reads are expected to move forward through it.
 */
template <typename T>
class TableWindow {
   public:
    /** Creates an empty table window without allocating storage. */
    TableWindow() = default;

    /** `count` entries starting at `offset` in the file, read up to `bytes` bytes at a time */
    TableWindow(uint64_t offset, uint64_t count, size_t bytes)
        : offset_(offset),
          count_(count),
          entries_(static_cast<size_t>(std::min<uint64_t>(count, std::max<size_t>(bytes / sizeof(T), 1)))) {}

    /**
     * Entry `i`, or throw when it's past the end of the table. A window starting at `i` is read when
     * `i` isn't in the current one.
     */
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

/**
 * A buffer that reads a file a whole buffer at a time, so that the many small reads of a forward
 * scan become a few large ones
 */
class ReadAhead {
   public:
    /** Creates an empty read-ahead buffer without allocating storage. */
    ReadAhead() = default;

    /** A buffer of `size` bytes */
    explicit ReadAhead(size_t size) : buffer_(size) {}

    /**
     * The `length` bytes at `offset` in a file of `fileSize` bytes, valid until the next call, or
     * throw when they don't lie within the file or don't fit in the buffer. When they aren't all in
     * the buffer, it's refilled from `offset`.
     */
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
