# Temp Directory

Igir needs to write some temporary files to disk for a few reasons:

- Downloading [DAT URLs](../dats/processing.md#scanning-for-dats) to disk before parsing
- Extracting [some archives](../input/reading-archives.md) to disk during scanning, and when reading when extracting or [zipping](../output/writing-archives.md)

Temporary files are ones that are deleted as soon as Igir no longer needs them for processing. Igir will also delete any leftover temporary files on exit.

Igir will use your operating system's temporary directory for these files by default.  The option `--temp-dir <path>` is provided to let you change the directory, and you may want to do this for a few reasons:

- Your operating system drive has minimal space available
- You want to protect your operating system drive from excess wear and tear
- You want to use a "RAM disk" instead of a real drive

## RAM disks

### :simple-windowsxp: Windows

There are no tools built-in to Windows that can create a RAM disk. The open source [ImDisk Toolkit](https://sourceforge.net/projects/imdisk-toolkit/) is a popular option.

### :simple-apple: macOS

The built-in `diskutil` and `hdiutil` tools can be used to create and mount a RAM disk. Alex T has some instructions in a [GitHub gist](https://gist.github.com/htr3n/344f06ba2bb20b1056d7d5570fe7f596).

### :simple-linux: Linux

`tmpfs` is a tool that comes with most Linux distributions that is used for creating RAM disks. Oracle has [a guide](https://docs.oracle.com/cd/E18752_01/html/817-5093/fscreate-99040.html) on the tool.
