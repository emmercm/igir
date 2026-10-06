#include "container.h"

#include <algorithm>
#include <array>
#include <bit>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <limits>
#include <memory>
#include <new>
#include <span>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

#include "../deps/maxcso/libdeflate/libdeflate.h"
#include "../deps/maxcso/lz4/lib/lz4.h"
#include "../deps/maxcso/src/cso.h"
#include "../deps/maxcso/src/dax.h"
#include "../deps/maxcso/zlib/zlib.h"

static_assert(sizeof(maxcso::CSOHeader) == 24, "CSOHeader must match the on-disk layout");
static_assert(sizeof(maxcso::DAXHeader) == 32, "DAXHeader must match the on-disk layout");
static_assert(sizeof(maxcso::DAXNCArea) == 8, "DAXNCArea must match the on-disk layout");

// Headers and index tables are read straight into native integers
static_assert(std::endian::native == std::endian::little, "only little-endian targets are supported");

/** Allocate a libdeflate decompressor, or throw std::bad_alloc */
static DecompressorPtr NewDecompressor() {
    DecompressorPtr decompressor(libdeflate_alloc_decompressor());
    if (!decompressor) {
        throw std::bad_alloc();
    }
    return decompressor;
}

// ---- codecs ----

constexpr uint32_t kSectorSize = maxcso::SECTOR_SIZE;
constexpr uint32_t kMaxBlockSize = 0x40000;
constexpr uint32_t kMinCacheSize = 32768;
constexpr uint64_t kCsoIndexOffset = sizeof(maxcso::CSOHeader);
constexpr uint64_t kDaxIndexOffset = sizeof(maxcso::DAXHeader);

/** Throw unless an uncompressed size is a whole number of sectors, as upstream requires */
static void CheckAligned(uint64_t size) {
    if (size % kSectorSize != 0) {
        throw std::runtime_error("uncompressed size " + std::to_string(size) + " is not a multiple of 2048");
    }
}

/**
 * Returns the bytes produced, or 0 on a decode error. maxcso pads blocks out to the index
 * alignment, so decoding stops at the output size instead of requiring the input to end there.
 */
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

/**
 * Returns the bytes produced, or 0 on a decode error. With `zlib`, the input is a zlib stream: its
 * 2-byte header is checked and skipped, and its Adler-32 trailer is verified.
 */
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

/** The codec's name, for error messages */
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

Container::Container(const PathString& path, Open open, size_t readBytes) : file_(path), fileSize_(file_.Size()) {
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
    data_ = ReadAhead(static_cast<size_t>(std::min<uint64_t>(std::max<uint64_t>(readBytes, cacheSize_), fileSize_)));
    decoded_.resize(blockSize_);
}

const char* Container::FormatName() const {
    switch (format_) {
        case Format::kDax:
            return "DAX";
        case Format::kZso:
            return "ZSO";
        default:
            return "CSO";
    }
}

std::span<const uint8_t> Container::Next(std::span<uint8_t> dest) {
    if (pos_ >= size_) {
        return {};
    }
    Block const block = Locate(pos_);
    return block.codec == Codec::kStored ? NextStored(block) : NextCompressed(block, dest);
}

void Container::ParseCso(bool zso, Open open, size_t readBytes) {
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

void Container::ParseDax(Open open, size_t readBytes) {
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

    /** Read even for Open::kHeader, because an out-of-range area fails the open */
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

void Container::CheckDaxArea(size_t i, const maxcso::DAXNCArea& area, uint64_t frames) {
    if (area.count != 0 && (area.start >= frames || area.count > frames - area.start)) {
        throw std::runtime_error("DAX NC area " + std::to_string(i) + " is out of range");
    }
}

uint64_t Container::Position(uint32_t value) const {
    // Upstream shifts a 64-bit integer by this, which is undefined from 64
    if (shift_ >= 64) {
        throw std::runtime_error("index shift " + std::to_string(shift_) + " is 64 or more");
    }
    return uint64_t{value & ~maxcso::CSO_INDEX_UNCOMPRESSED} << shift_;
}

Block Container::Locate(uint64_t pos) {
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

void Container::CheckRead(uint64_t entry, uint64_t offset, uint32_t length) const {
    if (length > cacheSize_) {
        throw std::runtime_error("block " + std::to_string(entry) + " is longer than " + std::to_string(cacheSize_) +
                                 " bytes");
    }
    if (offset > fileSize_ || length > fileSize_ - offset) {
        throw std::runtime_error("block " + std::to_string(entry) + " points past the end of the file");
    }
}

void Container::ThrowTooFew(uint64_t entry) {
    throw std::runtime_error("block " + std::to_string(entry) + " has too few bytes for its sectors");
}

std::span<const uint8_t> Container::NextStored(const Block& block) {
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

bool Container::Continues(const Block& block, uint32_t run) const {
    uint64_t const pos = pos_ + run;
    return (pos >> blockShift_) == block.entry && (pos & (blockSize_ - 1)) == block.skip + run;
}

std::span<const uint8_t> Container::NextCompressed(const Block& block, std::span<uint8_t> dest) {
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
