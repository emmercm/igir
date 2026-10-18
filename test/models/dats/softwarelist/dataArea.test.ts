import DATObject from '../../../../src/models/dats/datObject.js';
import SoftwareListDAT from '../../../../src/models/dats/softwarelist/softwareListDat.js';

const xml = `<?xml version="1.0"?>
<softwarelist name="a7800" description="Atari 7800 cartridges">
  <software name="ballblaz">
    <description>Ballblazer</description>
    <part name="cart" interface="a7800_cart">
      <dataarea name="rom" size="0x8000">
        <rom name="ballblazer (usa).bin" size="0x2000" crc="8d6e7e5b" sha1="d5da37e3c1d6a7e1cd2a0edcbb0db2e0c6e56f3f" offset="0x0000"/>
        <rom size="0x2000" offset="0x6000" loadflag="reload"/>
        <rom size="0x4000" offset="0" loadflag="continue" />
      </dataarea>
    </part>
  </software>
</softwarelist>`;

describe('getRoms', () => {
  it('should leave out ROMs without a name', () => {
    const [software] = SoftwareListDAT.fromObject(
      DATObject.fromXmlString(xml).softwarelist ?? {},
    ).getGames();

    expect(software.getRoms().map((rom) => rom.getName())).toEqual(['ballblazer (usa).bin']);
  });
});
