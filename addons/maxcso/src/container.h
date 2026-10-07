#pragma once

#include "../deps/maxcso/libdeflate/libdeflate.h"
#include "../deps/maxcso/src/dax.h"
#include "file.h"

// Upstream Input::DetectFormat reads this many header bytes for every format
constexpr uint64_t kHeaderBytes = 24;

using PathString = File::PathString;

/** Frees a libdeflate decompressor, for DecompressorPtr */
struct DecompressorFreer {
    /** Releases the owned native decompressor. */
    void operator()(libdeflate_decompressor* decompressor) const { libdeflate_free_decompressor(decompressor); }
};
using DecompressorPtr = std::unique_ptr<libdeflate_decompressor, DecompressorFreer>;

// ---- container ----

// How an index entry's bytes are encoded
enum class Codec : uint8_t { kStored, kDeflate, kLz4, kZlib };

// Which container format a file is
enum class Format : uint8_t { kCso1, kCso2, kZso, kDax };

/** The index entry that covers an uncompressed position, as upstream Input::ReadSector finds it */
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

/**
 * An opened CSO, ZSO, or DAX file, decoded as upstream maxcso's Input class decodes it. Upstream's
 * checks are kept as they are. The only ones added guard reads, writes, allocations, and shifts
 * that would be memory-unsafe or undefined in upstream; each one says why.
 */
class Container {
   public:
    /**
     * Open and parse `path`, or throw. For Open::kRead, the index and the entries' data are read
     * from the file `readBytes` bytes at a time, though never less than a whole entry's data.
     */
    Container(const PathString& path, Open open, size_t readBytes);

    /** The uncompressed image's size in bytes */
    [[nodiscard]] uint64_t Size() const { return size_; }

    /** The size of the uncompressed data each index entry covers */
    [[nodiscard]] uint32_t BlockSize() const { return blockSize_; }

    /** The format's name, as index.ts reports it */
    [[nodiscard]] const char* FormatName() const;

    /**
     * Run upstream Input::ReadSector from the current position, including the calls it would make
     * next for the same index entry, and return the sectors they emit. It's empty at the end of the
     * image. Decoded sectors are written to the start of `dest` when it can hold a whole block.
     * Otherwise, and for stored sectors, they're in this container's buffers, valid until the next
     * call.
     */
    std::span<const uint8_t> Next(std::span<uint8_t> dest);

   private:
    /** Read the file's first header bytes into a T, leaving any of T past them zeroed */
    template <typename T>
    [[nodiscard]] T ReadHeader() const {
        T header{};
        std::span<std::byte> const bytes = std::as_writable_bytes(std::span(&header, 1));
        file_.ReadAt(0, bytes.first(std::min<size_t>(bytes.size(), kHeaderBytes)));
        return header;
    }

    /** Parse a CSO or ZSO header, and set up its index for Open::kRead */
    void ParseCso(bool zso, Open open, size_t readBytes);

    /** Parse a DAX header and its NC areas, and set up its frame table for Open::kRead */
    void ParseDax(Open open, size_t readBytes);

    /**
     * Throw unless the NC area lies within the frame table. Upstream marks the area's frames
     * without a range check, which writes out of bounds.
     */
    static void CheckDaxArea(size_t i, const maxcso::DAXNCArea& area, uint64_t frames);

    /** Where a CSO or ZSO index entry with the value `value` has its data start in the file */
    [[nodiscard]] uint64_t Position(uint32_t value) const;

    /** Where the entry covering `pos` is and how it's encoded, by the rules of upstream ReadSector */
    [[nodiscard]] Block Locate(uint64_t pos);

    /**
     * Throw unless an entry can be read in full. Upstream reads an entry through a
     * cacheSize_-byte buffer and fails when it gets fewer bytes than the entry's length.
     */
    void CheckRead(uint64_t entry, uint64_t offset, uint32_t length) const;

    /** Throw for an entry that doesn't hold enough bytes for the sectors upstream would emit from it */
    [[noreturn]] static void ThrowTooFew(uint64_t entry);

    /**
     * Next() for a stored entry. Upstream emits one sector per call from a stored entry,
     * starting `skip` bytes into it.
     */
    std::span<const uint8_t> NextStored(const Block& block);

    /**
     * Whether upstream's call for the sector `run` bytes on would read the same entry, `run` bytes
     * further in
     */
    [[nodiscard]] bool Continues(const Block& block, uint32_t run) const;

    /**
     * Next() for a compressed entry. Upstream decodes the whole entry, drops what's past the end
     * of the image, and emits sectors from `skip` bytes in until the decoded bytes run out.
     */
    std::span<const uint8_t> NextCompressed(const Block& block, std::span<uint8_t> dest);

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
