import DATObject from '../../../../src/types/dats/datObject.js';
import MameDAT from '../../../../src/types/dats/mame/mameDat.js';

describe('fromObject', () => {
  it('should parse a valid DAT', () => {
    const xml = `<?xml version="1.0"?>
<mame build="0.257 (mame0257-dirty)" debug="no" mameconfig="10">
  <machine name="005" sourcefile="sega/segag80r.cpp" sampleof="005">
    <description>005</description>
    <year>1981</year>
    <manufacturer>Sega</manufacturer>
    <rom name="1346b.cpu-u25" size="2048" crc="8e68533e" sha1="a257c556d31691068ed5c991f1fb2b51da4826db" region="maincpu" offset="0"/>
    <rom name="5092.prom-u1" size="2048" crc="29e10a81" sha1="c4b4e6c75bcf276e53f39a456d8d633c83dcf485" region="maincpu" offset="800"/>
    <rom name="5093.prom-u2" size="2048" crc="e1edc3df" sha1="4f593546bbb0f50850dc6286cb514af6831c27a7" region="maincpu" offset="1000"/>
    <rom name="5094.prom-u3" size="2048" crc="995773bb" sha1="98dd826527853bc031edfb9a821778cc3e906150" region="maincpu" offset="1800"/>
    <rom name="5095.prom-u4" size="2048" crc="f887f575" sha1="de96573a91b60b090b1f441f1410ecad63c9467c" region="maincpu" offset="2000"/>
    <rom name="5096.prom-u5" size="2048" crc="5545241e" sha1="ee504ccaab469100137717341a1b461175ff792d" region="maincpu" offset="2800"/>
    <rom name="5097.prom-u6" size="2048" crc="428edb54" sha1="4f3df6017068d939014a8f638f28e3228acb7add" region="maincpu" offset="3000"/>
    <rom name="5098.prom-u7" size="2048" crc="5bcb9d63" sha1="c0c91bc9f75ad88a6e15c554a980d5c075725fe8" region="maincpu" offset="3800"/>
    <rom name="5099.prom-u8" size="2048" crc="0ea24ba3" sha1="95a30c9b63ef1c346df0da71af3fdecd1a75cb8f" region="maincpu" offset="4000"/>
    <rom name="5100.prom-u9" size="2048" crc="a79af131" sha1="0ba34130174e196015bc9b9c135c420209dfd524" region="maincpu" offset="4800"/>
    <rom name="5101.prom-u10" size="2048" crc="8a1cdae0" sha1="f7c617f9bdb7818e6069a981d0c8820deade134c" region="maincpu" offset="5000"/>
    <rom name="5102.prom-u11" size="2048" crc="70826a15" sha1="a86322d0e8a88534e9b78dcde42ae4c441276913" region="maincpu" offset="5800"/>
    <rom name="5103.prom-u12" size="2048" crc="7f80c5b0" sha1="00748cd5fc7f75fdca194e748524d406c006296d" region="maincpu" offset="6000"/>
    <rom name="5104.prom-u13" size="2048" crc="0140930e" sha1="f8ef894c46d3663bd89d2d817675a67075d3e0d6" region="maincpu" offset="6800"/>
    <rom name="5105.prom-u14" size="2048" crc="17807a05" sha1="bd99f5beab0155f6e4d2fab2fa5f4e147c5730d5" region="maincpu" offset="7000"/>
    <rom name="5106.prom-u15" size="2048" crc="c7cdfa9d" sha1="6ab7adc60ac7bb53a7175e8de51924008737c9ac" region="maincpu" offset="7800"/>
    <rom name="5107.prom-u16" size="2048" crc="95f8a2e6" sha1="89c92e000b3e1630380db779370cf9f5b13e5719" region="maincpu" offset="8000"/>
    <rom name="5108.prom-u17" size="2048" crc="d371cacd" sha1="8f2cdcc0b4e3b77e0958d257e37accefc5749cde" region="maincpu" offset="8800"/>
    <rom name="5109.prom-u18" size="2048" crc="48a20617" sha1="5b4bc3beda0404ff0a61bb42751b87f71817f363" region="maincpu" offset="9000"/>
    <rom name="5110.prom-u19" size="2048" crc="7d26111a" sha1="a6d3652ae606a5b75026e524c9d6aaa78300741e" region="maincpu" offset="9800"/>
    <rom name="5111.prom-u20" size="2048" crc="a888e175" sha1="4c0af94441bf51dfc852372a5b90d0830df81363" region="maincpu" offset="a000"/>
    <rom name="epr-1286.sound-16" size="2048" crc="fbe0d501" sha1="bfa277689790f835d8a43be4beee0581e1096bcc" region="005" offset="0"/>
    <rom name="6331.sound-u8" size="32" crc="1d298cb0" sha1="bb0bb62365402543e3154b9a77be9c75010e6abc" status="baddump" region="proms" offset="0"/>
    <device_ref name="z80"/>
    <device_ref name="gfxdecode"/>
    <device_ref name="palette"/>
    <device_ref name="screen"/>
    <device_ref name="speaker"/>
    <device_ref name="i8255"/>
    <device_ref name="samples"/>
    <device_ref name="sega005_sound"/>
    <sample name="lexplode"/>
    <sample name="sexplode"/>
    <sample name="dropbomb"/>
    <sample name="shoot"/>
    <sample name="missile"/>
    <sample name="helicopt"/>
    <sample name="whistle"/>
    <chip type="cpu" tag="maincpu" name="Zilog Z80" clock="3867120"/>
    <chip type="audio" tag="speaker" name="Speaker"/>
    <chip type="audio" tag="samples" name="Samples"/>
    <chip type="audio" tag="005" name="Sega 005 Custom Sound"/>
    <display tag="screen" type="raster" rotate="270" width="256" height="224" refresh="60.000000" pixclock="5156160" htotal="328" hbend="0" hbstart="256" vtotal="262" vbend="0" vbstart="224" />
    <sound channels="1"/>
    <input players="2" coins="2" service="yes">
      <control type="joy" player="1" buttons="1" ways="4"/>
      <control type="joy" player="2" buttons="1" ways="4"/>
    </input>
    <dipswitch name="Coin A" tag="D1D0" mask="15">
      <diplocation name="SW2" number="8"/>
      <diplocation name="SW2" number="7"/>
      <diplocation name="SW2" number="6"/>
      <diplocation name="SW2" number="5"/>
      <dipvalue name="4 Coins/1 Credit" value="0"/>
      <dipvalue name="3 Coins/1 Credit" value="1"/>
      <dipvalue name="2 Coins/1 Credit" value="2"/>
      <dipvalue name="2 Coins/1 Credit 5/3 6/4" value="9"/>
      <dipvalue name="2 Coins/1 Credit 4/3" value="10"/>
      <dipvalue name="1 Coin/1 Credit" value="3" default="yes"/>
      <dipvalue name="1 Coin/1 Credit 5/6" value="11"/>
      <dipvalue name="1 Coin/1 Credit 4/5" value="12"/>
      <dipvalue name="1 Coin/1 Credit 2/3" value="13"/>
      <dipvalue name="1 Coin/2 Credits" value="4"/>
      <dipvalue name="1 Coin/2 Credits 5/11" value="14"/>
      <dipvalue name="1 Coin/2 Credits 4/9" value="15"/>
      <dipvalue name="1 Coin/3 Credits" value="5"/>
      <dipvalue name="1 Coin/4 Credits" value="6"/>
      <dipvalue name="1 Coin/5 Credits" value="7"/>
      <dipvalue name="1 Coin/6 Credits" value="8"/>
    </dipswitch>
    <dipswitch name="Coin B" tag="D1D0" mask="240">
      <diplocation name="SW2" number="4"/>
      <diplocation name="SW2" number="3"/>
      <diplocation name="SW2" number="2"/>
      <diplocation name="SW2" number="1"/>
      <dipvalue name="4 Coins/1 Credit" value="0"/>
      <dipvalue name="3 Coins/1 Credit" value="16"/>
      <dipvalue name="2 Coins/1 Credit" value="32"/>
      <dipvalue name="2 Coins/1 Credit 5/3 6/4" value="144"/>
      <dipvalue name="2 Coins/1 Credit 4/3" value="160"/>
      <dipvalue name="1 Coin/1 Credit" value="48" default="yes"/>
      <dipvalue name="1 Coin/1 Credit 5/6" value="176"/>
      <dipvalue name="1 Coin/1 Credit 4/5" value="192"/>
      <dipvalue name="1 Coin/1 Credit 2/3" value="208"/>
      <dipvalue name="1 Coin/2 Credits" value="64"/>
      <dipvalue name="1 Coin/2 Credits 5/11" value="224"/>
      <dipvalue name="1 Coin/2 Credits 4/9" value="240"/>
      <dipvalue name="1 Coin/3 Credits" value="80"/>
      <dipvalue name="1 Coin/4 Credits" value="96"/>
      <dipvalue name="1 Coin/5 Credits" value="112"/>
      <dipvalue name="1 Coin/6 Credits" value="128"/>
    </dipswitch>
    <dipswitch name="Lives" tag="D3D2" mask="3">
      <diplocation name="SW1" number="8"/>
      <diplocation name="SW1" number="7"/>
      <dipvalue name="3" value="0" default="yes"/>
      <dipvalue name="4" value="2"/>
      <dipvalue name="5" value="1"/>
      <dipvalue name="6" value="3"/>
    </dipswitch>
    <dipswitch name="Cabinet" tag="D3D2" mask="4">
      <diplocation name="SW1" number="6"/>
      <dipvalue name="Upright" value="4" default="yes"/>
      <dipvalue name="Cocktail" value="0"/>
    </dipswitch>
    <dipswitch name="Unused" tag="D3D2" mask="8">
      <diplocation name="SW1" number="5"/>
      <dipvalue name="Off" value="8" default="yes"/>
      <dipvalue name="On" value="0"/>
    </dipswitch>
    <dipswitch name="Unused" tag="D3D2" mask="16">
      <diplocation name="SW1" number="4"/>
      <dipvalue name="Off" value="16" default="yes"/>
      <dipvalue name="On" value="0"/>
    </dipswitch>
    <dipswitch name="Unused" tag="D3D2" mask="32">
      <diplocation name="SW1" number="3"/>
      <dipvalue name="Off" value="32" default="yes"/>
      <dipvalue name="On" value="0"/>
    </dipswitch>
    <dipswitch name="Unused" tag="D3D2" mask="64">
      <diplocation name="SW1" number="2"/>
      <dipvalue name="Off" value="64" default="yes"/>
      <dipvalue name="On" value="0"/>
    </dipswitch>
    <dipswitch name="Unused" tag="D3D2" mask="128">
      <diplocation name="SW1" number="1"/>
      <dipvalue name="Off" value="128" default="yes"/>
      <dipvalue name="On" value="0"/>
    </dipswitch>
    <port tag=":D1D0">
    </port>
    <port tag=":D3D2">
    </port>
    <port tag=":D5D4">
    </port>
    <port tag=":D7D6">
    </port>
    <port tag=":FC">
    </port>
    <port tag=":SERVICESW">
    </port>
    <driver status="imperfect" emulation="good" savestate="unsupported"/>
    <feature type="sound" status="imperfect"/>
  </machine>
</mame>`;
    const obj = DATObject.fromXmlString(xml);
    if (obj.mame === undefined) {
      throw new Error('XML missing root <mame> tag');
    }
    const dat = MameDAT.fromObject(obj.mame);

    expect(dat.getName()).toEqual('0.257 (mame0257-dirty)');

    expect(dat.getGames()).toHaveLength(1);
    expect(dat.getGames()[0].getName()).toEqual('005');

    expect(dat.getParents()).toHaveLength(1);
    expect(dat.getParents()[0].getName()).toEqual('005');
    expect(dat.getParents()[0].getGames()).toHaveLength(1);
  });
});
