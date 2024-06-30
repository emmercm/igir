import { Readable } from 'node:stream';

type FileSignature = {
  offset: number,
  value: Buffer,
};

export default class ROMSignature {
  // @see https://en.wikipedia.org/wiki/List_of_file_signatures
  // @see https://www.garykessler.net/library/file_sigs.html
  // @see https://file-extension.net/seeker/
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
    // Nintendo - Nintendo Entertainment System
    new ROMSignature('.nes', [{ offset: 0, value: Buffer.from('NES') }]),
    // Nintendo - Super Nintendo Entertainment System
    new ROMSignature('.smc', [{ offset: 3, value: Buffer.from('00'.repeat(509), 'hex') }]),
    new ROMSignature('.smc', [{ offset: 0, value: Buffer.from('00014D4520444F43544F522053462033', 'hex') }]),
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
