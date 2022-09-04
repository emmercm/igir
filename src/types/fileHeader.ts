export default class FileHeader {
  private static readonly HEADERS: { [key: string]:FileHeader } = {
    // http://7800.8bitdev.org/index.php/A78_Header_Specification
    'No-Intro_A7800.xml': new FileHeader(1, '41544152493738303000000000000000', 64, '.a78'),

    // https://atarigamer.com/lynx/lnxhdrgen
    'No-Intro_LNX.xml': new FileHeader(0, '4C594E58', 64, '.lnx'),

    // https://www.nesdev.org/wiki/INES
    'No-Intro_NES.xml': new FileHeader(0, '4E45531A', 16, '.nes'),

    // https://www.nesdev.org/wiki/FDS_file_format
    'No-Intro_FDS.xml': new FileHeader(0, '4644531A', 16, '.fds'),
  };

  private static readonly MAX_HEADER_SIZE_BYTES = Object.values(FileHeader.HEADERS)
    .reduce((max, val) => Math.max(max, val.headerValue.length / 2), 0);

  readonly headerOffsetBytes: number;

  readonly headerValue: string;

  readonly dataOffsetBytes: number;

  readonly fileExtension: string;

  private constructor(
    headerOffset: number,
    headerValue: string,
    dataOffset: number,
    fileExtension: string,
  ) {
    this.headerOffsetBytes = headerOffset;
    this.headerValue = headerValue;
    this.dataOffsetBytes = dataOffset;
    this.fileExtension = fileExtension;
  }

  static getByName(headerName: string): FileHeader | undefined {
    return this.HEADERS[headerName];
  }

  static getByExtension(extension: string): FileHeader | undefined {
    const headers = Object.values(this.HEADERS);
    for (let i = 0; i < headers.length; i += 1) {
      const header = headers[i];
      if (header.fileExtension.toLowerCase() === extension.toLowerCase()) {
        return header;
      }
    }
    return undefined;
  }
}
