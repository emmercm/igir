interface DatfileOptions {
  ignoreHeader: boolean,
}

interface DatfileHeader {
  name: string,
  description: string,
  category: string,
  version: string,
  author: string,
}

interface DatfileGame {
  name: string,
  entries: DatfileEntry[],
  description: string,
}

interface DatfileEntry {
  name?: string,
  size?: string,
  crc?: string,
  md5?: string,
  sha1?: string,
}

// https://github.com/RobLoach/datfile/issues/10
declare module 'robloach-datfile' {
  import { Readable } from 'stream';

  function parse(
    input: string | Readable,
    options?: DatfileOptions,
  ): Promise<[DatfileHeader, ...Array<DatfileGame>]>;
}
