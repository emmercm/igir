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

/**
 * Class to hold some static parsing methods.
 */
export default {
  /**
   * Parse the contents of an XML file to a {@link DATObjectProps} object.
   */
  fromXmlString(xmlContents: string): DATObjectProps {
    return new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
    }).parse(xmlContents) as DATObjectProps;
  },
};
