export interface IZip64ExtendedInformation {
  uncompressedSize?: number;
  compressedSize?: number;
  localFileHeaderRelativeOffset?: number;
  fileDiskStart?: number;
}

export default {
  parseExtraFields: (buffer: Buffer<ArrayBuffer>): Map<number, Buffer<ArrayBuffer>> => {
    if (buffer.length === 0) {
      return new Map();
    }

    const extraFields = new Map<number, Buffer<ArrayBuffer>>();
    let position = 0;
    while (position < buffer.length - 3) {
      const headerId = buffer.readUInt16LE(position);
      const dataSize = buffer.readUInt16LE(position + 2);
      extraFields.set(headerId, buffer.subarray(position + 4, position + 4 + dataSize));
      position += 4 + dataSize;
    }
    return extraFields;
  },

  parseZip64ExtendedInformation: (
    buffer: Buffer<ArrayBuffer> | undefined,
    originalUncompressedSize: number,
    originalCompressedSize: number,
    originalLocalFileHeaderRelativeOffset: number,
    originalFileDiskStart: number,
  ): IZip64ExtendedInformation | undefined => {
    if (buffer === undefined || buffer.length === 0) {
      return undefined;
    }

    const extendedInformation: IZip64ExtendedInformation = {};

    let position = 0;
    if (originalUncompressedSize === 0xff_ff_ff_ff) {
      extendedInformation.uncompressedSize = Number(buffer.readBigUInt64LE(position));
      position += 8;
    }
    if (originalCompressedSize === 0xff_ff_ff_ff) {
      extendedInformation.compressedSize = Number(buffer.readBigUInt64LE(position));
      position += 8;
    }
    if (originalLocalFileHeaderRelativeOffset === 0xff_ff_ff_ff) {
      extendedInformation.localFileHeaderRelativeOffset = Number(buffer.readBigUInt64LE(position));
      position += 8;
    }
    if (originalFileDiskStart == 0xff_ff) {
      extendedInformation.fileDiskStart = buffer.readUInt32LE(position);
    }

    return extendedInformation;
  },
};
