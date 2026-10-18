#include "chdOpen.h"

#include <algorithm>
#include <array>
#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <limits>
#include <memory>
#include <new>
#include <utility>

#include "ioprocs.h"

#ifdef _WIN32
#include <windows.h>

#include "strconv.h"
#include "windows/winutil.h"
#else
#include <fcntl.h>
#include <sys/types.h>
#include <unistd.h>

#include <cerrno>
#endif

namespace {

// Caps each OS read: ReadFile takes a 32-bit length and macOS rejects a pread longer than INT_MAX,
// so a longer read returns short (like MAME's core_file)
constexpr std::size_t kMaxReadBytes = std::size_t{1} << 30U;

// The size of the buffer small reads are served from, the same as core_file's. CHD headers and
// metadata are read in pieces of a few bytes each, which would otherwise each cost an OS read.
constexpr std::size_t kBufferBytes = 512;

// ---- OS calls ----

#ifdef _WIN32
using FileHandle = HANDLE;
using OpenPath = std::wstring;

/** The handle that refers to no file */
FileHandle NoFile() noexcept { return INVALID_HANDLE_VALUE; }

/** `path` in the form the OS opens, or throw std::bad_alloc */
OpenPath ToOpenPath(const std::string& path) { return osd::text::to_wstring(path); }

/** The last OS error */
std::error_condition LastError() noexcept { return win_error_to_error_condition(GetLastError()); }

/** Open `path` read-only, sharing every kind of access, returning NoFile() on an error */
FileHandle OpenShared(const OpenPath& path) noexcept {
    return CreateFileW(path.c_str(), GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, nullptr,
                       OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
}

/** Close `handle`, ignoring errors, since it is released either way */
void CloseFile(FileHandle handle) noexcept { static_cast<void>(CloseHandle(handle)); }

/** Read up to `length` bytes at `offset`, reading nothing at or past the end */
std::error_condition ReadAt(FileHandle handle, std::uint64_t offset, void* buffer, std::size_t length,
                            std::size_t& actual) noexcept {
    actual = 0;
    OVERLAPPED overlapped{};
    overlapped.Offset = static_cast<DWORD>(offset);
    overlapped.OffsetHigh = static_cast<DWORD>(offset >> 32U);
    DWORD got = 0;
    if (ReadFile(handle, buffer, static_cast<DWORD>(length), &got, &overlapped) == FALSE) {
        // A positioned read at or past the end fails with this, where core_file reads nothing
        if (GetLastError() != ERROR_HANDLE_EOF) {
            return LastError();
        }
    }
    actual = got;
    return {};
}

/** The file's current size */
std::error_condition CurrentSize(FileHandle handle, std::uint64_t& size) noexcept {
    LARGE_INTEGER result{};
    if (GetFileSizeEx(handle, &result) == FALSE) {
        return LastError();
    }
    size = static_cast<std::uint64_t>(result.QuadPart);
    return {};
}
#else
using FileHandle = int;
using OpenPath = std::string;

/** The descriptor that refers to no file */
FileHandle NoFile() noexcept { return -1; }

/** `path` in the form the OS opens, or throw std::bad_alloc */
OpenPath ToOpenPath(const std::string& path) { return path; }

/** The last OS error */
std::error_condition LastError() noexcept { return {errno, std::generic_category()}; }

/**
 * Open `path` read-only, returning NoFile() on an error. POSIX never stops another process
 * writing, renaming, or deleting an open file. O_CLOEXEC keeps a spawned child from inheriting it.
 */
FileHandle OpenShared(const OpenPath& path) noexcept {
    // NOLINTNEXTLINE(cppcoreguidelines-pro-type-vararg,hicpp-vararg): open() is variadic for its mode
    FileHandle handle = open(path.c_str(), O_RDONLY | O_CLOEXEC);
    while (handle < 0 && errno == EINTR) {
        // NOLINTNEXTLINE(cppcoreguidelines-pro-type-vararg,hicpp-vararg): open() is variadic for its mode
        handle = open(path.c_str(), O_RDONLY | O_CLOEXEC);
    }
    return handle < 0 ? NoFile() : handle;
}

/** Close `handle`, ignoring errors. Not retried on EINTR: the descriptor is released either way. */
void CloseFile(FileHandle handle) noexcept { static_cast<void>(close(handle)); }

/** Read up to `length` bytes at `offset`, reading nothing at or past the end */
std::error_condition ReadAt(FileHandle handle, std::uint64_t offset, void* buffer, std::size_t length,
                            std::size_t& actual) noexcept {
    actual = 0;
    if (offset > static_cast<std::uint64_t>(std::numeric_limits<off_t>::max())) {
        return {};
    }
    ssize_t got = pread(handle, buffer, length, static_cast<off_t>(offset));
    while (got < 0 && errno == EINTR) {
        got = pread(handle, buffer, length, static_cast<off_t>(offset));
    }
    if (got < 0) {
        return LastError();
    }
    actual = static_cast<std::size_t>(got);
    return {};
}

/** The file's current size */
std::error_condition CurrentSize(FileHandle handle, std::uint64_t& size) noexcept {
    // lseek() rather than fstat(), so block devices report their size too. Reads are positioned,
    // so moving the offset is harmless.
    off_t const result = lseek(handle, 0, SEEK_END);
    if (result < 0) {
        return LastError();
    }
    size = static_cast<std::uint64_t>(result);
    return {};
}
#endif

// ---- the file ----

/**
 * A read-only file on a raw OS handle that other processes can write, rename, and delete while it
 * is open, on every OS, standing in for the util::core_file that MAME's chd_file::open() would
 * open, which only shares reads on Windows. Positions and the size are tracked the same way
 * core_file tracks them, and a write fails the same way a read-only core_file's does.
 */
class SharedFile final : public util::random_read_write {
   public:
    SharedFile() = default;
    SharedFile(const SharedFile&) = delete;
    SharedFile& operator=(const SharedFile&) = delete;
    SharedFile(SharedFile&&) = delete;
    SharedFile& operator=(SharedFile&&) = delete;

    /** Close the file */
    ~SharedFile() override {
        if (handle_ != NoFile()) {
            CloseFile(handle_);
        }
    }

    /** Open `path` read-only and record its size */
    std::error_condition Open(const OpenPath& path) noexcept {
        handle_ = OpenShared(path);
        if (handle_ == NoFile()) {
            return LastError();
        }
        return CurrentSize(handle_, size_);
    }

    /** Read from the current position, then advance it past the bytes read */
    std::error_condition read_some(void* buffer, std::size_t length, std::size_t& actual) noexcept override {
        std::error_condition const err = read_some_at(position_, buffer, length, actual);
        position_ += actual;
        size_ = std::max(size_, position_);
        return err;
    }

    /**
     * Read at `offset` without moving the current position, reading nothing at the end. What the
     * buffer holds is served from it, and a small remainder is read through it, while a large one
     * is read directly (like MAME's core_file).
     */
    std::error_condition read_some_at(std::uint64_t offset, void* buffer, std::size_t length,
                                      std::size_t& actual) noexcept override {
        auto* const destination = static_cast<std::uint8_t*>(buffer);
        actual = 0;
        if (offset >= bufferBase_ && offset - bufferBase_ < bufferBytes_) {
            auto const start = static_cast<std::size_t>(offset - bufferBase_);
            actual = std::min(length, bufferBytes_ - start);
            std::memcpy(destination, buffer_.data() + start, actual);
        }
        if (actual == length) {
            return {};
        }

        std::uint64_t const next = offset + actual;
        std::size_t const remaining = length - actual;
        if (remaining >= kBufferBytes / 2) {
            std::size_t direct = 0;
            std::error_condition const err =
                ReadAt(handle_, next, destination + actual, std::min(remaining, kMaxReadBytes), direct);
            actual += direct;
            return err;
        }

        std::size_t filled = 0;
        std::error_condition const err = ReadAt(handle_, next, buffer_.data(), buffer_.size(), filled);
        if (err) {
            bufferBytes_ = 0;
            return err;
        }
        bufferBase_ = next;
        bufferBytes_ = filled;
        std::size_t const copied = std::min(remaining, filled);
        std::memcpy(destination + actual, buffer_.data(), copied);
        actual += copied;
        return {};
    }

    /** Move the current position, failing rather than moving it before the start or overflowing */
    std::error_condition seek(std::int64_t offset, int whence) noexcept override {
        std::uint64_t base = 0;
        switch (whence) {
            case SEEK_SET:
                break;
            case SEEK_CUR:
                base = position_;
                break;
            case SEEK_END:
                base = size_;
                break;
            default:
                return std::errc::invalid_argument;
        }
        if (offset < 0) {
            // Negated after adding 1, so the most negative offset doesn't overflow
            if (static_cast<std::uint64_t>(-(offset + 1)) + 1 > base) {
                return std::errc::invalid_argument;
            }
        } else if (std::numeric_limits<std::uint64_t>::max() - static_cast<std::uint64_t>(offset) < base) {
            return std::errc::invalid_argument;
        }
        position_ = base + offset;
        return {};
    }

    /** Report the current position */
    std::error_condition tell(std::uint64_t& result) noexcept override {
        result = position_;
        return {};
    }

    /** Report the size recorded when the file was opened, or the furthest read since, if larger */
    std::error_condition length(std::uint64_t& result) noexcept override {
        result = size_;
        return {};
    }

    /** Fail, since the file is read-only */
    std::error_condition write_some(void const* /*buffer*/, std::size_t /*length*/,
                                    std::size_t& actual) noexcept override {
        actual = 0;
        return std::errc::bad_file_descriptor;
    }

    /** Fail, since the file is read-only */
    std::error_condition write_some_at(std::uint64_t /*offset*/, void const* /*buffer*/, std::size_t /*length*/,
                                       std::size_t& actual) noexcept override {
        actual = 0;
        return std::errc::bad_file_descriptor;
    }

    /** Succeed, since nothing is ever written */
    std::error_condition finalize() noexcept override { return {}; }

    /** Succeed, since nothing is ever written */
    std::error_condition flush() noexcept override { return {}; }

   private:
    FileHandle handle_ = NoFile();
    std::uint64_t position_ = 0;
    std::uint64_t size_ = 0;

    // The bytes most recently read for a small read, starting at bufferBase_
    std::array<std::uint8_t, kBufferBytes> buffer_{};
    std::uint64_t bufferBase_ = 0;
    std::size_t bufferBytes_ = 0;
};

}  // namespace

std::error_condition OpenChdForReading(chd_file& chd, const std::string& path) {
    // Reported as an error rather than thrown, the same as core_file reports it
    OpenPath openPath;
    std::unique_ptr<SharedFile> file;
    try {
        openPath = ToOpenPath(path);
        file = std::make_unique<SharedFile>();
    } catch (const std::bad_alloc&) {
        return std::errc::not_enough_memory;
    }
    std::error_condition const err = file->Open(openPath);
    if (err) {
        return err;
    }
    util::random_read_write::ptr opened = std::move(file);
    return chd.open(std::move(opened), false, nullptr);
}
