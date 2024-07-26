import { Readable } from 'node:stream';

import { Memoize } from 'typescript-memoize';

type SignaturePiece = {
  offset?: number,
  value: Buffer,
};

export default class FileSignature {
  // @see https://en.wikipedia.org/wiki/List_of_file_signatures
  // @see https://www.garykessler.net/library/file_sigs.html
  // @see https://file-extension.net/seeker/
  // @see https://gbatemp.net/threads/help-with-rom-iso-console-identification.611378/
  private static readonly SIGNATURES: { [key: string]: FileSignature } = {
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

    // @see https://docs.fileformat.com/disc-and-media/cso/
    cso: new FileSignature('.cso', [{ value: Buffer.from('CISO') }]),

    // @see https://en.wikipedia.org/wiki/List_of_file_signatures
    isz: new FileSignature('.isz', [{ value: Buffer.from('IsZ!') }]),

    // @see https://docs.fileformat.com/disc-and-media/cso/
    zso: new FileSignature('.zso', [{ value: Buffer.from('ZISO') }]),

    // ********** ROMs - SPECIFIC **********

    // Atari - 7800
    a78: new FileSignature('.a78', [{ offset: 1, value: Buffer.from('ATARI7800') }]),

    // Atari - Lynx
    lnx: new FileSignature('.lnx', [{ value: Buffer.from('LYNX') }]),

    // Nintendo - Nintendo 3DS
    '3dsx': new FileSignature('.3dsx', [{ value: Buffer.from('3DSX') }]),

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

    // Nintendo - Game Boy
    // @see https://gbdev.io/pandocs/The_Cartridge_Header.html
    gb: new FileSignature('.gb', [
      { offset: 0x01_04, value: Buffer.from('CEED6666CC0D000B03730083000C000D0008111F8889000EDCCC6EE6DDDDD999BBBB67636E0EECCCDDDC999FBBB9333E', 'hex') }, // logo
      { offset: 0x01_43, value: Buffer.from('00', 'hex') }, // non-color
    ]),

    // Nintendo - Game Boy Advance
    // @see http://problemkaputt.de/gbatek.htm#gbacartridges
    gba: new FileSignature('.gba', [{ offset: 0x04, value: Buffer.from('24FFAE51699AA2213D84820A84E409AD11248B98C0817F21A352BE199309CE2010464A4AF82731EC58C7E83382E3CEBF85F4DF94CE4B09C194568AC01372A7FC9F844D73A3CA9A615897A327FC039876231DC7610304AE56BF38840040A70EFDFF52FE036F9530F197FBC08560D68025A963BE03014E38E2F9A234FFBB3E0344780090CB88113A9465C07C6387F03CAFD625E48B380AAC7221D4F807', 'hex') }]), // logo

    // Nintendo - Game Boy Color
    // @see https://gbdev.io/pandocs/The_Cartridge_Header.html
    gb_dx: new FileSignature('.gbc', [
      { offset: 0x01_04, value: Buffer.from('CEED6666CC0D000B03730083000C000D0008111F8889000EDCCC6EE6DDDDD999BBBB67636E0EECCCDDDC999FBBB9333E', 'hex') }, // logo
      { offset: 0x01_43, value: Buffer.from('80', 'hex') }, // backwards compatible
    ]),
    gbc: new FileSignature('.gbc', [
      { offset: 0x01_04, value: Buffer.from('CEED6666CC0D000B03730083000C000D0008111F8889000EDCCC6EE6DDDDD999BBBB67636E0EECCCDDDC999FBBB9333E', 'hex') }, // logo
      { offset: 0x01_43, value: Buffer.from('C0', 'hex') }, // color only
    ]),

    // Nintendo - Nintendo DS (Decrypted)
    // @see http://dsibrew.org/wiki/DSi_cartridge_header
    nds: new FileSignature('.nds', [
      { offset: 0xC0, value: Buffer.from('24FFAE51699AA2213D84820A84E409AD11248B98C0817F21A352BE199309CE2010464A4AF82731EC58C7E83382E3CEBF85F4DF94CE4B09C194568AC01372A7FC9F844D73A3CA9A615897A327FC039876231DC7610304AE56BF38840040A70EFDFF52FE036F9530F197FBC08560D68025A963BE03014E38E2F9A234FFBB3E0344780090CB88113A9465C07C6387F03CAFD625E48B380AAC7221D4F807') }, // logo
      { offset: 0x1_5C, value: Buffer.from('56CF', 'hex') }, // logo checksum
    ]),

    // Nintendo - Nintendo Entertainment System
    nes: new FileSignature('.nes', [{ value: Buffer.from('NES') }]),

    // Nintendo - Super Nintendo Entertainment System
    // @see https://snes.nesdev.org/wiki/ROM_header
    // @see https://en.wikibooks.org/wiki/Super_NES_Programming/SNES_memory_map
    // TODO(cemmer): add checks from LoROM, HiROM, etc.
    smc: new FileSignature('.smc', [{ offset: 3, value: Buffer.from('00'.repeat(509), 'hex') }]),
    // @see https://file-extension.net/seeker/file_extension_smc
    // @see https://wiki.superfamicom.org/game-doctor
    smc_gd3_1: new FileSignature('.smc', [{ value: Buffer.from('\x00\x01ME DOCTOR SF 3') }]), // Game Doctor SF3?
    smc_gd3_2: new FileSignature('.smc', [{ value: Buffer.from('GAME DOCTOR SF 3') }]), // Game Doctor SF3/SF6/SF7

    // Sega - 32X
    // @see https://github.com/jcfieldsdev/genesis-rom-utility/blob/31826bca66c8c6c467c37c1b711943eb5464e7e8/genesis_rom.chm
    // @see https://plutiedev.com/rom-header
    '32x': new FileSignature('.32x', [{ offset: 0x1_00, value: Buffer.from('SEGA 32X') }]),

    // Sega - Game Gear
    // @see https://gbatemp.net/threads/help-with-rom-iso-console-identification.611378/
    gg: new FileSignature('.gg', [{ offset: 0x7F_F0, value: Buffer.from('TMR SEGA') }]),

    // Sega - Mega Drive / Genesis
    // @see https://github.com/jcfieldsdev/genesis-rom-utility/blob/31826bca66c8c6c467c37c1b711943eb5464e7e8/genesis_rom.chm
    // @see https://plutiedev.com/rom-header
    md_1: new FileSignature('.md', [{ offset: 0x1_00, value: Buffer.from('SEGA            ') }]),
    md_2: new FileSignature('.md', [{ offset: 0x1_00, value: Buffer.from('SEGA IS A REGISTERED') }]),
    md_3: new FileSignature('.md', [{ offset: 0x1_00, value: Buffer.from('SEGA IS A TRADEMARK ') }]),
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
    pbp: new FileSignature('.pbp', [{ value: Buffer.from('\x00PBP\x00\x00\x01\x00') }]),
  };

  private static readonly SIGNATURES_SORTED = Object.values(FileSignature.SIGNATURES)
    .sort((a, b) => {
      // 1. Prefer files that check multiple signatures
      const sigsCountDiff = b.fileSignatures.length - a.fileSignatures.length;
      if (sigsCountDiff !== 0) {
        return sigsCountDiff;
      }

      // 2. Prefer signatures of longer length
      return b.fileSignatures.reduce((sum, sig) => sum + sig.value.length, 0)
        - a.fileSignatures.reduce((sum, sig) => sum + sig.value.length, 0);
    });

  private static readonly MAX_HEADER_LENGTH_BYTES = Object.values(FileSignature.SIGNATURES)
    .flatMap((romSignature) => romSignature.fileSignatures)
    .reduce((max, fileSignature) => Math.max(
      max,
      (fileSignature.offset ?? 0) + fileSignature.value.length,
    ), 0);

  private readonly extension: string;

  private readonly fileSignatures: SignaturePiece[];

  constructor(
    extension: string,
    fileSignatures: SignaturePiece[],
  ) {
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
        const header = Buffer.concat(chunks)
          .subarray(start, end);
        resolve(header);
      };

      stream.on('data', (chunk) => {
        chunks.push(Buffer.from(chunk));

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
    const fileHeader = await FileSignature
      .readHeaderBuffer(stream, 0, this.MAX_HEADER_LENGTH_BYTES);

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
    return Object.keys(FileSignature.SIGNATURES)
      .find((name) => FileSignature.SIGNATURES[name] === this) as string;
  }

  getExtension(): string {
    return this.extension;
  }
}
