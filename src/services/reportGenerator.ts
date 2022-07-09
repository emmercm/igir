import DAT from '../types/dat/dat';
import Parent from '../types/dat/parent';
import Options from '../types/options';
import ROMFile from '../types/romFile';

export default class ReportGenerator {
  static write(options: Options, writtenRoms: Map<DAT, Map<Parent, ROMFile[]>>) {}
}
