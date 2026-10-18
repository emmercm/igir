import DATObject from '../../../../src/models/dats/datObject.js';
import SoftwareListDAT from '../../../../src/models/dats/softwarelist/softwareListDat.js';

const xml = `<?xml version="1.0"?>
<softwarelist name="a2600" description="Atari 2600 cartridges">
  <software name="adventur">
    <description>Adventure</description>
    <year>1980</year>
    <publisher>Atari</publisher>
    <part name="cart" interface="a2600_cart">
      <dataarea name="rom" size="4096">
        <rom name="cx2613.bin" size="4096" crc="157bddb7" sha1="1086fd9ae03ec6e1e3a1f4ff5a45ac5ae2cfa3f2"/>
      </dataarea>
    </part>
  </software>
</softwarelist>`;

describe('withGames', () => {
  it('should keep the name and description', () => {
    const dat = SoftwareListDAT.fromObject(DATObject.fromXmlString(xml).softwarelist ?? {});
    expect(dat.getName()).toEqual('a2600');

    const rebuilt = dat.withGames(dat.getGames());

    expect(rebuilt.getName()).toEqual('a2600');
    expect(rebuilt.getDescription()).toEqual('Atari 2600 cartridges');
    expect(rebuilt.getGames()).toHaveLength(1);
  });
});
