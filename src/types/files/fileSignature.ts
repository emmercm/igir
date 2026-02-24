import { Readable } from 'node:stream';

import { Memoize } from 'typescript-memoize';

type SignaturePiece = {
  offset?: number;
} & (
  | {
      // Static values
      value: Buffer;
      length?: never;
      match?: never;
    }
  | {
      // Dynamic values
      value?: never;
      length: number;
      match: (buffer: Buffer) => boolean;
    }
);

const CanBeTrimmed = {
  NO: 0,
  YES: 1,
} as const;
type CanBeTrimmedKey = keyof typeof CanBeTrimmed;
type CanBeTrimmedValue = (typeof CanBeTrimmed)[CanBeTrimmedKey];

function superNintendoDynamicPiece(headerSize: number): SignaturePiece {
  return {
    offset: headerSize + 0x40_ff_b0,
    length: 0x2e + 2,
    match: (buffer): boolean => {
      return [
        headerSize + 0x7f_b0, // LoROM
        headerSize + 0xff_b0, // HiROM
        headerSize + 0x40_ff_b0, // ExHiROM
      ].some((offset) => {
        if (buffer.length < offset + 0x25 + 1) {
          return false;
        }
        const romSpeedAndMemoryMapMode = buffer.readUInt8(offset + 0x25);
        if ((romSpeedAndMemoryMapMode & 0b1110_0000) !== 0b0010_0000) {
          // The upper 3 bits are always the same
          return false;
        }
        const mapMode = romSpeedAndMemoryMapMode & 0x0f; // lower 4 bits
        if (
          ![
            0b0000, // LoROM
            0b0001, // HiROM
            0b0010, // SDD-1
            0b0011, // SA-1
            0b0101, // ExHiROM
          ].includes(mapMode)
        ) {
          return false;
        }

        if (buffer.length < offset + 0x2c + 2) {
          return false;
        }
        const checksumComplement = buffer.readUInt16LE(offset + 0x2c);
        const checksum = buffer.readUInt16LE(offset + 0x2e);
        if (checksum === 0 || (checksumComplement ^ checksum) !== 0xff_ff) {
          return false;
        }

        return true;
      });
    },
  };
}

export default class FileSignature {
  // @see https://en.wikipedia.org/wiki/List_of_file_signatures
  // @see https://www.garykessler.net/library/file_sigs.html
  // @see https://file-extension.net/seeker/
  // @see https://gbatemp.net/threads/help-with-rom-iso-console-identification.611378/
  private static readonly SIGNATURES_UNSORTED: Record<string, FileSignature> = {
    // ********** GENERAL **********

    // @see https://en.wikipedia.org/wiki/List_of_file_signatures
    elf: new FileSignature('.elf', [{ value: Buffer.from('\x7FELF') }]),

    // ********** ARCHIVES **********

    // @see https://en.wikipedia.org/wiki/List_of_file_signatures
    '7z': new FileSignature('.7z', [{ value: Buffer.from('377ABCAF271C', 'hex') }]),

    // @see https://en.wikipedia.org/wiki/List_of_file_signatures
    bz2: new FileSignature('.bz2', [{ value: Buffer.from('BZh') }]),

    // @see https://docs.fileformat.com/compression/gz/
    gz: new FileSignature('.gz', [{ value: Buffer.from('1F8B08', 'hex') }]), // deflate
    // .tar.gz has the same file signature

    // @see https://en.wikipedia.org/wiki/List_of_file_signatures
    lz: new FileSignature('.lz', [{ value: Buffer.from('LZIP') }]),

    // @see https://en.wikipedia.org/wiki/List_of_file_signatures
    lz4: new FileSignature('.lz4', [{ value: Buffer.from('04224D18', 'hex') }]),

    // @see https://en.wikipedia.org/wiki/List_of_file_signatures
    lzh: new FileSignature('.lzh', [
      { value: Buffer.from('-lh') },
      { offset: 4, value: Buffer.from('-') },
    ]),

    // @see https://en.wikipedia.org/wiki/List_of_file_signatures
    oar: new FileSignature('.oar', [{ value: Buffer.from('OAR') }]),

    // @see https://en.wikipedia.org/wiki/List_of_file_signatures
    rar1: new FileSignature('.rar', [{ value: Buffer.from('Rar!\x1A\x07\x00') }]), // v1.50+
    rar5: new FileSignature('.rar', [{ value: Buffer.from('Rar!\x1A\x07\x01\x00') }]), // v5.00+

    // @see https://en.wikipedia.org/wiki/List_of_file_signatures
    rs: new FileSignature('.rs', [{ value: Buffer.from('RSVKDATA') }]),

    // @see https://en.wikipedia.org/wiki/List_of_file_signatures
    tar1: new FileSignature('.tar', [{ offset: 257, value: Buffer.from('ustar\x0000') }]),
    tar2: new FileSignature('.tar', [{ offset: 257, value: Buffer.from('ustar\x20\x20\x00') }]),

    // @see https://en.wikipedia.org/wiki/List_of_file_signatures
    xar: new FileSignature('.xar', [{ value: Buffer.from('xar!') }]),

    // @see https://en.wikipedia.org/wiki/List_of_file_signatures
    xz: new FileSignature('.xz', [{ value: Buffer.from('\xFD7zXZ\x00') }]),
    // .tar.xz has the same file signature

    // @see https://en.wikipedia.org/wiki/List_of_file_signatures
    z_lzw: new FileSignature('.z', [{ value: Buffer.from('1F9D', 'hex') }]), // LZW compression
    z_lzh: new FileSignature('.z', [{ value: Buffer.from('1FA0', 'hex') }]), // LZH compression
    // .tar.z has the same file signature

    // @see https://en.wikipedia.org/wiki/List_of_file_signatures
    zip: new FileSignature('.zip', [{ value: Buffer.from('PK\x03\x04') }]),
    zip_empty: new FileSignature('.zip', [{ value: Buffer.from('PK\x05\x06') }]), // empty archive
    // .zipx has the same file signature?

    // @see https://en.wikipedia.org/wiki/List_of_file_signatures
    zst: new FileSignature('.zst', [{ value: Buffer.from('28B52FFD', 'hex') }]),

    // @see https://en.wikipedia.org/wiki/List_of_file_signatures
    // Note: this file might be some other .z## number, it just ISN'T the final zip file
    z01: new FileSignature('.z01', [{ value: Buffer.from('PK\x07\x08') }]),

    // ********** ROMs - GENERAL **********

    chd: new FileSignature('.chd', [{ value: Buffer.from('MComprHD') }]),

    // @see https://docs.fileformat.com/disc-and-media/cso/
    cso: new FileSignature('.cso', [{ value: Buffer.from('CISO') }]),

    dax: new FileSignature('.dax', [{ value: Buffer.from('DAX') }]),

    // @see https://en.wikipedia.org/wiki/List_of_file_signatures
    isz: new FileSignature('.isz', [{ value: Buffer.from('IsZ!') }]),

    // @see https://docs.fileformat.com/disc-and-media/cso/
    zso: new FileSignature('.zso', [{ value: Buffer.from('ZISO') }]),

    // ********** ROMs - SPECIFIC **********

    // Apple
    // @see https://applesaucefdc.com/a2r/
    a2r: new FileSignature('.a2r', [{ value: Buffer.from('A2R3\xFF\x0A\x0D\x0A') }]),
    // @see https://www.kryoflux.com/download/kryoflux_stream_protocol_rev1.1.pdf
    kryoflux_raw: new FileSignature('.raw', [
      { value: Buffer.from('\x0D\x04') }, // start of KFInfo block
      { offset: 0x4, value: Buffer.from('host_date=') }, // typical first info
    ]),
    // @see https://applesaucefdc.com/woz/reference2/
    woz: new FileSignature('.woz', [{ value: Buffer.from('WOZ2\xFF\x0A\x0D\x0A') }]),

    // Atari - 7800
    a78: new FileSignature('.a78', [
      { offset: 1, value: Buffer.from('ATARI7800') },
      { offset: 0x64, value: Buffer.from('ACTUAL CART DATA STARTS HERE') },
    ]),

    // Atari - Jaguar
    jag: new FileSignature('.jag', [{ value: Buffer.from('JAGR') }]),
    jag_wrapped: new FileSignature('.jag', [{ offset: 0x1c, value: Buffer.from('JAGR') }]),
    // j64: new FileSignature('.j64', [{ value: Buffer.from('\xF6') }]),

    // Atari - Lynx
    // @see https://web.mit.edu/freebsd/head/contrib/file/magic/Magdir/console
    bll_bs93: new FileSignature('.bll', [
      { value: Buffer.from('\x80\x08') },
      { offset: 0x6, value: Buffer.from('BS93') },
    ]),
    bll_lynx: new FileSignature('.bll', [
      { value: Buffer.from('\x80\x08') },
      { offset: 0x6, value: Buffer.from('LYNX') },
    ]),
    lnx: new FileSignature('.lnx', [{ value: Buffer.from('LYNX') }]),

    // Commodore
    // @see https://vice-emu.sourceforge.io/vice_17.html#SEC434
    crt_c64: new FileSignature('.crt', [{ value: Buffer.from('C64 CARTRIDGE   ') }]),
    crt_c128: new FileSignature('.crt', [{ value: Buffer.from('C128 CARTRIDGE  ') }]),
    crt_cbm2: new FileSignature('.crt', [{ value: Buffer.from('CBM2 CARTRIDGE  ') }]),
    crt_vic20: new FileSignature('.crt', [{ value: Buffer.from('VIC20 CARTRIDGE ') }]),
    crt_plus4: new FileSignature('.crt', [{ value: Buffer.from('PLUS4 CARTRIDGE ') }]),
    // @see https://vice-emu.sourceforge.io/vice_17.html#SEC400
    g64: new FileSignature('.g64', [{ value: Buffer.from('GCR-1541') }]),
    // @see https://vice-emu.sourceforge.io/vice_17.html#SEC433
    p00: new FileSignature('.p00', [{ value: Buffer.from('C64File\x00') }]),
    // @see https://vice-emu.sourceforge.io/vice_17.html#SEC404
    p64: new FileSignature('.p64', [{ value: Buffer.from('P64-1541') }]),
    // @see https://vice-emu.sourceforge.io/vice_17.html#SEC396
    t64: new FileSignature('.t64', [
      { value: Buffer.from('C64S tape image file'.padEnd(32, '\x00')) },
    ]),
    // @see https://vice-emu.sourceforge.io/vice_17.html#SEC395
    tap_v0_v1: new FileSignature('.tap', [{ value: Buffer.from('C64-TAPE-RAW') }]),
    tap_v2: new FileSignature('.tap', [{ value: Buffer.from('C16-TAPE-RAW') }]),
    // @see https://vice-emu.sourceforge.io/vice_17.html#SEC415
    x64: new FileSignature('.x64', [{ value: Buffer.from('43154164', 'hex') }]),

    // Nintendo - Nintendo 3DS
    // @see https://www.3dbrew.org/wiki/CCI
    '3ds': new FileSignature(
      '.3ds',
      [
        { offset: 0x1_00, value: Buffer.from('NCSD') },
        { offset: 0x2_00, value: Buffer.from('FFFFFFFF', 'hex') },
      ],
      CanBeTrimmed.YES,
    ),
    // @see https://www.3dbrew.org/wiki/3DSX_Format
    '3dsx': new FileSignature('.3dsx', [{ value: Buffer.from('3DSX') }]),
    // @see https://www.3dbrew.org/wiki/CIA
    // @see http://problemkaputt.de/gbatek-3ds-files-title-installation-archive-cia.htm
    cia: new FileSignature('.cia', [
      { value: Buffer.from('20200000', 'hex') }, // usual archive header size
      { offset: 0x04, value: Buffer.from('0000', 'hex') }, // type
      { offset: 0x06, value: Buffer.from('0000', 'hex') }, // version
    ]),
    // @see https://www.3dbrew.org/wiki/NCCH
    // TODO(cemmer): .cfa
    // TODO(cemmer): .cxi

    // Nintendo - Nintendo 64
    // @see http://n64dev.org/romformats.html
    n64: new FileSignature('.n64', [{ value: Buffer.from('40123780', 'hex') }]), // little endian
    v64: new FileSignature('.v64', [{ value: Buffer.from('37804012', 'hex') }]), // byte-swapped
    z64: new FileSignature('.z64', [{ value: Buffer.from('80371240', 'hex') }]), // big endian / "native"

    // Nintendo - Nintendo 64 Disk Drive
    ndd: new FileSignature('.ndd', [{ value: Buffer.from('E848D31610', 'hex') }]),

    // Nintendo - Famicom Disk System
    fds_hvc: new FileSignature('.fds', [{ value: Buffer.from('\x01*NINTENDO-HVC*') }]),
    fds: new FileSignature('.fds', [{ value: Buffer.from('FDS') }]),

    // Nintendo - Game & Watch
    gw: new FileSignature('.bin', [{ value: Buffer.from('main.bs') }]),

    // Nintendo - GameCube
    // TODO(cemmer): .fdi
    // @see https://github.com/dolphin-emu/dolphin/blob/1f5e100a0e6dd4f9ab3784fd6373d452054d08bf/Source/Core/DiscIO/CompressedBlob.h#L25 (reversed)
    gcz: new FileSignature('.gcz', [{ value: Buffer.from('01C00BB1', 'hex') }]),
    // @see https://wiki.gbatemp.net/wiki/NKit/NKitFormat
    nkit_iso: new FileSignature('.nkit.iso', [{ offset: 0x2_00, value: Buffer.from('NKIT') }]),
    // @see https://github.com/dolphin-emu/dolphin/blob/master/docs/WiaAndRvz.md
    rvz: new FileSignature('.rvz', [{ value: Buffer.from('RVZ\x01') }]),
    // TODO(cemmer): .tgc
    wia: new FileSignature('.wia', [{ value: Buffer.from('WIA\x01') }]),

    // Nintendo - Game Boy
    // @see https://gbdev.io/pandocs/The_Cartridge_Header.html
    gb: new FileSignature('.gb', [
      {
        offset: 0x01_04,
        value: Buffer.from(
          'CEED6666CC0D000B03730083000C000D0008111F8889000EDCCC6EE6DDDDD999BBBB67636E0EECCCDDDC999FBBB9333E',
          'hex',
        ),
      }, // logo
      { offset: 0x01_43, value: Buffer.from('00', 'hex') }, // non-color
    ]),

    // Nintendo - Game Boy Advance
    // @see http://problemkaputt.de/gbatek.htm#gbacartridges
    gba: new FileSignature(
      '.gba',
      [
        {
          offset: 0x04,
          value: Buffer.from(
            '24FFAE51699AA2213D84820A84E409AD11248B98C0817F21A352BE199309CE2010464A4AF82731EC58C7E83382E3CEBF85F4DF94CE4B09C194568AC01372A7FC9F844D73A3CA9A615897A327FC039876231DC7610304AE56BF38840040A70EFDFF52FE036F9530F197FBC08560D68025A963BE03014E38E2F9A234FFBB3E0344780090CB88113A9465C07C6387F03CAFD625E48B380AAC7221D4F807',
            'hex',
          ),
        }, // logo
      ],
      CanBeTrimmed.YES,
    ),

    // Nintendo - Game Boy Color
    // @see https://gbdev.io/pandocs/The_Cartridge_Header.html
    gb_dx: new FileSignature('.gbc', [
      {
        offset: 0x01_04,
        value: Buffer.from(
          'CEED6666CC0D000B03730083000C000D0008111F8889000EDCCC6EE6DDDDD999BBBB67636E0EECCCDDDC999FBBB9333E',
          'hex',
        ),
      }, // logo
      { offset: 0x01_43, value: Buffer.from('80', 'hex') }, // backwards compatible
    ]),
    gbc: new FileSignature('.gbc', [
      {
        offset: 0x01_04,
        value: Buffer.from(
          'CEED6666CC0D000B03730083000C000D0008111F8889000EDCCC6EE6DDDDD999BBBB67636E0EECCCDDDC999FBBB9333E',
          'hex',
        ),
      }, // logo
      { offset: 0x01_43, value: Buffer.from('C0', 'hex') }, // color only
    ]),

    // Nintendo - Nintendo DS (encrypted & decrypted)
    // @see http://dsibrew.org/wiki/DSi_cartridge_header
    nds: new FileSignature(
      '.nds',
      [
        {
          offset: 0xc0,
          value: Buffer.from(
            '24FFAE51699AA2213D84820A84E409AD11248B98C0817F21A352BE199309CE2010464A4AF82731EC58C7E83382E3CEBF85F4DF94CE4B09C194568AC01372A7FC9F844D73A3CA9A615897A327FC039876231DC7610304AE56BF38840040A70EFDFF52FE036F9530F197FBC08560D68025A963BE03014E38E2F9A234FFBB3E0344780090CB88113A9465C07C6387F03CAFD625E48B380AAC7221D4F807',
            'hex',
          ),
        }, // logo
        { offset: 0x1_5c, value: Buffer.from('56CF', 'hex') }, // logo checksum
      ],
      CanBeTrimmed.YES,
    ),
    dsi: new FileSignature(
      '.dsi',
      [
        { offset: 0x0_12, value: Buffer.from('03', 'hex') }, // DSi-only unitcode
        {
          offset: 0xc0,
          value: Buffer.from(
            '24FFAE51699AA2213D84820A84E409AD11248B98C0817F21A352BE199309CE2010464A4AF82731EC58C7E83382E3CEBF85F4DF94CE4B09C194568AC01372A7FC9F844D73A3CA9A615897A327FC039876231DC7610304AE56BF38840040A70EFDFF52FE036F9530F197FBC08560D68025A963BE03014E38E2F9A234FFBB3E0344780090CB88113A9465C07C6387F03CAFD625E48B380AAC7221D4F807',
            'hex',
          ),
        }, // logo
        { offset: 0x1_5c, value: Buffer.from('56CF', 'hex') }, // logo checksum
      ],
      CanBeTrimmed.YES,
    ),

    // Nintendo - Nintendo Entertainment System
    // @see https://www.nesdev.org/wiki/INES
    // @see https://www.nesdev.org/wiki/NES_2.0
    nes: new FileSignature('.nes', [{ value: Buffer.from('NES\x1A') }]),

    // Nintendo - Pokemon Mini
    // @see https://www.pokemon-mini.net/documentation/cartridge/
    min: new FileSignature('.min', [
      { offset: 0x21_a4, value: Buffer.from('NINTENDO') },
      {
        offset: 0x21_bc,
        value: Buffer.from(
          '2P\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00',
        ),
      },
    ]),

    // Nintendo - Super Nintendo Entertainment System
    // TODO(cemmer): .fig
    // @see https://snes.nesdev.org/wiki/ROM_header
    // @see https://en.wikibooks.org/wiki/Super_NES_Programming/SNES_memory_map
    smc: new FileSignature('.smc', [
      { offset: 3, value: Buffer.from('00'.repeat(509), 'hex') },
      superNintendoDynamicPiece(512),
    ]),
    sfc: new FileSignature('.sfc', [superNintendoDynamicPiece(0)]),
    // @see https://file-extension.net/seeker/file_extension_smc
    // @see https://wiki.superfamicom.org/game-doctor
    smc_gd3_1: new FileSignature('.smc', [{ value: Buffer.from('\x00\x01ME DOCTOR SF 3') }]), // Game Doctor SF3?
    smc_gd3_2: new FileSignature('.smc', [{ value: Buffer.from('GAME DOCTOR SF 3') }]), // Game Doctor SF3/SF6/SF7

    // Nintendo - Switch
    // @see https://switchbrew.org/wiki/NCA
    nca_0: new FileSignature('.nca', [{ offset: 0x2_00, value: Buffer.from('NCA0') }]),
    nca_1: new FileSignature('.nca', [{ offset: 0x2_00, value: Buffer.from('NCA1') }]),
    nca_2: new FileSignature('.nca', [{ offset: 0x2_00, value: Buffer.from('NCA2') }]),
    nca_3: new FileSignature('.nca', [{ offset: 0x2_00, value: Buffer.from('NCA3') }]),
    // @see https://github.com/nicoboss/nsz?tab=readme-ov-file#ncz
    ncz: new FileSignature('.ncz', [{ offset: 0x40_00, value: Buffer.from('NCZSECTN') }]),
    // @see https://switchbrew.org/wiki/NRO
    nro: new FileSignature('.nro', [{ offset: 0x10, value: Buffer.from('NRO0') }]),
    // @see https://switchbrew.org/wiki/NSO
    nso: new FileSignature('.nso', [{ value: Buffer.from('NSO0') }]),
    // @see https://switchbrew.org/wiki/NCA_Format#PFS0
    nsp: new FileSignature('.nsp', [{ value: Buffer.from('PFS0') }]),
    // Note: .nsz is the same signature as .nsp
    // @see https://switchbrew.org/wiki/XCI
    xci: new FileSignature('.xci', [
      { offset: 0x1_00, value: Buffer.from('HEAD') }, // magic
      { offset: 0x1_08, value: Buffer.from('FFFFFFFF', 'hex') }, // BackupAreaStartPageAddress
    ]),
    // Note: .xcz is the same signature as .xci
    // @see https://github.com/Xpl0itR/ZcaTool?tab=readme-ov-file#zca-header
    zca: new FileSignature('.zca', [{ value: Buffer.from('ZCA0') }]),

    // Nintendo - Wii
    // @see http://wiibrew.org/wiki/CCF_archive
    ccf: new FileSignature('.ccf', [{ value: Buffer.from('CCF\x00') }]),
    // @see http://wiibrew.org/wiki/VFF
    vff: new FileSignature('.vff', [{ value: Buffer.from('VFF ') }]),
    // @see http://wiibrew.org/wiki/WAD_files
    wad_installable_ib: new FileSignature('.wad', [
      { value: Buffer.from('\x00\x00\x00\x20') }, // header size
      { offset: 0x04, value: Buffer.from('ib') },
      { offset: 0x06, value: Buffer.from('\x00\x00') }, // WAD version
      { offset: 0x0c, value: Buffer.from('\x00\x00\x00\x00') }, // reserved
    ]),
    wad_installable_is: new FileSignature('.wad', [
      { value: Buffer.from('\x00\x00\x00\x20') }, // header size
      { offset: 0x04, value: Buffer.from('Is') },
      { offset: 0x06, value: Buffer.from('\x00\x00') }, // WAD version
      { offset: 0x0c, value: Buffer.from('\x00\x00\x00\x00') }, // reserved
    ]),
    wad_backup: new FileSignature('.wad', [
      { value: Buffer.from('\x00\x00\x00\x70') }, // header size
      { offset: 0x04, value: Buffer.from('Bk') },
      { offset: 0x06, value: Buffer.from('\x00\x01') }, // WAD version
      { offset: 0x6e, value: Buffer.from('\x00\x00') }, // reserved
    ]),
    // @see https://wit.wiimm.de/info/wdf.html
    wdf: new FileSignature('.wdf', [{ value: Buffer.from('WII\x01DISC') }]),

    // Nintendo - Wii U
    // @see https://gbatemp.net/threads/the-different-wiiu-games-formats-and-how-to-convert-them.449212/post-6845070
    // TODO(cemmer): .rpx
    // Note: .wua doesn't appear to have any consistent signature
    wud: new FileSignature('.wud', [{ value: Buffer.from('WUP-') }]),
    // TODO(cemmer): .wup
    // @see https://github.com/cemu-project/Cemu/blob/7522c8470ee27d50a68ba662ae721b69018f3a8f/src/Cafe/Filesystem/WUD/wud.h#L25-L26
    wux: new FileSignature('.wux', [{ value: Buffer.from('WUX0\x2E\xD0\x99\x10') }]),

    // Sega - 32X
    // @see https://github.com/jcfieldsdev/genesis-rom-utility/blob/31826bca66c8c6c467c37c1b711943eb5464e7e8/genesis_rom.chm
    // @see https://plutiedev.com/rom-header
    '32x': new FileSignature('.32x', [{ offset: 0x1_00, value: Buffer.from('SEGA 32X') }]),

    // Sega - Game Gear
    // @see https://gbatemp.net/threads/help-with-rom-iso-console-identification.611378/
    gg: new FileSignature('.gg', [{ offset: 0x7f_f0, value: Buffer.from('TMR SEGA') }]),

    // Sega - Mega Drive / Genesis
    // @see https://github.com/jcfieldsdev/genesis-rom-utility/blob/31826bca66c8c6c467c37c1b711943eb5464e7e8/genesis_rom.chm
    // @see https://plutiedev.com/rom-header
    md_1: new FileSignature('.md', [{ offset: 0x1_00, value: Buffer.from('SEGA            ') }]),
    md_2: new FileSignature('.md', [
      { offset: 0x1_00, value: Buffer.from('SEGA IS A REGISTERED') },
    ]),
    md_3: new FileSignature('.md', [
      { offset: 0x1_00, value: Buffer.from('SEGA IS A TRADEMARK ') },
    ]),
    md_4: new FileSignature('.md', [{ offset: 0x1_00, value: Buffer.from('SEGA GENESIS') }]),
    md_5: new FileSignature('.md', [{ offset: 0x1_00, value: Buffer.from(' SEGA GENESIS') }]),
    md_6: new FileSignature('.md', [{ offset: 0x1_00, value: Buffer.from('SEGA_GENESIS') }]),
    md_7: new FileSignature('.md', [{ offset: 0x1_00, value: Buffer.from('SEGA MEGADRIVE') }]),
    md_8: new FileSignature('.md', [{ offset: 0x1_00, value: Buffer.from('SEGA MEGA DRIVE') }]),
    md_9: new FileSignature('.md', [{ offset: 0x1_00, value: Buffer.from(' SEGA MEGA DRIVE') }]),
    md_10: new FileSignature('.md', [{ offset: 0x1_00, value: Buffer.from('SEGA_MEGA_DRIVE') }]),
    md_11: new FileSignature('.md', [{ offset: 0x1_00, value: Buffer.from(' SEGA_MEGA_DRIVE') }]),
    md_12: new FileSignature('.md', [{ offset: 0x1_00, value: Buffer.from('SEGASEGASEGA') }]),
    // @see https://www.romhacking.net/forum/index.php?topic=32880.msg415017#msg415017
    smd_1: new FileSignature('.smd', [{ offset: 0x2_80, value: Buffer.from('EAGNSS  ') }]),
    smd_2: new FileSignature('.smd', [{ offset: 0x2_80, value: Buffer.from('EAMG RV') }]),
    smd_3: new FileSignature('.smd', [{ offset: 0x2_80, value: Buffer.from('EAMG_RV') }]),
    smd_4: new FileSignature('.smd', [{ offset: 0x2_80, value: Buffer.from('EAMGDIE') }]),
    smd_5: new FileSignature('.smd', [{ offset: 0x2_80, value: Buffer.from('SG EEI  ') }]),

    // Sega - PICO
    // @see https://github.com/jcfieldsdev/genesis-rom-utility/blob/31826bca66c8c6c467c37c1b711943eb5464e7e8/genesis_rom.chm
    // @see https://plutiedev.com/rom-header
    pico: new FileSignature('.md', [{ offset: 0x1_00, value: Buffer.from('SEGA PICO') }]),

    // Sony - PlayStation Portable
    // @see https://www.psdevwiki.com/ps3/Eboot.PBP
    pbp: new FileSignature('.pbp', [{ value: Buffer.from('\x00PBP\x00\x00\x01\x00') }]),
  };

  static readonly SIGNATURES = Object.values(FileSignature.SIGNATURES_UNSORTED).toSorted((a, b) => {
    // 1. Prefer signatures that check a static value (to reduce processing time)
    const dynamicSigsDiff =
      (a.signaturePieces.some((signaturePiece) => signaturePiece.value !== undefined) ? 0 : 1) -
      (b.signaturePieces.some((signaturePiece) => signaturePiece.value !== undefined) ? 0 : 1);
    if (dynamicSigsDiff !== 0) {
      return dynamicSigsDiff;
    }

    // 2. Prefer signatures that check multiple parts
    const sigsCountDiff = b.signaturePieces.length - a.signaturePieces.length;
    if (sigsCountDiff !== 0) {
      return sigsCountDiff;
    }

    // 3. Prefer signatures of longer length
    return (
      b.signaturePieces.reduce(
        (sum, signaturePiece) => sum + (signaturePiece.value?.length ?? signaturePiece.length ?? 0),
        0,
      ) -
      a.signaturePieces.reduce(
        (sum, signaturePiece) => sum + (signaturePiece.value?.length ?? signaturePiece.length ?? 0),
        0,
      )
    );
  });

  private static readonly MAX_HEADER_LENGTH_BYTES = Object.values(FileSignature.SIGNATURES_UNSORTED)
    .flatMap((romSignature) => romSignature.signaturePieces)
    .reduce(
      (max, signaturePiece) =>
        Math.max(
          max,
          (signaturePiece.offset ?? 0) +
            (signaturePiece.value?.length ?? signaturePiece.length ?? 0),
        ),
      0,
    );

  private readonly extension: string;
  private readonly signaturePieces: SignaturePiece[];
  private readonly _canBeTrimmed: CanBeTrimmedValue;

  constructor(
    extension: string,
    fileSignatures: SignaturePiece[],
    canBeTrimmed: CanBeTrimmedValue = CanBeTrimmed.NO,
  ) {
    this.extension = extension;
    this.signaturePieces = fileSignatures;
    this._canBeTrimmed = canBeTrimmed;
  }

  private static async readHeaderBuffer(
    stream: Readable,
    start: number,
    end: number,
  ): Promise<Buffer> {
    const chunks: Buffer[] = [];
    let bytesRead = 0;

    for await (const chunk of stream as AsyncIterable<Buffer>) {
      if (chunk.length > 0) {
        chunks.push(chunk);
        bytesRead += chunk.length;
      }

      // Stop reading when we get enough data, trigger a 'close' event
      if (bytesRead >= end) {
        break;
      }
    }

    return Buffer.concat(chunks).subarray(start, end);
  }

  static signatureFromName(name: string): FileSignature | undefined {
    return this.SIGNATURES_UNSORTED[name];
  }

  static async signatureFromFileStream(readable: Readable): Promise<FileSignature | undefined> {
    const fileHeader = await FileSignature.readHeaderBuffer(
      readable,
      0,
      this.MAX_HEADER_LENGTH_BYTES,
    );

    for (const romSignature of this.SIGNATURES) {
      const signatureMatch = romSignature.signaturePieces.every((signaturePiece) => {
        if (signaturePiece.value === undefined) {
          return signaturePiece.match(fileHeader);
        } else {
          const signatureValue = fileHeader.subarray(
            signaturePiece.offset ?? 0,
            (signaturePiece.offset ?? 0) + signaturePiece.value.length,
          );
          return signatureValue.equals(signaturePiece.value);
        }
      });
      if (signatureMatch) {
        return romSignature;
      }
    }

    return undefined;
  }

  @Memoize()
  getName(): string {
    return Object.keys(FileSignature.SIGNATURES_UNSORTED).find(
      (name) => FileSignature.SIGNATURES_UNSORTED[name] === this,
    ) as string;
  }

  getExtension(): string {
    return this.extension;
  }

  getSignaturePieces(): SignaturePiece[] {
    return this.signaturePieces;
  }

  canBeTrimmed(): boolean {
    return this._canBeTrimmed === CanBeTrimmed.YES;
  }
}
