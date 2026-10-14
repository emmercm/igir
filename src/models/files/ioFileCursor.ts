import Defaults from '../../globals/defaults.js';
import IOFile from './ioFile.js';

/**
 * An independent read position over an {@link IOFile}, with its own read-ahead buffer, so that
 * many small reads near each other only read from the file once. It's a subclass of
 * {@link IOFile} that reads and writes through its file, so either can be used wherever the
 * other is.
 *
 * An {@link IOFile} only has one read position, but some patches read from several places in the
 * same file at the same time (for example, separate streams of commands and data). Any number of
 * cursors can be active over the same file at once, each with its own position and read-ahead
 * buffer, so they don't keep moving each other's position or evicting each other's buffered
 * bytes.
 *
 * Read position: a cursor starts at its file's read position (unless it's given one), and from
 * then on the two are independent. Reading, seeking, skipping, or writing through a cursor never
 * moves its file's read position, and moving the file's read position (or another cursor's) never
 * moves this cursor's.
 *
 * Writes: writes through a cursor are written through to its file, and discard the cursor's
 * read-ahead buffer if they overlap it. Writes through the file directly, or through another
 * cursor, aren't seen by bytes this cursor has already read ahead or by its size, so don't read
 * and write the same region of a file through different cursors.
 */
export default class IOFileCursor extends IOFile {
  private readonly file: IOFile;

  private buffer: Buffer = Buffer.alloc(0);
  private bufferPosition = 0;
  private bufferReachesEOF = false;

  private constructor(file: IOFile, position: number) {
    super(file);
    this.file = file;
    this.seek(position);
  }

  /**
   * Return a new {@link IOFileCursor} over {@link ioFile}, starting at {@link position}, or at
   * {@link ioFile}'s read position if not given.
   */
  static cursorFromFile(ioFile: IOFile, position = ioFile.getPosition()): IOFileCursor {
    return new IOFileCursor(ioFile, position);
  }

  /**
   * Reads at the seek position are sequential, so this fills the read-ahead buffer from the seek
   * position when the bytes aren't already in it, and the reads that follow are served from the
   * buffer. Reads larger than the buffer skip it and read from the file directly. The inherited
   * {@link IOFile.readNext} and {@link IOFile.readUntil} read through this.
   * @returns the next {@link size} bytes (fewer at the end of the file) from the current seek
   * position, without changing the seek position
   */
  override async peekNext(size: number): Promise<Buffer> {
    if (!this.isBuffered(this.getPosition(), size)) {
      if (size > Defaults.FILE_READING_CHUNK_SIZE) {
        // Large reads wouldn't fit in the buffer, read them directly
        return await this.file.readAt(this.getPosition(), size);
      }
      await this.fillBuffer();
    }
    return this.readBuffer(this.getPosition(), size);
  }

  /**
   * Reads at an arbitrary position are random access, so this serves them from the read-ahead
   * buffer if the bytes are already in it, but otherwise reads from the file without filling the
   * buffer. Filling the buffer here would evict the bytes read ahead of the seek position, and the
   * next sequential read would need to read them from the file again. The inherited
   * {@link IOFile.copyChunked} and {@link IOFile.copyNext} read through this.
   * @returns bytes of size {@link size} (fewer at the end of the file) at the seek position
   * {@link position}, without changing the seek position
   */
  override async readAt(position: number, size: number): Promise<Buffer> {
    if (this.isBuffered(position, size)) {
      return this.readBuffer(position, size);
    }
    return await this.file.readAt(position, size);
  }

  /**
   * Write {@link buffer} at the seek position {@link position}.
   *
   * Writes go to the file, not the read-ahead buffer, so this discards the buffer if the write
   * overlaps it, and the next read fills it again with the written bytes. The inherited
   * {@link IOFile.write} writes through this.
   */
  override async writeAt(buffer: Buffer, position: number): Promise<number> {
    const bytesWritten = await this.file.writeAt(buffer, position);
    this.size = this.file.getSize();
    if (position + buffer.length > this.bufferPosition) {
      // The write overlaps the buffer, or grows the file past a buffer that reached its end
      this.discardBuffer();
    }
    return bytesWritten;
  }

  /**
   * Truncate or zero-extend the file to {@link size} bytes.
   *
   * This discards the read-ahead buffer, because it can hold bytes past the new end of the file,
   * or be marked as reaching an end of the file that has moved.
   */
  override async truncate(size: number): Promise<void> {
    await this.file.truncate(size);
    this.size = this.file.getSize();
    this.discardBuffer();
  }

  /**
   * Close the underlying file, which closes it for the {@link IOFile} and every other cursor over
   * it too. This discards the read-ahead buffer, so its memory can be freed.
   */
  override async close(): Promise<void> {
    this.discardBuffer();
    await this.file.close();
  }

  /**
   * @returns if the {@link size} bytes at {@link position} are all in the buffer, or the buffer
   * holds every byte from {@link position} to the end of the file
   */
  private isBuffered(position: number, size: number): boolean {
    const bufferEnd = this.bufferPosition + this.buffer.length;
    return (
      position >= this.bufferPosition &&
      (position + size <= bufferEnd || (this.bufferReachesEOF && position <= bufferEnd))
    );
  }

  private readBuffer(position: number, size: number): Buffer {
    const offset = position - this.bufferPosition;
    // Copy, so callers can modify the result without modifying the buffer
    return Buffer.from(this.buffer.subarray(offset, offset + size));
  }

  private async fillBuffer(): Promise<void> {
    const position = this.getPosition();
    // Don't allocate more than what's left in the file
    const size = Math.max(0, Math.min(this.getSize() - position, Defaults.FILE_READING_CHUNK_SIZE));
    this.buffer = await this.file.readAt(position, size);
    this.bufferPosition = position;
    this.bufferReachesEOF = this.buffer.length < Defaults.FILE_READING_CHUNK_SIZE;
  }

  private discardBuffer(): void {
    this.buffer = Buffer.alloc(0);
    this.bufferPosition = 0;
    this.bufferReachesEOF = false;
  }
}
