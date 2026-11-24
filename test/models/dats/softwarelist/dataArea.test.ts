import assert from 'node:assert';

import DATObject from '../../../../src/models/dats/datObject.js';
import ROM from '../../../../src/models/dats/rom.js';
import SoftwareListDAT from '../../../../src/models/dats/softwarelist/softwareListDat.js';

// From MAME 0.289's hash/a7800.xml: the file is the named entry's 0x20000 bytes plus the 0x4000
// that loadflag="continue" loads, and its checksums are of all 0x24000
const xml = `<?xml version="1.0"?>
<softwarelist name="a7800" description="Atari 7800 cartridges">
  <software name="dkongxmcc">
    <description>Donkey Kong XM (Final Demo)</description>
    <part name="cart" interface="a7800_cart">
      <dataarea name="rom" size="0x24000">
        <rom name="dkxm_final_demo.bin" size="0x20000" crc="fd503bd4" sha1="454d754a0c4603323e476d9418f343a6a1a0d017" offset="0x4000" />
        <rom size="0x4000" offset="0" loadflag="continue" />
      </dataarea>
    </part>
  </software>
  <software name="ballblaz">
    <description>Ballblazer</description>
    <part name="cart" interface="a7800_cart">
      <dataarea name="rom" size="0x8000">
        <rom name="ballblazer (usa).bin" size="0x4000" crc="8d6e7e5b" sha1="d5da37e3c1d6a7e1cd2a0edcbb0db2e0c6e56f3f" offset="0x0000"/>
        <rom size="0x4000" offset="0x4000" loadflag="reload"/>
        <rom size="0x8000" offset="0" loadflag="fill" value="0xff"/>
      </dataarea>
    </part>
  </software>
  <software name="ignored">
    <description>Ignore</description>
    <part name="cart" interface="a7800_cart">
      <dataarea name="rom" size="0x1000">
        <rom name="first.bin" size="0x800" crc="00000001" offset="0"/>
        <rom size="0x800" loadflag="ignore"/>
        <rom name="second.bin" size="0x800" crc="00000002" offset="0x800"/>
      </dataarea>
    </part>
  </software>
</softwarelist>`;

describe('getRoms', () => {
  const games = SoftwareListDAT.fromObject(
    DATObject.fromXmlString(xml).softwarelist ?? {},
  ).getGames();

  it('should add the size a continue entry loads to the file before it', () => {
    const game = games.at(0);
    assert.ok(game !== undefined);
    const roms = game.getRoms();
    expect(roms).toHaveLength(1);
    const rom = roms.at(0);
    assert.ok(rom !== undefined);
    expect(rom).toBeInstanceOf(ROM);
    expect([rom.getName(), rom.getSize(), rom.getCrc32()]).toEqual([
      'dkxm_final_demo.bin',
      0x2_40_00,
      'fd503bd4',
    ]);
  });

  it('should leave out reload and fill entries, which add nothing to the file', () => {
    expect(
      games
        .at(1)
        ?.getRoms()
        .map((rom) => [rom.getName(), rom.getSize()]),
    ).toEqual([['ballblazer (usa).bin', 0x40_00]]);
  });

  it('should add an ignore entry only to the file before it', () => {
    expect(
      games
        .at(2)
        ?.getRoms()
        .map((rom) => [rom.getName(), rom.getSize()]),
    ).toEqual([
      ['first.bin', 0x10_00],
      ['second.bin', 0x8_00],
    ]);
  });
});

describe('fromObject', () => {
  const sized = (rom: object[]): [string, number][] =>
    SoftwareListDAT.fromObject({
      name: 'sized',
      software: { name: 'sized', part: { dataarea: { rom } } },
    })
      .getGames()
      .flatMap((game) => game.getRoms())
      .map((r) => [r.getName(), r.getSize()]);

  it('should take the longest run when a reload restarts the file, as rom_file_size() does', () => {
    expect(
      sized([
        { name: 'cart.bin', size: '0x1000', crc: '12345678' },
        { size: '0x1000', loadflag: 'reload' },
        { size: '0x800', loadflag: 'continue' },
      ]),
    ).toEqual([['cart.bin', 0x18_00]]);
  });

  it('should read a leading 0 as octal, stopping at an 8 or 9, as strtol() does', () => {
    expect(
      sized([
        { name: 'cart.bin', size: '0x1000', crc: '12345678' },
        { size: '09', loadflag: 'continue' },
      ]),
    ).toEqual([['cart.bin', 0x10_00]]);
  });

  it('should read a size MAME can not parse as 0, as strtol() does', () => {
    expect(
      sized([
        { name: 'cart.bin', size: '0x1000', crc: '12345678' },
        { size: 'unknown', loadflag: 'continue' },
      ]),
    ).toEqual([['cart.bin', 0x10_00]]);
  });

  it('should add only the continue entries straight after a file, as rom_file_size() does', () => {
    const roms = SoftwareListDAT.fromObject({
      name: 'interrupted',
      software: {
        name: 'interrupted',
        part: {
          dataarea: {
            rom: [
              { name: 'cart.bin', size: '0x1000', crc: '12345678' },
              { size: '0x1000', loadflag: 'fill' },
              { size: '0x800', loadflag: 'continue' },
            ],
          },
        },
      },
    })
      .getGames()
      .flatMap((game) => game.getRoms());
    expect(roms.map((rom) => [rom.getName(), rom.getSize()])).toEqual([['cart.bin', 0x10_00]]);
  });

  it('should read a data area holding a single ROM', () => {
    const roms = SoftwareListDAT.fromObject({
      name: 'single',
      software: {
        name: 'single',
        part: { dataarea: { rom: { name: 'cart.bin', size: '0x4000', crc: '12345678' } } },
      },
    })
      .getGames()
      .flatMap((game) => game.getRoms());
    expect(roms.map((rom) => [rom.getName(), rom.getSize()])).toEqual([['cart.bin', 0x40_00]]);
  });

  it('should add a continue entry given as a number to the file before it', () => {
    const [dataArea] = SoftwareListDAT.fromObject({
      name: 'numeric',
      software: {
        name: 'numeric',
        part: {
          dataarea: {
            rom: [
              { name: 'cart.bin', size: 0x20_00, crc: '12345678' },
              { size: 0x10_00, loadflag: 'continue' },
            ],
          },
        },
      },
    })
      .getGames()
      .flatMap((game) => game.getRoms());
    expect([dataArea?.getName(), dataArea?.getSize()]).toEqual(['cart.bin', 0x30_00]);
  });
});
