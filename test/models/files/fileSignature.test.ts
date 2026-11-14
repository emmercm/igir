import os from 'node:os';
import path from 'node:path';

import MappableSemaphore from '../../../src/async/mappableSemaphore.js';
import FileCache from '../../../src/cache/fileCache.js';
import FileFactory from '../../../src/factories/fileFactory.js';
import type File from '../../../src/models/files/file.js';
import FileSignature from '../../../src/models/files/fileSignature.js';
import type ROMHeader from '../../../src/models/files/romHeader.js';
import Options from '../../../src/models/options.js';
import ROMScanner from '../../../src/modules/roms/romScanner.js';
import ProgressBarFake from '../../console/progressBarFake.js';

async function scan(input: string[], inputExclude: string[] = []): Promise<File[]> {
  return await new ROMScanner(
    new Options({ input, inputExclude }),
    new ProgressBarFake(),
    new FileFactory(new FileCache()),
    new MappableSemaphore(os.availableParallelism()),
  ).scan();
}

/**
 * A LoROM file behind a 512-byte Super Wild Card copier header of the given file type.
 */
function superWildcardFile(fileType: number): Buffer {
  const buffer = Buffer.alloc(512 + 0x80_00);
  buffer.writeUInt16LE(0x00_04, 0); // size, in 8 KiB blocks
  buffer.write('aabb', 8, 'hex');
  buffer.writeUInt8(fileType, 10);
  const internalHeader = 512 + 0x7f_b0;
  buffer.writeUInt8(0x20, internalHeader + 0x25); // LoROM
  buffer.writeUInt16LE(0x12_34 ^ 0xff_ff, internalHeader + 0x2c); // checksum complement
  buffer.writeUInt16LE(0x12_34, internalHeader + 0x2e); // checksum
  return buffer;
}

/**
 * A 128 KiB PC Engine ROM behind an empty copier header of the given size.
 */
function pcEngineFile(headerSize: number): Buffer {
  const buffer = Buffer.alloc(headerSize + 0x2_00_00);
  buffer.writeUInt16LE(0xe0_00, headerSize + 0x1f_fe); // reset vector
  return buffer;
}

/**
 * A 128 KiB PC Engine ROM behind a 512-byte Magic Super Griffin copier header of the given file
 * type.
 */
function magicSuperGriffinFile(fileType: number): Buffer {
  const buffer = pcEngineFile(512);
  buffer.writeUInt8(0x10, 0); // size, in 8 KiB blocks
  buffer.write('aabb', 8, 'hex');
  buffer.writeUInt8(fileType, 10);
  return buffer;
}

/**
 * A 32 KiB Master System or Game Gear ROM with the given region code behind a 512-byte Super
 * Magic Drive copier header of the given file type.
 */
function superMagicDriveSegaMasterSystemFile(fileType: number, regionCode: number): Buffer {
  const buffer = Buffer.alloc(512 + 0x80_00);
  buffer.writeUInt8(0x02, 0); // size, in 16 KiB blocks
  buffer.writeUInt8(0x01, 1); // ID code 0
  buffer.write('aabb', 8, 'hex');
  buffer.writeUInt8(fileType, 10);
  buffer.write('TMR SEGA', 512 + 0x7f_f0);
  buffer.writeUInt8((regionCode << 4) | 0x0c, 512 + 0x7f_ff); // region code, 32 KiB
  return buffer;
}

/**
 * A 16 KiB Mega Drive ROM behind a 512-byte Super Magic Drive copier header of the given file
 * type.
 */
function superMagicDriveMegaDriveFile(fileType: number): Buffer {
  const buffer = Buffer.alloc(512 + 0x40_00);
  buffer.writeUInt8(0x01, 0); // size, in 16 KiB blocks
  buffer.writeUInt8(0x03, 1); // ID code 0
  buffer.write('aabb', 8, 'hex');
  buffer.writeUInt8(fileType, 10);
  return buffer;
}

describe('getROMHeaderExtensions', () => {
  it('should return every headered extension', () => {
    expect(FileSignature.getROMHeaderExtensions()).toEqual([
      '.a78',
      '.fds',
      '.lnx',
      '.msg',
      '.nes',
      '.pce',
      '.smc',
      '.smd',
      '.swc',
    ]);
  });
});

describe('romHeaderFromFilename', () => {
  test.each([
    ['rom.a78', 128, '.a78'],
    ['rom.lnx', 64, '.lyx'],
    ['rom.lyx', 64, '.lyx'],
    ['rom.nes', 16, '.nes'],
    ['rom.fds', 16, '.fds'],
    ['rom.smc', 512, '.sfc'],
    ['rom.sfc', 512, '.sfc'],
    ['rom.msg', 512, '.pce'],
    ['rom.pce', 512, '.pce'],
    ['rom.gg', 512, '.gg'],
    ['rom.sms', 512, '.sms'],
    ['rom.zip.fds', 16, '.fds'],
  ])('should get a ROM header for: %s', (filePath, dataOffsetBytes, headerlessFileExtension) => {
    const romHeader = FileSignature.romHeaderFromFilename(filePath);
    expect([romHeader?.getDataOffsetBytes(), romHeader?.getHeaderlessFileExtension()]).toEqual([
      dataOffsetBytes,
      headerlessFileExtension,
    ]);
  });

  test.each(['', ' '.repeat(3), '.nes', 'rom.zip', 'rom.nes.zip'])(
    'should not get a ROM header for: %s',
    (filePath) => {
      expect(FileSignature.romHeaderFromFilename(filePath)).toBeUndefined();
    },
  );
});

describe('getROMHeader', () => {
  it('should get a ROM header for headered files', async () => {
    const headeredRoms = await scan([path.join('test', 'fixtures', 'roms', 'headered')]);

    const results = await Promise.all(
      headeredRoms.map(
        async (headeredRom): Promise<[string, string | undefined, ROMHeader | undefined]> => {
          const signature = FileSignature.signatureFromBuffer(
            await headeredRom.readFirstBytes(FileSignature.MAX_HEADER_LENGTH_BYTES),
            headeredRom.getSize(),
          );
          return [
            path.basename(headeredRom.getExtractedFilePath()),
            signature?.getName(),
            signature?.getROMHeader(),
          ];
        },
      ),
    );
    expect(results.toSorted((a, b) => a[0].localeCompare(b[0]))).toEqual([
      ['allpads.nes', 'nes_2', FileSignature.romHeaderFromFilename('rom.nes')],
      [
        'color_test.nintendoentertainmentsystem',
        'nes_ines',
        FileSignature.romHeaderFromFilename('rom.nes'),
      ],
      ['diagnostic_test_cartridge.a78', 'a78', FileSignature.romHeaderFromFilename('rom.a78')],
      ['fds_joypad_test.fds', 'fds', FileSignature.romHeaderFromFilename('rom.fds')],
      ['LCDTestROM.lnx', 'lnx', FileSignature.romHeaderFromFilename('rom.lnx')],
      ['speed_test_v51.smc', 'smc', FileSignature.romHeaderFromFilename('rom.smc')],
    ]);
  });

  it('should not get a ROM header for non-headered files', async () => {
    const roms = await scan(
      [path.join('test', 'fixtures', 'roms', '!(headered){,/}*')],
      [path.join('test', 'fixtures', 'roms', 'chd'), path.join('test', 'fixtures', 'roms', 'nkit')],
    );
    expect(roms.length).toBeGreaterThan(0);

    for (const rom of roms) {
      const signature = FileSignature.signatureFromBuffer(
        await rom.readFirstBytes(FileSignature.MAX_HEADER_LENGTH_BYTES),
        rom.getSize(),
      );
      expect(signature?.getROMHeader()).toBeUndefined();
    }
  });

  it.each(['smc_gd3_1', 'smc_gd3_2'])(
    'should get the SMC ROM header for Game Doctor signature: %s',
    (signatureName) => {
      expect(FileSignature.signatureFromName(signatureName)?.getROMHeader()).toBe(
        FileSignature.romHeaderFromFilename('rom.smc'),
      );
    },
  );

  it('should get the SMC ROM header for a Super Wild Card program header', () => {
    const file = superWildcardFile(0x04);
    const signature = FileSignature.signatureFromBuffer(file, file.length);
    expect([signature?.getName(), signature?.getROMHeader()]).toEqual([
      'swc',
      FileSignature.romHeaderFromFilename('rom.smc'),
    ]);
  });

  it('should not get a ROM header for a Super Wild Card SRAM header', () => {
    const file = superWildcardFile(0x05);
    const signature = FileSignature.signatureFromBuffer(file, file.length);
    expect(signature?.getROMHeader()).toBeUndefined();
  });

  it.each([11, 511])(
    'should not get a ROM header for a Super Wild Card header with reserved byte %i set',
    (offset) => {
      const file = superWildcardFile(0x04);
      file.writeUInt8(0x01, offset);
      const signature = FileSignature.signatureFromBuffer(file, file.length);
      expect(signature?.getROMHeader()).toBeUndefined();
    },
  );

  it('should get the SMC ROM header for a Super Wild Card header with Pro Fighter bytes 3-5', () => {
    const file = superWildcardFile(0x04);
    file.write('807783', 3, 'hex'); // HiROM flag, no-SRAM emulation bytes (ucon64 fig.h)
    const signature = FileSignature.signatureFromBuffer(file, file.length);
    expect([signature?.getName(), signature?.getROMHeader()]).toEqual([
      'swc',
      FileSignature.romHeaderFromFilename('rom.smc'),
    ]);
  });

  it.each([0x00, 0x01])(
    'should get the MSG ROM header for a Magic Super Griffin program header with emulation mode %i',
    (emulationMode) => {
      const file = magicSuperGriffinFile(0x02);
      file.writeUInt8(emulationMode, 1);
      const signature = FileSignature.signatureFromBuffer(file, file.length);
      expect([signature?.getName(), signature?.getROMHeader()]).toEqual([
        'pce_msg',
        FileSignature.romHeaderFromFilename('rom.msg'),
      ]);
    },
  );

  it('should get the generic PCE signature for a Magic Super Griffin SRAM header', () => {
    const file = magicSuperGriffinFile(0x03);
    const signature = FileSignature.signatureFromBuffer(file, file.length);
    expect([signature?.getName(), signature?.getROMHeader()]).toEqual([
      'pce',
      FileSignature.romHeaderFromFilename('rom.pce'),
    ]);
  });

  it('should get the generic PCE signature for a Magic Super Griffin header with an unknown emulation mode', () => {
    const file = magicSuperGriffinFile(0x02);
    file.writeUInt8(0x02, 1);
    const signature = FileSignature.signatureFromBuffer(file, file.length);
    expect([signature?.getName(), signature?.getROMHeader()]).toEqual([
      'pce',
      FileSignature.romHeaderFromFilename('rom.pce'),
    ]);
  });

  it.each([2, 7, 11, 511])(
    'should get the generic PCE signature for a Magic Super Griffin header with reserved byte %i set',
    (offset) => {
      const file = magicSuperGriffinFile(0x02);
      file.writeUInt8(0x01, offset);
      const signature = FileSignature.signatureFromBuffer(file, file.length);
      expect([signature?.getName(), signature?.getROMHeader()]).toEqual([
        'pce',
        FileSignature.romHeaderFromFilename('rom.pce'),
      ]);
    },
  );

  it('should not get a signature for a Magic Super Griffin header with a bit-swapped ROM', () => {
    const file = magicSuperGriffinFile(0x02);
    file.writeUInt16LE(0x07_00, 512 + 0x1f_fe); // bit-swapped $E000 reset vector
    expect(FileSignature.signatureFromBuffer(file, file.length)).toBeUndefined();
  });

  it('should not get a signature for a Magic Super Griffin header with trailing data', () => {
    const file = Buffer.concat([magicSuperGriffinFile(0x02), Buffer.alloc(1)]);
    expect(FileSignature.signatureFromBuffer(file, file.length)).toBeUndefined();
  });

  it.each([0x00, 0xff])(
    'should get the PCE ROM header for a copier header filled with %i',
    (fillByte) => {
      const file = pcEngineFile(512);
      file.fill(fillByte, 0, 512);
      const signature = FileSignature.signatureFromBuffer(file, file.length);
      expect([signature?.getName(), signature?.getROMHeader()]).toEqual([
        'pce',
        FileSignature.romHeaderFromFilename('rom.pce'),
      ]);
    },
  );

  it('should get the PCE ROM header from a partial read of a copier-headered file', () => {
    const file = pcEngineFile(512);
    const signature = FileSignature.signatureFromBuffer(file.subarray(0, 0x40_00), file.length);
    expect([signature?.getName(), signature?.getROMHeader()]).toEqual([
      'pce',
      FileSignature.romHeaderFromFilename('rom.pce'),
    ]);
  });

  it.each([0, 511, 513, 1024])(
    'should not get a signature for a PC Engine ROM behind a %i-byte header',
    (headerSize) => {
      const file = pcEngineFile(headerSize);
      expect(FileSignature.signatureFromBuffer(file, file.length)).toBeUndefined();
    },
  );

  it('should not get a signature for a copier-headered PC Engine file with a bit-swapped ROM', () => {
    const file = pcEngineFile(512);
    file.writeUInt16LE(0x07_00, 512 + 0x1f_fe); // bit-swapped $E000 reset vector
    expect(FileSignature.signatureFromBuffer(file, file.length)).toBeUndefined();
  });

  it('should not get a signature for a copier header with no ROM data', () => {
    const file = Buffer.alloc(512);
    expect(FileSignature.signatureFromBuffer(file, file.length)).toBeUndefined();
  });

  it.each([
    [0x3, 'sms_smd', 'rom.sms'],
    [0x4, 'sms_smd', 'rom.sms'],
    [0x5, 'gg_smd', 'rom.gg'],
    [0x6, 'gg_smd', 'rom.gg'],
    [0x7, 'gg_smd', 'rom.gg'],
  ])(
    'should get the SMD ROM header for a Super Magic Drive program header with region code %i',
    (regionCode, signatureName, headerlessFilePath) => {
      const file = superMagicDriveSegaMasterSystemFile(0x06, regionCode);
      const signature = FileSignature.signatureFromBuffer(file, file.length);
      expect([signature?.getName(), signature?.getROMHeader()]).toEqual([
        signatureName,
        FileSignature.romHeaderFromFilename(headerlessFilePath),
      ]);
    },
  );

  it('should not get a signature for a Super Magic Drive SMS/GG SRAM header', () => {
    const file = superMagicDriveSegaMasterSystemFile(0x07, 0x4);
    expect(FileSignature.signatureFromBuffer(file, file.length)).toBeUndefined();
  });

  it('should not get a signature for a Super Magic Drive SMS/GG header with trailing data', () => {
    const file = Buffer.concat([superMagicDriveSegaMasterSystemFile(0x06, 0x4), Buffer.alloc(1)]);
    expect(FileSignature.signatureFromBuffer(file, file.length)).toBeUndefined();
  });

  it.each([2, 7, 11, 511])(
    'should not get a signature for a Super Magic Drive SMS/GG header with reserved byte %i set',
    (offset) => {
      const file = superMagicDriveSegaMasterSystemFile(0x06, 0x4);
      file.writeUInt8(0x01, offset);
      expect(FileSignature.signatureFromBuffer(file, file.length)).toBeUndefined();
    },
  );

  it('should not get a signature for a Super Magic Drive SMS/GG header with an interleaved ROM', () => {
    const file = superMagicDriveSegaMasterSystemFile(0x06, 0x4);
    // Odd bytes in the first half of each 16 KiB block, even bytes in the second half
    // @see https://sourceforge.net/p/ucon64/svn/HEAD/tree/trunk/ucon64/src/backup/smd.c
    for (let blockOffset = 512; blockOffset < file.length; blockOffset += 0x40_00) {
      const block = Buffer.from(file.subarray(blockOffset, blockOffset + 0x40_00));
      for (let i = 0; i < 0x20_00; i++) {
        file.writeUInt8(block.readUInt8((i << 1) + 1), blockOffset + i);
        file.writeUInt8(block.readUInt8(i << 1), blockOffset + 0x20_00 + i);
      }
    }
    expect(FileSignature.signatureFromBuffer(file, file.length)).toBeUndefined();
  });

  it.each([0x00, 0x40])(
    'should not get a ROM header for a Super Magic Drive Mega Drive program header with split byte %i',
    (split) => {
      const file = superMagicDriveMegaDriveFile(0x06);
      file.writeUInt8(split, 2);
      const signature = FileSignature.signatureFromBuffer(file, file.length);
      expect([signature?.getName(), signature?.getROMHeader()]).toEqual(['md_smd', undefined]);
    },
  );

  it('should not get a signature for a Super Magic Drive Mega Drive SRAM header', () => {
    const file = superMagicDriveMegaDriveFile(0x07);
    expect(FileSignature.signatureFromBuffer(file, file.length)).toBeUndefined();
  });

  it.each([
    [2, 0x01],
    [3, 0x01],
    [7, 0x01],
    [11, 0x01],
    [511, 0x01],
  ])(
    'should not get a signature for a Super Magic Drive Mega Drive header with byte %i set to %i',
    (offset, value) => {
      const file = superMagicDriveMegaDriveFile(0x06);
      file.writeUInt8(value, offset);
      expect(FileSignature.signatureFromBuffer(file, file.length)).toBeUndefined();
    },
  );
});
