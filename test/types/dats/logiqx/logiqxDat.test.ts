import DATObject from '../../../../src/types/dats/datObject.js';
import LogiqxDAT from '../../../../src/types/dats/logiqx/logiqxDat.js';

describe('fromObject', () => {
  it('should parse a valid DAT', () => {
    const xml = `<?xml version="1.0"?>
<!DOCTYPE datafile PUBLIC "-//Logiqx//DTD ROM Management Datafile//EN" "http://www.logiqx.com/Dats/datafile.dtd">
<datafile>
  <header>
    <name>Nintendo - Game Boy (Parent-Clone)</name>
    <description>Nintendo - Game Boy (Parent-Clone)</description>
    <version>20230729-000034</version>
    <date>20230729-000034</date>
    <author>aci68, akubi, Arctic Circle System, Aringon, baldjared, Bent, BigFred, BitLooter, buckwheat, C. V. Reynolds, chillerecke, darthcloud, DeadSkullzJr, Densetsu, DeriLoko3, ElBarto, foxe, fuzzball, Gefflon, Hiccup, hking0036, InternalLoss, Jack, jimmsu, Just001Kim, kazumi213, leekindo, Lesserkuma, Madeline, NESBrew12, NGEfreak, nnssxx, norkmetnoil577, NovaAurora, omonim2007, Powerpuff, PPLToast, Psychofox11, rarenight, relax, RetroUprising, rpg2813, sCZther, SonGoku, Tauwasser, togemet2, UnlockerPT, xNo, xprism, xuom2</author>
    <url>https://www.no-intro.org</url>
  </header>
  <game name="[BIOS] Nintendo Game Boy Boot ROM (World) (Rev 1)">
    <description>[BIOS] Nintendo Game Boy Boot ROM (World) (Rev 1)</description>
    <release name="[BIOS] Nintendo Game Boy Boot ROM (World) (Rev 1)" region="EUR"/>
    <release name="[BIOS] Nintendo Game Boy Boot ROM (World) (Rev 1)" region="JPN"/>
    <release name="[BIOS] Nintendo Game Boy Boot ROM (World) (Rev 1)" region="USA"/>
    <rom name="[BIOS] Nintendo Game Boy Boot ROM (World) (Rev 1).gb" size="256" crc="59c8598e" md5="32fbbd84168d3482956eb3c5051637f5" sha1="4ed31ec6b0b175bb109c0eb5fd3d193da823339f" status="verified"/>
  </game>
  <game name="[BIOS] Nintendo Game Boy Boot ROM (Japan) (En)" cloneof="[BIOS] Nintendo Game Boy Boot ROM (World) (Rev 1)">
    <description>[BIOS] Nintendo Game Boy Boot ROM (Japan) (En)</description>
    <rom name="[BIOS] Nintendo Game Boy Boot ROM (Japan) (En).gb" size="256" crc="c2f5cc97" md5="a8f84a0ac44da5d3f0ee19f9cea80a8c" sha1="8bd501e31921e9601788316dbd3ce9833a97bcbc" status="verified"/>
  </game>
</datafile>`;
    const obj = DATObject.fromXmlString(xml);
    const dat = LogiqxDAT.fromObject(obj.datafile!);

    expect(dat.getName()).toEqual('Nintendo - Game Boy (Parent-Clone)');

    expect(dat.getGames()).toHaveLength(2);

    expect(dat.getParents()).toHaveLength(1);
    expect(dat.getParents()[0].getName()).toEqual(
      '[BIOS] Nintendo Game Boy Boot ROM (World) (Rev 1)',
    );
    expect(dat.getParents()[0].getGames()).toHaveLength(2);
  });
});
