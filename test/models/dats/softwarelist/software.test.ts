import DATObject from '../../../../src/models/dats/datObject.js';
import SoftwareListDAT from '../../../../src/models/dats/softwarelist/softwareListDat.js';

const xml = `<?xml version="1.0"?>
<softwarelist name="nes" description="Nintendo Entertainment System cartridges">
  <software name="smb">
    <description>Super Mario Bros.</description>
    <part name="cart" interface="nes_cart">
      <dataarea name="prg" size="32768">
        <rom name="smb.prg" size="32768" crc="5cf548d3" sha1="fefe4e7d1a2c2dbaa3e0cc5dc10b8e6b10f3c3a1"/>
      </dataarea>
      <dataarea name="chr" size="8192">
        <rom name="smb.chr" size="8192" crc="867b51ad" sha1="394badaf0b0bdd0ac279a5eca89a9d9e5f7bbd9d"/>
      </dataarea>
    </part>
  </software>
</softwarelist>`;

describe('withProps', () => {
  it('should keep every ROM from every data area', () => {
    const [software] = SoftwareListDAT.fromObject(
      DATObject.fromXmlString(xml).softwarelist ?? {},
    ).getGames();
    expect(software.getRoms().map((rom) => rom.getName())).toEqual(['smb.prg', 'smb.chr']);

    const copy = software.withProps({ cloneOf: undefined });

    expect(copy.getName()).toEqual('smb');
    expect(copy.getRoms().map((rom) => rom.getName())).toEqual(['smb.prg', 'smb.chr']);
  });
});
