import { XMLParser } from 'fast-xml-parser';

/**
 * This is the root object for an XML DAT.
 */
export interface DATObjectProps {
  datafile?: object;
  mame?: object;
  softwarelists?: {
    softwarelist?: object | object[];
  };
  softwarelist?: object;
}

// These paths aren't read during deserialization, so try to save memory by skipping them
const XML_IGNORE_PATHS = new Set([
  ...['machine', 'game'].flatMap((tag) => [
    `mame.${tag}.adjuster`,
    `mame.${tag}.archive`,
    `mame.${tag}.board`,
    `mame.${tag}.chip`,
    `mame.${tag}.condition`,
    `mame.${tag}.configuration`,
    `mame.${tag}.biosset`,
    `mame.${tag}.devices`,
    `mame.${tag}.dipswitch`,
    `mame.${tag}.display`,
    `mame.${tag}.driver`,
    `mame.${tag}.feature`,
    `mame.${tag}.input`,
    `mame.${tag}.port`,
    `mame.${tag}.ramoption`,
    `mame.${tag}.rebuildto`,
    `mame.${tag}.sample`,
    `mame.${tag}.slot`,
    `mame.${tag}.sound`,
    `mame.${tag}.video`,
    `mame.${tag}.year`,
  ]),
  ...['softwarelist.software.info', 'softwarelist.software.part.feature'].flatMap((path) => [
    `softwarelists.${path}`,
    path,
  ]),
]);

// These attributes aren't read during deserialization, so try to save memory by skipping them
const XML_IGNORE_ATTRS = {
  ...['machine', 'game'].reduce<Record<string, string[]>>((obj, tag) => {
    obj[`mame.${tag}`] = ['ismechanical', 'runnable', 'sampleof', 'sourcefile'];
    obj[`mame.${tag}.rom`] = ['offset', 'optional', 'region'];
    return obj;
  }, {}),
};

/**
 * Class to hold some static parsing methods.
 */
export default {
  /**
   * Parse the contents of an XML file to a {@link DATObjectProps} object.
   */
  fromXmlString(xmlContents: Buffer | string): DATObjectProps {
    return new XMLParser({
      ignoreAttributes: false,
      ignoreDeclaration: true,
      ignorePiTags: true,
      updateTag: (_tagName, jPath, attrs): boolean => {
        if (XML_IGNORE_PATHS.has(jPath)) {
          return false;
        }
        (XML_IGNORE_ATTRS[jPath] ?? []).forEach((attr) => {
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
          delete attrs[attr];
        });
        return true;
      },
      parseTagValue: false, // don't try to parse any number-like values
      parseAttributeValue: false, // don't try to parse any number-like values
      attributeNamePrefix: '',
    }).parse(xmlContents) as DATObjectProps;
  },
};
