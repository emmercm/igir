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

const cdXml = `<?xml version="1.0"?>
<softwarelist name="fmtowns_cd" description="Fujitsu FM Towns CD-ROMs">
  <software name="win30">
    <description>Nihongo Microsoft Windows V3.0 with Multimedia Extensions V1.0 L10</description>
    <part name="cdrom" interface="cdrom">
      <diskarea name="cdrom">
        <disk name="nihongo microsoft windows v3.0 with multimedia extensions v1.0 l10 (japan)" sha1="8426d9e6d652f830b378b06d0ea880607cc093b1"/>
      </diskarea>
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
    expect(copy.getRoms()).toEqual(software.getRoms());
  });

  it('should keep every disk from every disk area', () => {
    const [software] = SoftwareListDAT.fromObject(
      DATObject.fromXmlString(cdXml).softwarelist ?? {},
    ).getGames();
    expect(software.getDisks()).toHaveLength(1);

    const copy = software.withProps({ cloneOf: undefined });

    expect(copy.getDisks()).toEqual(software.getDisks());
  });
});

describe('getDisks', () => {
  it('should return every disk from every disk area', () => {
    const [software] = SoftwareListDAT.fromObject(
      DATObject.fromXmlString(cdXml).softwarelist ?? {},
    ).getGames();

    expect(software.getRoms()).toHaveLength(0);
    expect(software.getDisks().map((disk) => [disk.getName(), disk.getSha1()])).toEqual([
      [
        'nihongo microsoft windows v3.0 with multimedia extensions v1.0 l10 (japan)',
        '8426d9e6d652f830b378b06d0ea880607cc093b1',
      ],
    ]);
  });
});
