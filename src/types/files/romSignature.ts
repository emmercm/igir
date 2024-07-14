import { Readable } from 'node:stream';

import ArrayPoly from '../../polyfill/arrayPoly.js';

type FileSignature = {
  offset: number,
  value: Buffer,
};

export default class ROMSignature {
  // @see https://en.wikipedia.org/wiki/List_of_file_signatures
  // @see https://www.garykessler.net/library/file_sigs.html
  // @see https://file-extension.net/seeker/
  // @see https://gbatemp.net/threads/help-with-rom-iso-console-identification.611378/
  private static readonly SIGNATURES = [
    // Atari - 7800
    new ROMSignature('.a78', [{ offset: 1, value: Buffer.from('415441524937383030', 'hex') }]),

    // Atari - Lynx
    new ROMSignature('.lnx', [{ offset: 0, value: Buffer.from('4C594E58', 'hex') }]),

    // Nintendo - Nintendo 3DS
    new ROMSignature('.3dsx', [{ offset: 0, value: Buffer.from('33445358', 'hex') }]),

    // Nintendo - Nintendo 64
    // @see http://n64dev.org/romformats.html
    new ROMSignature('.n64', [{ offset: 0, value: Buffer.from('40123780', 'hex') }]), // little endian
    new ROMSignature('.v64', [{ offset: 0, value: Buffer.from('37804012', 'hex') }]), // byte-swapped
    new ROMSignature('.z64', [{ offset: 0, value: Buffer.from('80371240', 'hex') }]), // native

    // Nintendo - Nintendo 64 Disk Drive
    new ROMSignature('.ndd', [{ offset: 0, value: Buffer.from('E848D31610', 'hex') }]),

    // Nintendo - Famicom Disk System
    new ROMSignature('.fds', [{ offset: 0, value: Buffer.from('012A4E494E54454E444F2D4856432A', 'hex') }]),
    new ROMSignature('.fds', [{ offset: 0, value: Buffer.from('464453', 'hex') }]),

    // Nintendo - Game & Watch
    new ROMSignature('.bin', [{ offset: 0, value: Buffer.from('main.bs') }]),

    // Nintendo - Game Boy
    // @see https://gbdev.io/pandocs/The_Cartridge_Header.html
    new ROMSignature('.gb', [
      { offset: 0x01_04, value: Buffer.from('CEED6666CC0D000B03730083000C000D0008111F8889000EDCCC6EE6DDDDD999BBBB67636E0EECCCDDDC999FBBB9333E', 'hex') }, // logo
      { offset: 0x01_43, value: Buffer.from('00', 'hex') }, // non-color
    ]),

    // Nintendo - Game Boy Advance
    // @see http://problemkaputt.de/gbatek.htm#gbacartridges
    new ROMSignature('.gba', [{ offset: 0x04, value: Buffer.from('24FFAE51699AA2213D84820A84E409AD11248B98C0817F21A352BE199309CE2010464A4AF82731EC58C7E83382E3CEBF85F4DF94CE4B09C194568AC01372A7FC9F844D73A3CA9A615897A327FC039876231DC7610304AE56BF38840040A70EFDFF52FE036F9530F197FBC08560D68025A963BE03014E38E2F9A234FFBB3E0344780090CB88113A9465C07C6387F03CAFD625E48B380AAC7221D4F807', 'hex') }]), // logo

    // Nintendo - Game Boy Color
    // @see https://gbdev.io/pandocs/The_Cartridge_Header.html
    new ROMSignature('.gbc', [
      { offset: 0x01_04, value: Buffer.from('CEED6666CC0D000B03730083000C000D0008111F8889000EDCCC6EE6DDDDD999BBBB67636E0EECCCDDDC999FBBB9333E', 'hex') }, // logo
      { offset: 0x01_43, value: Buffer.from('80', 'hex') }, // backwards compatible
    ]),
    new ROMSignature('.gbc', [
      { offset: 0x01_04, value: Buffer.from('CEED6666CC0D000B03730083000C000D0008111F8889000EDCCC6EE6DDDDD999BBBB67636E0EECCCDDDC999FBBB9333E', 'hex') }, // logo
      { offset: 0x01_43, value: Buffer.from('C0', 'hex') }, // color only
    ]),

    // Nintendo - Nintendo DS (Decrypted)
    // @see http://dsibrew.org/wiki/DSi_cartridge_header
    new ROMSignature('.nds', [
      { offset: 0xC0, value: Buffer.from('24FFAE51699AA2213D84820A84E409AD11248B98C0817F21A352BE199309CE2010464A4AF82731EC58C7E83382E3CEBF85F4DF94CE4B09C194568AC01372A7FC9F844D73A3CA9A615897A327FC039876231DC7610304AE56BF38840040A70EFDFF52FE036F9530F197FBC08560D68025A963BE03014E38E2F9A234FFBB3E0344780090CB88113A9465C07C6387F03CAFD625E48B380AAC7221D4F807') }, // logo
      { offset: 0x1_5C, value: Buffer.from('56CF', 'hex') }, // logo checksum
    ]),

    // Nintendo - Nintendo Entertainment System
    new ROMSignature('.nes', [{ offset: 0, value: Buffer.from('NES') }]),

    // Nintendo - Super Nintendo Entertainment System
    // @see https://snes.nesdev.org/wiki/ROM_header
    // @see https://en.wikibooks.org/wiki/Super_NES_Programming/SNES_memory_map
    // TODO(cemmer): add checks from LoROM, HiROM, etc.
    new ROMSignature('.smc', [{ offset: 3, value: Buffer.from('00'.repeat(509), 'hex') }]),
    // @see https://file-extension.net/seeker/file_extension_smc
    // @see https://wiki.superfamicom.org/game-doctor
    new ROMSignature('.smc', [{ offset: 0, value: Buffer.from('00014D4520444F43544F522053462033', 'hex') }]), // Game Doctor SF3?
    new ROMSignature('.smc', [{ offset: 0, value: Buffer.from('GAME DOCTOR SF 3') }]), // Game Doctor SF3/SF6/SF7

    // Sega - 32X
    // @see https://github.com/jcfieldsdev/genesis-rom-utility/blob/31826bca66c8c6c467c37c1b711943eb5464e7e8/genesis_rom.chm
    // @see https://plutiedev.com/rom-header
    new ROMSignature('.32x', [{ offset: 0x1_00, value: Buffer.from('SEGA 32X') }]),

    // Sega - Game Gear
    // @see https://gbatemp.net/threads/help-with-rom-iso-console-identification.611378/
    new ROMSignature('.gg', [{ offset: 0x7F_F0, value: Buffer.from('TMR SEGA') }]),

    // Sega - Mega Drive / Genesis
    // @see https://github.com/jcfieldsdev/genesis-rom-utility/blob/31826bca66c8c6c467c37c1b711943eb5464e7e8/genesis_rom.chm
    // @see https://plutiedev.com/rom-header
    new ROMSignature('.md', [{ offset: 0x1_00, value: Buffer.from('SEGA            ') }]),
    new ROMSignature('.md', [{ offset: 0x1_00, value: Buffer.from('SEGA IS A REGISTERED') }]),
    new ROMSignature('.md', [{ offset: 0x1_00, value: Buffer.from('SEGA IS A TRADEMARK ') }]),
    new ROMSignature('.md', [{ offset: 0x1_00, value: Buffer.from('SEGA GENESIS') }]),
    new ROMSignature('.md', [{ offset: 0x1_00, value: Buffer.from(' SEGA GENESIS') }]),
    new ROMSignature('.md', [{ offset: 0x1_00, value: Buffer.from('SEGA_GENESIS') }]),
    new ROMSignature('.md', [{ offset: 0x1_00, value: Buffer.from('SEGA MEGADRIVE') }]),
    new ROMSignature('.md', [{ offset: 0x1_00, value: Buffer.from('SEGA MEGA DRIVE') }]),
    new ROMSignature('.md', [{ offset: 0x1_00, value: Buffer.from(' SEGA MEGA DRIVE') }]),
    new ROMSignature('.md', [{ offset: 0x1_00, value: Buffer.from('SEGA_MEGA_DRIVE') }]),
    new ROMSignature('.md', [{ offset: 0x1_00, value: Buffer.from(' SEGA_MEGA_DRIVE') }]),
    new ROMSignature('.md', [{ offset: 0x1_00, value: Buffer.from('SEGASEGASEGA') }]),
    // @see https://www.romhacking.net/forum/index.php?topic=32880.msg415017#msg415017
    new ROMSignature('.smd', [{ offset: 0x2_80, value: Buffer.from('EAGNSS  ') }]),
    new ROMSignature('.smd', [{ offset: 0x2_80, value: Buffer.from('EAMG RV') }]),
    new ROMSignature('.smd', [{ offset: 0x2_80, value: Buffer.from('EAMG_RV') }]),
    new ROMSignature('.smd', [{ offset: 0x2_80, value: Buffer.from('EAMGDIE') }]),
    new ROMSignature('.smd', [{ offset: 0x2_80, value: Buffer.from('SG EEI  ') }]),

    // Sega - PICO
    // @see https://github.com/jcfieldsdev/genesis-rom-utility/blob/31826bca66c8c6c467c37c1b711943eb5464e7e8/genesis_rom.chm
    // @see https://plutiedev.com/rom-header
    new ROMSignature('.md', [{ offset: 0x1_00, value: Buffer.from('SEGA PICO') }]),

    // Sony - PlayStation Portable
    new ROMSignature('pbp', [{ offset: 0, value: Buffer.from('0050425000000100', 'hex') }]),
  ];

  private static readonly MAX_HEADER_LENGTH_BYTES = Object.values(ROMSignature.SIGNATURES)
    .flatMap((romSignature) => romSignature.fileSignatures)
    .reduce((max, fileSignature) => Math.max(
      max,
      fileSignature.offset + fileSignature.value.length,
    ), 0);

  private readonly extension: string;

  private readonly fileSignatures: FileSignature[];

  constructor(
    extension: string,
    fileSignatures: FileSignature[],
  ) {
    this.extension = extension;
    this.fileSignatures = fileSignatures;
  }

  static getSupportedExtensions(): string[] {
    return Object.values(this.SIGNATURES)
      .map((signature) => signature.extension)
      .reduce(ArrayPoly.reduceUnique(), [])
      .sort();
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

  static async signatureFromFileStream(stream: Readable): Promise<ROMSignature | undefined> {
    const fileHeader = await ROMSignature.readHeaderBuffer(stream, 0, this.MAX_HEADER_LENGTH_BYTES);

    for (const romSignature of this.SIGNATURES) {
      const signatureMatch = romSignature.fileSignatures.every((fileSignature) => {
        const signatureValue = fileHeader.subarray(
          fileSignature.offset,
          fileSignature.offset + fileSignature.value.length,
        );
        return signatureValue.equals(fileSignature.value);
      });
      if (signatureMatch) {
        return romSignature;
      }
    }

    return undefined;
  }

  getExtension(): string {
    return this.extension;
  }
}
