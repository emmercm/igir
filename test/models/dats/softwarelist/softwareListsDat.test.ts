import DATObject from '../../../../src/models/dats/datObject.js';
import SoftwareListsDAT from '../../../../src/models/dats/softwarelist/softwareListsDat.js';

const xml = `<?xml version="1.0"?>
<softwarelists>
  <softwarelist name="a2600" description="Atari 2600 cartridges">
    <software name="adventur">
      <description>Adventure</description>
      <part name="cart" interface="a2600_cart">
        <dataarea name="rom" size="4096">
          <rom name="cx2613.bin" size="4096" crc="157bddb7" sha1="1086fd9ae03ec6e1e3a1f4ff5a45ac5ae2cfa3f2"/>
        </dataarea>
      </part>
    </software>
  </softwarelist>
  <softwarelist name="a5200" description="Atari 5200 cartridges">
    <software name="pacman">
      <description>Pac-Man</description>
      <part name="cart" interface="a5200_cart">
        <dataarea name="rom" size="8192">
          <rom name="pacman.bin" size="8192" crc="0e2f5a2e" sha1="dbbbb3d8e3cbd52b2bc1f1c6a3e3c1f7b7b1d1a1"/>
        </dataarea>
      </part>
    </software>
  </softwarelist>
</softwarelists>`;

describe('getHeader', () => {
  it('should name the DAT after every software list', () => {
    const dat = SoftwareListsDAT.fromObject(DATObject.fromXmlString(xml).softwarelists ?? {});

    expect(dat.getName()).toEqual('a2600, a5200');
    expect(dat.getDescription()).toEqual('Atari 2600 cartridges, Atari 5200 cartridges');
  });
});

describe('withGames', () => {
  it('should keep the name and description', () => {
    const dat = SoftwareListsDAT.fromObject(DATObject.fromXmlString(xml).softwarelists ?? {});

    const rebuilt = dat.withGames(dat.getGames());

    expect(rebuilt.getName()).toEqual('a2600, a5200');
    expect(rebuilt.getDescription()).toEqual('Atari 2600 cartridges, Atari 5200 cartridges');
    expect(rebuilt.getGames()).toHaveLength(2);
  });
});
