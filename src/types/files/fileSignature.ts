import { Readable } from 'node:stream';

import { Memoize } from 'typescript-memoize';

type SignaturePiece = {
  offset?: number;
  value: Buffer;
};

export default class FileSignature {
  // @see https://en.wikipedia.org/wiki/List_of_file_signatures
  // @see https://www.garykessler.net/library/file_sigs.html
  // @see https://file-extension.net/seeker/
  // @see https://gbatemp.net/threads/help-with-rom-iso-console-identification.611378/
  private static readonly SIGNATURES: { [key: string]: FileSignature } = {
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

    // Atari - 7800
    a78: new FileSignature('.a78', [
      { offset: 1, value: Buffer.from('ATARI7800') },
      { offset: 0x64, value: Buffer.from('ACTUAL CART DATA STARTS HERE') },
    ]),

    // Atari - Lynx
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
    // TODO(cemmer): .3ds/.cci
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
    z64: new FileSignature('.z64', [{ value: Buffer.from('80371240', 'hex') }]), // native

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
    rvz: new FileSignature('.rvz', [{ value: Buffer.from('RVZ\x01') }]), // "RVZ\x01"
    // TODO(cemmer): .tgc
    wia: new FileSignature('.wia', [{ value: Buffer.from('WIA\x01') }]), // "WIA\x01"

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
    gba: new FileSignature('.gba', [
      {
        offset: 0x04,
        value: Buffer.from(
          '24FFAE51699AA2213D84820A84E409AD11248B98C0817F21A352BE199309CE2010464A4AF82731EC58C7E83382E3CEBF85F4DF94CE4B09C194568AC01372A7FC9F844D73A3CA9A615897A327FC039876231DC7610304AE56BF38840040A70EFDFF52FE036F9530F197FBC08560D68025A963BE03014E38E2F9A234FFBB3E0344780090CB88113A9465C07C6387F03CAFD625E48B380AAC7221D4F807',
          'hex',
        ),
      },
    ]), // logo

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
    nds: new FileSignature('.nds', [
      {
        offset: 0xc0,
        value: Buffer.from(
          '24FFAE51699AA2213D84820A84E409AD11248B98C0817F21A352BE199309CE2010464A4AF82731EC58C7E83382E3CEBF85F4DF94CE4B09C194568AC01372A7FC9F844D73A3CA9A615897A327FC039876231DC7610304AE56BF38840040A70EFDFF52FE036F9530F197FBC08560D68025A963BE03014E38E2F9A234FFBB3E0344780090CB88113A9465C07C6387F03CAFD625E48B380AAC7221D4F807',
        ),
      }, // logo
      { offset: 0x1_5c, value: Buffer.from('56CF', 'hex') }, // logo checksum
    ]),

    // Nintendo - Nintendo Entertainment System
    // @see https://www.nesdev.org/wiki/INES
    // @see https://www.nesdev.org/wiki/NES_2.0
    nes: new FileSignature('.nes', [{ value: Buffer.from('NES\x1A') }]),

    // Nintendo - Super Nintendo Entertainment System
    // @see https://snes.nesdev.org/wiki/ROM_header
    // @see https://en.wikibooks.org/wiki/Super_NES_Programming/SNES_memory_map
    // TODO(cemmer): add checks from LoROM, HiROM, etc.
    smc: new FileSignature('.smc', [{ offset: 3, value: Buffer.from('00'.repeat(509), 'hex') }]),
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

  private static readonly SIGNATURES_SORTED = Object.values(FileSignature.SIGNATURES).sort(
    (a, b) => {
      // 1. Prefer files that check multiple signatures
      const sigsCountDiff = b.fileSignatures.length - a.fileSignatures.length;
      if (sigsCountDiff !== 0) {
        return sigsCountDiff;
      }

      // 2. Prefer signatures of longer length
      return (
        b.fileSignatures.reduce((sum, sig) => sum + sig.value.length, 0) -
        a.fileSignatures.reduce((sum, sig) => sum + sig.value.length, 0)
      );
    },
  );

  private static readonly MAX_HEADER_LENGTH_BYTES = Object.values(FileSignature.SIGNATURES)
    .flatMap((romSignature) => romSignature.fileSignatures)
    .reduce(
      (max, fileSignature) =>
        Math.max(max, (fileSignature.offset ?? 0) + fileSignature.value.length),
      0,
    );

  private readonly extension: string;

  private readonly fileSignatures: SignaturePiece[];

  constructor(extension: string, fileSignatures: SignaturePiece[]) {
    this.extension = extension;
    this.fileSignatures = fileSignatures;
  }

  static getKnownSignatureCount(): number {
    return this.SIGNATURES_SORTED.length;
  }

  private static async readHeaderBuffer(
    stream: Readable,
    start: number,
    end: number,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      stream.resume();

      const chunks: Buffer[] = [];
      const resolveHeader: () => void = () => {
        const header = Buffer.concat(chunks).subarray(start, end);
        resolve(header);
      };

      stream.on('data', (chunk: Buffer) => {
        chunks.push(chunk);

        // Stop reading when we get enough data, trigger a 'close' event
        if (chunks.reduce((sum, buff) => sum + buff.length, 0) >= end) {
          resolveHeader();
          // WARN(cemmer): whatever created the stream may need to drain it!
        }
      });

      stream.on('end', resolveHeader);
      stream.on('error', reject);
    });
  }

  static signatureFromName(name: string): FileSignature | undefined {
    return this.SIGNATURES[name];
  }

  static async signatureFromFileStream(stream: Readable): Promise<FileSignature | undefined> {
    const fileHeader = await FileSignature.readHeaderBuffer(
      stream,
      0,
      this.MAX_HEADER_LENGTH_BYTES,
    );

    for (const romSignature of this.SIGNATURES_SORTED) {
      const signatureMatch = romSignature.fileSignatures.every((fileSignature) => {
        const signatureValue = fileHeader.subarray(
          fileSignature.offset ?? 0,
          (fileSignature.offset ?? 0) + fileSignature.value.length,
        );
        return signatureValue.equals(fileSignature.value);
      });
      if (signatureMatch) {
        return romSignature;
      }
    }

    return undefined;
  }

  @Memoize()
  getName(): string {
    return Object.keys(FileSignature.SIGNATURES).find(
      (name) => FileSignature.SIGNATURES[name] === this,
    ) as string;
  }

  getExtension(): string {
    return this.extension;
  }
}
