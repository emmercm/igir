import 'jest-extended';

import DATMergerSplitter from '../../src/modules/datMergerSplitter.js';
import Game from '../../src/types/dats/game.js';
import Header from '../../src/types/dats/logiqx/header.js';
import LogiqxDAT from '../../src/types/dats/logiqx/logiqxDat.js';
import DeviceRef from '../../src/types/dats/mame/deviceRef.js';
import Machine from '../../src/types/dats/mame/machine.js';
import ROM from '../../src/types/dats/rom.js';
import Options, { MergeMode } from '../../src/types/options.js';
import ProgressBarFake from '../console/progressBarFake.js';

it('should do nothing if no parent/clone info is present', async () => {
  // Given
  const options = new Options({ mergeRoms: undefined });
  const dat = new LogiqxDAT(new Header(), []);

  // When
  const result = await new DATMergerSplitter(options, new ProgressBarFake()).merge(dat);

  // Then the original DAT was returned
  expect(result).toEqual(dat);
});

test.each(
  Object.keys(MergeMode)
    .filter((mode) => Number.isNaN(Number(mode)))
    .map((mode) => [mode.toLowerCase()]),
)('should do nothing if no parent/clone info is present: %s', async (mergeRoms) => {
  // Given
  const options = new Options({ mergeRoms });
  const dat = new LogiqxDAT(new Header(), []);

  // When
  const result = await new DATMergerSplitter(options, new ProgressBarFake()).merge(dat);

  // Then the original DAT was returned
  expect(result).toEqual(dat);
});

describe('MAME v0.258', () => {
  /* eslint-disable object-curly-newline, unicorn/numeric-separators-style */
  const dat = new LogiqxDAT(new Header(), [
    // ***** Games *****
    new Machine({
      // Game that has clone(s) and a romOf BIOS parent
      name: '100lions',
      romOf: 'aristmk6',
      description: '100 Lions (10219211, NSW/ACT)',
      rom: [
        new ROM({ name: '24013001_right.u83', merge: '24013001_right.u83', bios: 'au-nsw1', size: 2097152, crc32: 'e97afedf', sha1: '10ca3b015afaff5d7812f0f5207b2535602136a5' }),
        new ROM({ name: '24013001_left.u70', merge: '24013001_left.u70', bios: 'au-nsw1', size: 2097152, crc32: '06ae7e07', sha1: '39a45575b66906d73b519988d1001c99b05c5f34' }),
        new ROM({ name: '21012901_right.u83', merge: '21012901_right.u83', bios: 'au-nsw2', size: 2097152, crc32: '757618f2', sha1: '43f9a3e7d544979f8c6974945914d9e099b02abd' }),
        new ROM({ name: '21012901_left.u70', merge: '21012901_left.u70', bios: 'au-nsw2', size: 2097152, crc32: '0d271470', sha1: '5cd4b604bfe2fd7e9a8d08e1c7c97f17ae068479' }),
        new ROM({ name: '19012801_right.u83', merge: '19012801_right.u83', bios: 'au-nsw3', size: 2097152, crc32: '5b20a96c', sha1: '5fd916b7cc2cdd51bf7dd212c1114f94dc9c7926' }),
        new ROM({ name: '19012801_left.u70', merge: '19012801_left.u70', bios: 'au-nsw3', size: 2097152, crc32: 'b03bd17c', sha1: 'f281e80f6dda5b727ed71d2deebe3b0ff548773f' }),
        new ROM({ name: '13012001_right.u83', merge: '13012001_right.u83', bios: 'au-nsw4', size: 2097152, crc32: 'e627dbfa', sha1: '4fedbe0975ceb7dc0ebebf18a7708d78984db9b7' }),
        new ROM({ name: '13012001_left.u70', merge: '13012001_left.u70', bios: 'au-nsw4', size: 2097152, crc32: '38e8f659', sha1: '88c6acba99b0aca023c6f4d27c061c231490e9e0' }),
        new ROM({ name: '11011901_right.u83', merge: '11011901_right.u83', bios: 'au-nsw5', size: 2097152, crc32: '73dcb11c', sha1: '69ae4f32a0c9141b2a82ff3935b0cd20333d2964' }),
        new ROM({ name: '11011901_left.u70', merge: '11011901_left.u70', bios: 'au-nsw5', size: 2097152, crc32: 'd3dd2210', sha1: '3548f8cc39859d3f44a55f6bae48966a2d48e0eb' }),
        new ROM({ name: '11011501_right.u83', merge: '11011501_right.u83', bios: 'au-nsw6', size: 2097152, crc32: 'de4c3aed', sha1: '21596a2edd20eb7de7a4ec8900a270b09c8f326f' }),
        new ROM({ name: '11011501_left.u70', merge: '11011501_left.u70', bios: 'au-nsw6', size: 2097152, crc32: 'c5cc3461', sha1: '5b43c4cb6110a6ccf67cd0f3789253f6872b20c4' }),
        new ROM({ name: '09011001_right.u83', merge: '09011001_right.u83', bios: 'au-nsw7', size: 2097152, crc32: '8a853f80', sha1: '9a75498f7b02c81a483b4e1c158f35f0ee4c0112' }),
        new ROM({ name: '09011001_left.u70', merge: '09011001_left.u70', bios: 'au-nsw7', size: 2097152, crc32: '229c2e63', sha1: '91fd2b1acb69efe073647e93db9f11042add2feb' }),
        new ROM({ name: '07010801_right.u83', merge: '07010801_right.u83', bios: 'au-nsw8', size: 2097152, crc32: '8c148c11', sha1: '5ff3be18455b4f04675fec8d5b9d881295c65e23' }),
        new ROM({ name: '07010801_left.u70', merge: '07010801_left.u70', bios: 'au-nsw8', size: 2097152, crc32: '8e92af68', sha1: '00d2bb655b7964a9652896741210ec534df0b0d2' }),
        new ROM({ name: '05010601_right.u83', merge: '05010601_right.u83', bios: 'au-nsw9', size: 1048576, crc32: 'c12eac11', sha1: '683b9ddc323865ace7dca37d13b55de6e42759a5' }),
        new ROM({ name: '05010601_left.u70', merge: '05010601_left.u70', bios: 'au-nsw9', size: 1048576, crc32: 'b3e6b4a0', sha1: '3bf398c9257579f8e51ce716d6ebfa74fa510273' }),
        new ROM({ name: '04010501_right.u83', merge: '04010501_right.u83', bios: 'au-nsw10', size: 1048576, crc32: '3daefb7a', sha1: '411471713219f4bab5ccf5fe7a12a6c138c8c550' }),
        new ROM({ name: '04010501_left.u70', merge: '04010501_left.u70', bios: 'au-nsw10', size: 1048576, crc32: '21182775', sha1: '7c5b7f5aba3babc85f512a8f7d4ebc0d83eb842a' }),
        new ROM({ name: '03010301.u84', merge: '03010301.u84', bios: 'au-nsw11', size: 1048576, crc32: 'a34a9f16', sha1: 'b8750e6ceb1715da8e5ac2f0183254e29a042641' }),
        new ROM({ name: '03010301.u71', merge: '03010301.u71', bios: 'au-nsw11', size: 1048576, crc32: 'd793440a', sha1: 'dced4c04bde13293af77a9a1f4c5c606e3758de0' }),
        new ROM({ name: '03010301.u83', merge: '03010301.u83', bios: 'au-nsw11', size: 1048576, crc32: 'c8580554', sha1: '58b8bfff2f8d298c4e3be2b01900800c45fa7ad7' }),
        new ROM({ name: '03010301.u70', merge: '03010301.u70', bios: 'au-nsw11', size: 1048576, crc32: '5ae69121', sha1: '36dd3f9aaf5f7d2751d1954d67f898bc3ec71f3b' }),
        new ROM({ name: '02010201.u84', merge: '02010201.u84', bios: 'au-nsw12', size: 1048576, crc32: '0920930f', sha1: '771b0f62442d1c75b1bb59ad82365b7ab8747173' }),
        new ROM({ name: '02010201.u71', merge: '02010201.u71', bios: 'au-nsw12', size: 1048576, crc32: '24d5614a', sha1: 'fdcf3826dccc72b74b66379b1411cf211d5a1670' }),
        new ROM({ name: '02010201.u83', merge: '02010201.u83', bios: 'au-nsw12', size: 1048576, crc32: '5f64a20c', sha1: '397404ab6d2a1aa3c1fc77bb9421fef7079b65a5' }),
        new ROM({ name: '02010201.u70', merge: '02010201.u70', bios: 'au-nsw12', size: 1048576, crc32: '9b2db442', sha1: 'd512398a2d9257bd385dc50d61c63cd1a47300ba' }),
        new ROM({ name: '02010114.u84', merge: '02010114.u84', bios: 'au-nsw13', size: 1048576, crc32: '183e3836', sha1: '4c802d0cd010bc007acb3a83e37aaa29b2d13d87' }),
        new ROM({ name: '02010114.u71', merge: '02010114.u71', bios: 'au-nsw13', size: 1048576, crc32: '8f83c3dd', sha1: 'a5f9d80b4b515b24299d0241e1665cfd9da8bab7' }),
        new ROM({ name: '02010114.u83', merge: '02010114.u83', bios: 'au-nsw13', size: 1048576, crc32: '945104d7', sha1: 'e372d0cf889c72b5d001b26fe4a925a28486537f' }),
        new ROM({ name: '02010114.u70', merge: '02010114.u70', bios: 'au-nsw13', size: 1048576, crc32: '3ba4379f', sha1: '84367f12c4c9224d2ab9cae83ae8727de338408c' }),
        new ROM({ name: '25012805_right.u83', merge: '25012805_right.u83', bios: 'au-qld1', size: 2097152, crc32: '2ecd8da8', sha1: '389e9668b2ba4fffed5d2721b2ce70d502fb9f67' }),
        new ROM({ name: '25012805_left.u70', merge: '25012805_left.u70', bios: 'au-qld1', size: 2097152, crc32: '996f32ce', sha1: 'cf21bef745986fcbd298167453c7b8e5945ce602' }),
        new ROM({ name: '20012605_right.u83', merge: '20012605_right.u83', bios: 'au-qld2', size: 2097152, crc32: '045b82ad', sha1: 'b8e4f9f826970d83ae5fd2f2898de12ad1bf2d24' }),
        new ROM({ name: '20012605_left.u70', merge: '20012605_left.u70', bios: 'au-qld2', size: 2097152, crc32: '87331111', sha1: '6cdc2d81f68de23af18a975a6f27ddec246be405' }),
        new ROM({ name: '20012305_right.u83', merge: '20012305_right.u83', bios: 'au-qld3', size: 2097152, crc32: 'e436c1f5', sha1: '62ee529cc971fd76aa2ccc15778e3f0c40e3e47f' }),
        new ROM({ name: '20012305_left.u70', merge: '20012305_left.u70', bios: 'au-qld3', size: 2097152, crc32: 'ea8961cc', sha1: '0ebc7c3b94a6e01ee984af4711043130d9670bd3' }),
        new ROM({ name: '14011605_right.u83', merge: '14011605_right.u83', bios: 'au-qld4', size: 2097152, crc32: '2bec5b74', sha1: '854733cada75e632f01f7096d4740ed4941a3d5b' }),
        new ROM({ name: '14011605_left.u70', merge: '14011605_left.u70', bios: 'au-qld4', size: 2097152, crc32: 'cd26d4f0', sha1: '40822714abf08aeb08d827dbd8cd099f86803754' }),
        new ROM({ name: '04041205_right.u83', merge: '04041205_right.u83', bios: 'au-qld5', size: 1048576, crc32: 'ca6bc86c', sha1: '69fe7fc35694e4cd7f861bff4ec3a6165a81df6e' }),
        new ROM({ name: '04041205_left.u70', merge: '04041205_left.u70', bios: 'au-qld5', size: 1048576, crc32: 'dfb9a119', sha1: '814a5a7877392aec4e4871d7f0e19d2fbd717409' }),
        new ROM({ name: '03130334_right.u83', merge: '03130334_right.u83', bios: 'au-qld6', size: 2097152, crc32: 'bce3d97f', sha1: 'da36377cc1465022a2434703adee63bf48c71a9c' }),
        new ROM({ name: '03130334_left.u70', merge: '03130334_left.u70', bios: 'au-qld6', size: 2097152, crc32: '02175fde', sha1: '4e9a9e1e803a0c84b06aec99dc3147dd7a919eee' }),
        new ROM({ name: '01040505.u84', merge: '01040505.u84', bios: 'au-qld7', size: 1048576, crc32: 'cf5a9d1e', sha1: '0ebba478fc883831d70b0fa95f43e5f93b07ae9e' }),
        new ROM({ name: '01040505.u71', merge: '01040505.u71', bios: 'au-qld7', size: 1048576, crc32: 'f56ea77e', sha1: '319be1bee66a289e2c1f6beec07758f79aa0cf16' }),
        new ROM({ name: '01040505.u83', merge: '01040505.u83', bios: 'au-qld7', size: 1048576, crc32: '90f32169', sha1: '228be8b4a9eb6b2acf7f7a7561bd194009936026' }),
        new ROM({ name: '01040505.u70', merge: '01040505.u70', bios: 'au-qld7', size: 1048576, crc32: 'b9ddea66', sha1: 'f4bfdeada39a3f0094d6468b7374a34f88f5df7f' }),
        new ROM({ name: '03030708_right.u83', merge: '03030708_right.u83', bios: 'au-sa1', size: 1048576, crc32: 'b4b3c6a5', sha1: '5747f98a6eaa5c24a23d1d76a28b33a3bfbbfd1f' }),
        new ROM({ name: '03030708_left.u70', merge: '03030708_left.u70', bios: 'au-sa1', size: 1048576, crc32: '4e5ad823', sha1: '77ab1c29c6172cfdcef776222a72b2b44114d4da' }),
        new ROM({ name: '14011913_right.u83', merge: '14011913_right.u83', bios: 'nz1', size: 2097152, crc32: '01d13b89', sha1: 'b1013366d0803dfbec5a5f90f6a5cea862de0513' }),
        new ROM({ name: '14011913_left.u70', merge: '14011913_left.u70', bios: 'nz1', size: 2097152, crc32: '9a4cefdf', sha1: '6c15bc565ede8af19361d60ee1e6657a8055c92c' }),
        new ROM({ name: '14010152_right.u83', merge: '14010152_right.u83', bios: 'nz2', size: 2097152, crc32: '7e3f61f6', sha1: '1e27d72c35b0c633187159ef434f22398df28882' }),
        new ROM({ name: '14010152_left.u70', merge: '14010152_left.u70', bios: 'nz2', size: 2097152, crc32: '2716e1ef', sha1: '81fe1ae4f9cd1bcb24795ce85913ee22ed0fabcd' }),
        new ROM({ name: '02061013_right.u83', merge: '02061013_right.u83', bios: 'nz3', size: 1048576, crc32: '7a8619a5', sha1: 'bd03ddb68817c1660b009e102ccf69e5b603b875' }),
        new ROM({ name: '02061013_left.u70', merge: '02061013_left.u70', bios: 'nz3', size: 1048576, crc32: 'e70a7007', sha1: '0935f924866162d9c0fbdbb99391cbf730a04b76' }),
        new ROM({ name: '02060913_right.u83', merge: '02060913_right.u83', bios: 'nz4', size: 1048576, crc32: '31068c41', sha1: '962da0079495a64f7ffb34be643892c272017cc9' }),
        new ROM({ name: '02060913_left.u70', merge: '02060913_left.u70', bios: 'nz4', size: 1048576, crc32: 'd6a6713c', sha1: '0f3bb2746f1a6fa6a587fd50827299408a3b28d2' }),
        new ROM({ name: '15011025_right.u83', merge: '15011025_right.u83', bios: 'my', size: 2097152, crc32: 'bf21a975', sha1: 'a251b1a7342387300689cd50fe4ce7975b903ac5' }),
        new ROM({ name: '15011025_left.u70', merge: '15011025_left.u70', bios: 'my', size: 2097152, crc32: 'c02e14b0', sha1: '6bf98927813519dfe60e582dbe5be3ccd87f7c91' }),
        new ROM({ name: '24010467_right.u83', merge: '24010467_right.u83', bios: 'afr', size: 2097152, crc32: 'eddeff13', sha1: '77ccbcf40aeb7305eb13d6d24efafd09955f1eac' }),
        new ROM({ name: '24010467_left.u70', merge: '24010467_left.u70', bios: 'afr', size: 2097152, crc32: '9093d820', sha1: '05bb14895e3077d277a1d0822036d08f359c0307' }),
        new ROM({ name: '01.04.11_right.u83', merge: '01.04.11_right.u83', bios: 'us1', size: 2097152, crc32: '2dae8ca0', sha1: '7a0fb38b4c1ac7195d15bdab6f0cfb16c78430f0' }),
        new ROM({ name: '01.04.11_left.u70', merge: '01.04.11_left.u70', bios: 'us1', size: 2097152, crc32: '787f2b07', sha1: '2548289e44f4b935346b759afb5383bdbac04c3e' }),
        new ROM({ name: '01.04.10_right.u83', merge: '01.04.10_right.u83', bios: 'us2', size: 2097152, crc32: '82ce2fcc', sha1: '4c8fb3db084a67e99d1420b3f895a06ce9ef5ec2' }),
        new ROM({ name: '01.04.10_left.u70', merge: '01.04.10_left.u70', bios: 'us2', size: 2097152, crc32: '9d9d52c1', sha1: 'b957220cdbedd516c219d1bfc28807ce466df93f' }),
        new ROM({ name: '01.04.08_right.u83', merge: '01.04.08_right.u83', bios: 'us3', size: 2097152, crc32: '95333304', sha1: '7afe49d6c5e4d6820f349778557daa88c5366a51' }),
        new ROM({ name: '01.04.08_left.u70', merge: '01.04.08_left.u70', bios: 'us3', size: 2097152, crc32: '0dfcad10', sha1: '53798be000304aed38909f5fd8470a68bedd8229' }),
        new ROM({ name: '01.04.07_right.u83', merge: '01.04.07_right.u83', bios: 'us4', size: 2097152, crc32: '23c28e22', sha1: '98f24a1f86232b6c2c288a61ec7d60c867f192e5' }),
        new ROM({ name: '01.04.07_left.u70', merge: '01.04.07_left.u70', bios: 'us4', size: 2097152, crc32: 'acfb0fe0', sha1: 'b1a772d7978e6ff4406a5bb39a71cb3f89608e72' }),
        new ROM({ name: '01.04.04_right.u83', merge: '01.04.04_right.u83', bios: 'us5', size: 2097152, crc32: 'e57ba02d', sha1: '8e29403e6b619eeab41dc171221720bc7820ccdc' }),
        new ROM({ name: '01.04.04_left.u70', merge: '01.04.04_left.u70', bios: 'us5', size: 2097152, crc32: 'b984a92c', sha1: '90f7a61302caee40195c08565bdac856a3234c1d' }),
        new ROM({ name: '01.03.17_right.u83', merge: '01.03.17_right.u83', bios: 'us6', size: 2097152, crc32: '1582714b', sha1: '92d0a15314ffe526159bef9a364898dd1ebdfde7' }),
        new ROM({ name: '01.03.17_left.u70', merge: '01.03.17_left.u70', bios: 'us6', size: 2097152, crc32: 'a88193dc', sha1: 'c9e1d483edaecd318d2e5fc8a54e84516c93e0ca' }),
        new ROM({ name: '01.03.14_right.u83', merge: '01.03.14_right.u83', bios: 'us7', size: 2097152, crc32: '889ffd82', sha1: '9c98c9cdcf5f7d05095f11006418133029e9f0f8' }),
        new ROM({ name: '01.03.14_left.u70', merge: '01.03.14_left.u70', bios: 'us7', size: 2097152, crc32: '7138fec4', sha1: 'f81331d1875ac574d3e6c98be218ff25c6c7be5a' }),
        new ROM({ name: '01.03.07_right.u83', merge: '01.03.07_right.u83', bios: 'us8', size: 2097152, crc32: '2ebccc4e', sha1: '9342724e4451e9ab24ceae208284b50abd4f0be3' }),
        new ROM({ name: '01.03.07_left.u70', merge: '01.03.07_left.u70', bios: 'us8', size: 2097152, crc32: 'a3632da4', sha1: '1c96a88e86095b81801ab88e36a4cdfa4b893265' }),
        new ROM({ name: '01.03.06_right.u83', merge: '01.03.06_right.u83', bios: 'us9', size: 2097152, crc32: 'bd48ca55', sha1: '8fb1576cbeb1c64c358880714740195d2e73e03e' }),
        new ROM({ name: '01.03.06_left.u70', merge: '01.03.06_left.u70', bios: 'us9', size: 2097152, crc32: '2f9d9a29', sha1: 'fdebfaca9a579d7249379f19aef22fbfd66bf943' }),
        new ROM({ name: '01.03.05_right.u83', merge: '01.03.05_right.u83', bios: 'us10', size: 2097152, crc32: '2c7f1ec3', sha1: 'd03167f43ed6f9596080d91472695829378cef0a' }),
        new ROM({ name: '01.03.05_left.u70', merge: '01.03.05_left.u70', bios: 'us10', size: 2097152, crc32: '0095e3f9', sha1: 'd2e8786158b1ab0a614aab21cf1d14cbc04754af' }),
        new ROM({ name: '01.03.03e_right.u83', merge: '01.03.03e_right.u83', bios: 'us11', size: 2097152, crc32: '2255e263', sha1: '5e9e093aaa17172f47a14c3baf7f6f0f73b19398' }),
        new ROM({ name: '01.03.03e_left.u70', merge: '01.03.03e_left.u70', bios: 'us11', size: 2097152, crc32: 'ea50729a', sha1: '14b5a71bfb91ac366ddcb5f77fb54127808f8163' }),
        new ROM({ name: '01.03.03a_right.u83', merge: '01.03.03a_right.u83', bios: 'us12', size: 2097152, crc32: '253415f4', sha1: '50dc77ad87bc6be1932dda2fd4865602c8c49729' }),
        new ROM({ name: '01.03.03a_left.u70', merge: '01.03.03a_left.u70', bios: 'us12', size: 2097152, crc32: '4ab5dd40', sha1: 'a6812cc624e6a98ea7b0697e2797fe10ba8e303e' }),
        new ROM({ name: '01.02.08_right.u2', merge: '01.02.08_right.u2', bios: 'us13', size: 1048576, crc32: 'aaaeac8c', sha1: 'a565e5fcb4f55f31e7d36be40eec234248a66efd' }),
        new ROM({ name: '01.02.08_left.u3', merge: '01.02.08_left.u3', bios: 'us13', size: 1048576, crc32: 'f29fd1bf', sha1: '33e043d2616e10a1c7a0936c3d208f9bcc2ca6f3' }),
        new ROM({ name: '06.03.04_right.u2', merge: '06.03.04_right.u2', bios: 'set-us1', size: 1048576, crc32: '6f5f5ef1', sha1: '70a43fba4de47ed8dcf38b25eafd5873f3428e72' }),
        new ROM({ name: '06.03.04_left.u3', merge: '06.03.04_left.u3', bios: 'set-us1', size: 1048576, crc32: '7034f26b', sha1: '7be78f23bec38d05240cdfe1186ec0c8291f5a1c' }),
        new ROM({ name: '06.03.03_right.u2', merge: '06.03.03_right.u2', bios: 'set-us2', size: 1048576, crc32: '98763498', sha1: '246e95cc12eb34f946b2f4938c59217718f6d841' }),
        new ROM({ name: '06.03.03_left.u3', merge: '06.03.03_left.u3', bios: 'set-us2', size: 1048576, crc32: 'a6924238', sha1: 'b71ab39bf9c1fdbab556028138749e8c040ec83c' }),
        new ROM({ name: '06.02.20_right.u83', merge: '06.02.20_right.u83', bios: 'set-us3', size: 1048576, crc32: 'e4001f60', sha1: '5da34efb1ac0f7c84a48e09363d20cfecda4bcf1' }),
        new ROM({ name: '06.02.20_left.u70', merge: '06.02.20_left.u70', bios: 'set-us3', size: 1048576, crc32: '199ed3b9', sha1: 'e3ee81ffd713f09e35a10c38e4f59282e2c5cd30' }),
        new ROM({ name: '06.02.04_right.u2', merge: '06.02.04_right.u2', bios: 'set-us4', size: 1048576, crc32: '1cf5a853', sha1: '64d17efcce702df7a0b0e151293199478e25226d' }),
        new ROM({ name: '06.02.04_left.u3', merge: '06.02.04_left.u3', bios: 'set-us4', size: 1048576, crc32: '117b75f2', sha1: '2129286853d3c50b8a943b71334d4ef6b98adc05' }),
        new ROM({ name: '10219211.u86', size: 4194304, crc32: 'a1c71dd2', sha1: '9a859df876cf6a2fadcc5ae7183021881dc08887' }),
        new ROM({ name: '10219211.u73', size: 4194304, crc32: 'da7d2ed7', sha1: '1f81cad150c013848988e6f995a45f7ea5c6d95c' }),
      ],
      deviceRef: [
        new DeviceRef('sh4le'),
        new DeviceRef('ns16550'),
        new DeviceRef('ns16550'),
        new DeviceRef('93c56_16'),
        new DeviceRef('screen'),
        new DeviceRef('palette'),
      ],
    }),
    new Machine({
      name: '100lionsa',
      cloneOf: '100lions',
      romOf: '100lions',
      description: '100 Lions (30223811, ASP)',
      rom: [
        new ROM({ name: '24013001_right.u83', merge: '24013001_right.u83', bios: 'au-nsw1', size: 2097152, crc32: 'e97afedf', sha1: '10ca3b015afaff5d7812f0f5207b2535602136a5' }),
        new ROM({ name: '24013001_left.u70', merge: '24013001_left.u70', bios: 'au-nsw1', size: 2097152, crc32: '06ae7e07', sha1: '39a45575b66906d73b519988d1001c99b05c5f34' }),
        new ROM({ name: '21012901_right.u83', merge: '21012901_right.u83', bios: 'au-nsw2', size: 2097152, crc32: '757618f2', sha1: '43f9a3e7d544979f8c6974945914d9e099b02abd' }),
        new ROM({ name: '21012901_left.u70', merge: '21012901_left.u70', bios: 'au-nsw2', size: 2097152, crc32: '0d271470', sha1: '5cd4b604bfe2fd7e9a8d08e1c7c97f17ae068479' }),
        new ROM({ name: '19012801_right.u83', merge: '19012801_right.u83', bios: 'au-nsw3', size: 2097152, crc32: '5b20a96c', sha1: '5fd916b7cc2cdd51bf7dd212c1114f94dc9c7926' }),
        new ROM({ name: '19012801_left.u70', merge: '19012801_left.u70', bios: 'au-nsw3', size: 2097152, crc32: 'b03bd17c', sha1: 'f281e80f6dda5b727ed71d2deebe3b0ff548773f' }),
        new ROM({ name: '13012001_right.u83', merge: '13012001_right.u83', bios: 'au-nsw4', size: 2097152, crc32: 'e627dbfa', sha1: '4fedbe0975ceb7dc0ebebf18a7708d78984db9b7' }),
        new ROM({ name: '13012001_left.u70', merge: '13012001_left.u70', bios: 'au-nsw4', size: 2097152, crc32: '38e8f659', sha1: '88c6acba99b0aca023c6f4d27c061c231490e9e0' }),
        new ROM({ name: '11011901_right.u83', merge: '11011901_right.u83', bios: 'au-nsw5', size: 2097152, crc32: '73dcb11c', sha1: '69ae4f32a0c9141b2a82ff3935b0cd20333d2964' }),
        new ROM({ name: '11011901_left.u70', merge: '11011901_left.u70', bios: 'au-nsw5', size: 2097152, crc32: 'd3dd2210', sha1: '3548f8cc39859d3f44a55f6bae48966a2d48e0eb' }),
        new ROM({ name: '11011501_right.u83', merge: '11011501_right.u83', bios: 'au-nsw6', size: 2097152, crc32: 'de4c3aed', sha1: '21596a2edd20eb7de7a4ec8900a270b09c8f326f' }),
        new ROM({ name: '11011501_left.u70', merge: '11011501_left.u70', bios: 'au-nsw6', size: 2097152, crc32: 'c5cc3461', sha1: '5b43c4cb6110a6ccf67cd0f3789253f6872b20c4' }),
        new ROM({ name: '09011001_right.u83', merge: '09011001_right.u83', bios: 'au-nsw7', size: 2097152, crc32: '8a853f80', sha1: '9a75498f7b02c81a483b4e1c158f35f0ee4c0112' }),
        new ROM({ name: '09011001_left.u70', merge: '09011001_left.u70', bios: 'au-nsw7', size: 2097152, crc32: '229c2e63', sha1: '91fd2b1acb69efe073647e93db9f11042add2feb' }),
        new ROM({ name: '07010801_right.u83', merge: '07010801_right.u83', bios: 'au-nsw8', size: 2097152, crc32: '8c148c11', sha1: '5ff3be18455b4f04675fec8d5b9d881295c65e23' }),
        new ROM({ name: '07010801_left.u70', merge: '07010801_left.u70', bios: 'au-nsw8', size: 2097152, crc32: '8e92af68', sha1: '00d2bb655b7964a9652896741210ec534df0b0d2' }),
        new ROM({ name: '05010601_right.u83', merge: '05010601_right.u83', bios: 'au-nsw9', size: 1048576, crc32: 'c12eac11', sha1: '683b9ddc323865ace7dca37d13b55de6e42759a5' }),
        new ROM({ name: '05010601_left.u70', merge: '05010601_left.u70', bios: 'au-nsw9', size: 1048576, crc32: 'b3e6b4a0', sha1: '3bf398c9257579f8e51ce716d6ebfa74fa510273' }),
        new ROM({ name: '04010501_right.u83', merge: '04010501_right.u83', bios: 'au-nsw10', size: 1048576, crc32: '3daefb7a', sha1: '411471713219f4bab5ccf5fe7a12a6c138c8c550' }),
        new ROM({ name: '04010501_left.u70', merge: '04010501_left.u70', bios: 'au-nsw10', size: 1048576, crc32: '21182775', sha1: '7c5b7f5aba3babc85f512a8f7d4ebc0d83eb842a' }),
        new ROM({ name: '03010301.u84', merge: '03010301.u84', bios: 'au-nsw11', size: 1048576, crc32: 'a34a9f16', sha1: 'b8750e6ceb1715da8e5ac2f0183254e29a042641' }),
        new ROM({ name: '03010301.u71', merge: '03010301.u71', bios: 'au-nsw11', size: 1048576, crc32: 'd793440a', sha1: 'dced4c04bde13293af77a9a1f4c5c606e3758de0' }),
        new ROM({ name: '03010301.u83', merge: '03010301.u83', bios: 'au-nsw11', size: 1048576, crc32: 'c8580554', sha1: '58b8bfff2f8d298c4e3be2b01900800c45fa7ad7' }),
        new ROM({ name: '03010301.u70', merge: '03010301.u70', bios: 'au-nsw11', size: 1048576, crc32: '5ae69121', sha1: '36dd3f9aaf5f7d2751d1954d67f898bc3ec71f3b' }),
        new ROM({ name: '02010201.u84', merge: '02010201.u84', bios: 'au-nsw12', size: 1048576, crc32: '0920930f', sha1: '771b0f62442d1c75b1bb59ad82365b7ab8747173' }),
        new ROM({ name: '02010201.u71', merge: '02010201.u71', bios: 'au-nsw12', size: 1048576, crc32: '24d5614a', sha1: 'fdcf3826dccc72b74b66379b1411cf211d5a1670' }),
        new ROM({ name: '02010201.u83', merge: '02010201.u83', bios: 'au-nsw12', size: 1048576, crc32: '5f64a20c', sha1: '397404ab6d2a1aa3c1fc77bb9421fef7079b65a5' }),
        new ROM({ name: '02010201.u70', merge: '02010201.u70', bios: 'au-nsw12', size: 1048576, crc32: '9b2db442', sha1: 'd512398a2d9257bd385dc50d61c63cd1a47300ba' }),
        new ROM({ name: '02010114.u84', merge: '02010114.u84', bios: 'au-nsw13', size: 1048576, crc32: '183e3836', sha1: '4c802d0cd010bc007acb3a83e37aaa29b2d13d87' }),
        new ROM({ name: '02010114.u71', merge: '02010114.u71', bios: 'au-nsw13', size: 1048576, crc32: '8f83c3dd', sha1: 'a5f9d80b4b515b24299d0241e1665cfd9da8bab7' }),
        new ROM({ name: '02010114.u83', merge: '02010114.u83', bios: 'au-nsw13', size: 1048576, crc32: '945104d7', sha1: 'e372d0cf889c72b5d001b26fe4a925a28486537f' }),
        new ROM({ name: '02010114.u70', merge: '02010114.u70', bios: 'au-nsw13', size: 1048576, crc32: '3ba4379f', sha1: '84367f12c4c9224d2ab9cae83ae8727de338408c' }),
        new ROM({ name: '25012805_right.u83', merge: '25012805_right.u83', bios: 'au-qld1', size: 2097152, crc32: '2ecd8da8', sha1: '389e9668b2ba4fffed5d2721b2ce70d502fb9f67' }),
        new ROM({ name: '25012805_left.u70', merge: '25012805_left.u70', bios: 'au-qld1', size: 2097152, crc32: '996f32ce', sha1: 'cf21bef745986fcbd298167453c7b8e5945ce602' }),
        new ROM({ name: '20012605_right.u83', merge: '20012605_right.u83', bios: 'au-qld2', size: 2097152, crc32: '045b82ad', sha1: 'b8e4f9f826970d83ae5fd2f2898de12ad1bf2d24' }),
        new ROM({ name: '20012605_left.u70', merge: '20012605_left.u70', bios: 'au-qld2', size: 2097152, crc32: '87331111', sha1: '6cdc2d81f68de23af18a975a6f27ddec246be405' }),
        new ROM({ name: '20012305_right.u83', merge: '20012305_right.u83', bios: 'au-qld3', size: 2097152, crc32: 'e436c1f5', sha1: '62ee529cc971fd76aa2ccc15778e3f0c40e3e47f' }),
        new ROM({ name: '20012305_left.u70', merge: '20012305_left.u70', bios: 'au-qld3', size: 2097152, crc32: 'ea8961cc', sha1: '0ebc7c3b94a6e01ee984af4711043130d9670bd3' }),
        new ROM({ name: '14011605_right.u83', merge: '14011605_right.u83', bios: 'au-qld4', size: 2097152, crc32: '2bec5b74', sha1: '854733cada75e632f01f7096d4740ed4941a3d5b' }),
        new ROM({ name: '14011605_left.u70', merge: '14011605_left.u70', bios: 'au-qld4', size: 2097152, crc32: 'cd26d4f0', sha1: '40822714abf08aeb08d827dbd8cd099f86803754' }),
        new ROM({ name: '04041205_right.u83', merge: '04041205_right.u83', bios: 'au-qld5', size: 1048576, crc32: 'ca6bc86c', sha1: '69fe7fc35694e4cd7f861bff4ec3a6165a81df6e' }),
        new ROM({ name: '04041205_left.u70', merge: '04041205_left.u70', bios: 'au-qld5', size: 1048576, crc32: 'dfb9a119', sha1: '814a5a7877392aec4e4871d7f0e19d2fbd717409' }),
        new ROM({ name: '03130334_right.u83', merge: '03130334_right.u83', bios: 'au-qld6', size: 2097152, crc32: 'bce3d97f', sha1: 'da36377cc1465022a2434703adee63bf48c71a9c' }),
        new ROM({ name: '03130334_left.u70', merge: '03130334_left.u70', bios: 'au-qld6', size: 2097152, crc32: '02175fde', sha1: '4e9a9e1e803a0c84b06aec99dc3147dd7a919eee' }),
        new ROM({ name: '01040505.u84', merge: '01040505.u84', bios: 'au-qld7', size: 1048576, crc32: 'cf5a9d1e', sha1: '0ebba478fc883831d70b0fa95f43e5f93b07ae9e' }),
        new ROM({ name: '01040505.u71', merge: '01040505.u71', bios: 'au-qld7', size: 1048576, crc32: 'f56ea77e', sha1: '319be1bee66a289e2c1f6beec07758f79aa0cf16' }),
        new ROM({ name: '01040505.u83', merge: '01040505.u83', bios: 'au-qld7', size: 1048576, crc32: '90f32169', sha1: '228be8b4a9eb6b2acf7f7a7561bd194009936026' }),
        new ROM({ name: '01040505.u70', merge: '01040505.u70', bios: 'au-qld7', size: 1048576, crc32: 'b9ddea66', sha1: 'f4bfdeada39a3f0094d6468b7374a34f88f5df7f' }),
        new ROM({ name: '03030708_right.u83', merge: '03030708_right.u83', bios: 'au-sa1', size: 1048576, crc32: 'b4b3c6a5', sha1: '5747f98a6eaa5c24a23d1d76a28b33a3bfbbfd1f' }),
        new ROM({ name: '03030708_left.u70', merge: '03030708_left.u70', bios: 'au-sa1', size: 1048576, crc32: '4e5ad823', sha1: '77ab1c29c6172cfdcef776222a72b2b44114d4da' }),
        new ROM({ name: '14011913_right.u83', merge: '14011913_right.u83', bios: 'nz1', size: 2097152, crc32: '01d13b89', sha1: 'b1013366d0803dfbec5a5f90f6a5cea862de0513' }),
        new ROM({ name: '14011913_left.u70', merge: '14011913_left.u70', bios: 'nz1', size: 2097152, crc32: '9a4cefdf', sha1: '6c15bc565ede8af19361d60ee1e6657a8055c92c' }),
        new ROM({ name: '14010152_right.u83', merge: '14010152_right.u83', bios: 'nz2', size: 2097152, crc32: '7e3f61f6', sha1: '1e27d72c35b0c633187159ef434f22398df28882' }),
        new ROM({ name: '14010152_left.u70', merge: '14010152_left.u70', bios: 'nz2', size: 2097152, crc32: '2716e1ef', sha1: '81fe1ae4f9cd1bcb24795ce85913ee22ed0fabcd' }),
        new ROM({ name: '02061013_right.u83', merge: '02061013_right.u83', bios: 'nz3', size: 1048576, crc32: '7a8619a5', sha1: 'bd03ddb68817c1660b009e102ccf69e5b603b875' }),
        new ROM({ name: '02061013_left.u70', merge: '02061013_left.u70', bios: 'nz3', size: 1048576, crc32: 'e70a7007', sha1: '0935f924866162d9c0fbdbb99391cbf730a04b76' }),
        new ROM({ name: '02060913_right.u83', merge: '02060913_right.u83', bios: 'nz4', size: 1048576, crc32: '31068c41', sha1: '962da0079495a64f7ffb34be643892c272017cc9' }),
        new ROM({ name: '02060913_left.u70', merge: '02060913_left.u70', bios: 'nz4', size: 1048576, crc32: 'd6a6713c', sha1: '0f3bb2746f1a6fa6a587fd50827299408a3b28d2' }),
        new ROM({ name: '15011025_right.u83', merge: '15011025_right.u83', bios: 'my', size: 2097152, crc32: 'bf21a975', sha1: 'a251b1a7342387300689cd50fe4ce7975b903ac5' }),
        new ROM({ name: '15011025_left.u70', merge: '15011025_left.u70', bios: 'my', size: 2097152, crc32: 'c02e14b0', sha1: '6bf98927813519dfe60e582dbe5be3ccd87f7c91' }),
        new ROM({ name: '24010467_right.u83', merge: '24010467_right.u83', bios: 'afr', size: 2097152, crc32: 'eddeff13', sha1: '77ccbcf40aeb7305eb13d6d24efafd09955f1eac' }),
        new ROM({ name: '24010467_left.u70', merge: '24010467_left.u70', bios: 'afr', size: 2097152, crc32: '9093d820', sha1: '05bb14895e3077d277a1d0822036d08f359c0307' }),
        new ROM({ name: '01.04.11_right.u83', merge: '01.04.11_right.u83', bios: 'us1', size: 2097152, crc32: '2dae8ca0', sha1: '7a0fb38b4c1ac7195d15bdab6f0cfb16c78430f0' }),
        new ROM({ name: '01.04.11_left.u70', merge: '01.04.11_left.u70', bios: 'us1', size: 2097152, crc32: '787f2b07', sha1: '2548289e44f4b935346b759afb5383bdbac04c3e' }),
        new ROM({ name: '01.04.10_right.u83', merge: '01.04.10_right.u83', bios: 'us2', size: 2097152, crc32: '82ce2fcc', sha1: '4c8fb3db084a67e99d1420b3f895a06ce9ef5ec2' }),
        new ROM({ name: '01.04.10_left.u70', merge: '01.04.10_left.u70', bios: 'us2', size: 2097152, crc32: '9d9d52c1', sha1: 'b957220cdbedd516c219d1bfc28807ce466df93f' }),
        new ROM({ name: '01.04.08_right.u83', merge: '01.04.08_right.u83', bios: 'us3', size: 2097152, crc32: '95333304', sha1: '7afe49d6c5e4d6820f349778557daa88c5366a51' }),
        new ROM({ name: '01.04.08_left.u70', merge: '01.04.08_left.u70', bios: 'us3', size: 2097152, crc32: '0dfcad10', sha1: '53798be000304aed38909f5fd8470a68bedd8229' }),
        new ROM({ name: '01.04.07_right.u83', merge: '01.04.07_right.u83', bios: 'us4', size: 2097152, crc32: '23c28e22', sha1: '98f24a1f86232b6c2c288a61ec7d60c867f192e5' }),
        new ROM({ name: '01.04.07_left.u70', merge: '01.04.07_left.u70', bios: 'us4', size: 2097152, crc32: 'acfb0fe0', sha1: 'b1a772d7978e6ff4406a5bb39a71cb3f89608e72' }),
        new ROM({ name: '01.04.04_right.u83', merge: '01.04.04_right.u83', bios: 'us5', size: 2097152, crc32: 'e57ba02d', sha1: '8e29403e6b619eeab41dc171221720bc7820ccdc' }),
        new ROM({ name: '01.04.04_left.u70', merge: '01.04.04_left.u70', bios: 'us5', size: 2097152, crc32: 'b984a92c', sha1: '90f7a61302caee40195c08565bdac856a3234c1d' }),
        new ROM({ name: '01.03.17_right.u83', merge: '01.03.17_right.u83', bios: 'us6', size: 2097152, crc32: '1582714b', sha1: '92d0a15314ffe526159bef9a364898dd1ebdfde7' }),
        new ROM({ name: '01.03.17_left.u70', merge: '01.03.17_left.u70', bios: 'us6', size: 2097152, crc32: 'a88193dc', sha1: 'c9e1d483edaecd318d2e5fc8a54e84516c93e0ca' }),
        new ROM({ name: '01.03.14_right.u83', merge: '01.03.14_right.u83', bios: 'us7', size: 2097152, crc32: '889ffd82', sha1: '9c98c9cdcf5f7d05095f11006418133029e9f0f8' }),
        new ROM({ name: '01.03.14_left.u70', merge: '01.03.14_left.u70', bios: 'us7', size: 2097152, crc32: '7138fec4', sha1: 'f81331d1875ac574d3e6c98be218ff25c6c7be5a' }),
        new ROM({ name: '01.03.07_right.u83', merge: '01.03.07_right.u83', bios: 'us8', size: 2097152, crc32: '2ebccc4e', sha1: '9342724e4451e9ab24ceae208284b50abd4f0be3' }),
        new ROM({ name: '01.03.07_left.u70', merge: '01.03.07_left.u70', bios: 'us8', size: 2097152, crc32: 'a3632da4', sha1: '1c96a88e86095b81801ab88e36a4cdfa4b893265' }),
        new ROM({ name: '01.03.06_right.u83', merge: '01.03.06_right.u83', bios: 'us9', size: 2097152, crc32: 'bd48ca55', sha1: '8fb1576cbeb1c64c358880714740195d2e73e03e' }),
        new ROM({ name: '01.03.06_left.u70', merge: '01.03.06_left.u70', bios: 'us9', size: 2097152, crc32: '2f9d9a29', sha1: 'fdebfaca9a579d7249379f19aef22fbfd66bf943' }),
        new ROM({ name: '01.03.05_right.u83', merge: '01.03.05_right.u83', bios: 'us10', size: 2097152, crc32: '2c7f1ec3', sha1: 'd03167f43ed6f9596080d91472695829378cef0a' }),
        new ROM({ name: '01.03.05_left.u70', merge: '01.03.05_left.u70', bios: 'us10', size: 2097152, crc32: '0095e3f9', sha1: 'd2e8786158b1ab0a614aab21cf1d14cbc04754af' }),
        new ROM({ name: '01.03.03e_right.u83', merge: '01.03.03e_right.u83', bios: 'us11', size: 2097152, crc32: '2255e263', sha1: '5e9e093aaa17172f47a14c3baf7f6f0f73b19398' }),
        new ROM({ name: '01.03.03e_left.u70', merge: '01.03.03e_left.u70', bios: 'us11', size: 2097152, crc32: 'ea50729a', sha1: '14b5a71bfb91ac366ddcb5f77fb54127808f8163' }),
        new ROM({ name: '01.03.03a_right.u83', merge: '01.03.03a_right.u83', bios: 'us12', size: 2097152, crc32: '253415f4', sha1: '50dc77ad87bc6be1932dda2fd4865602c8c49729' }),
        new ROM({ name: '01.03.03a_left.u70', merge: '01.03.03a_left.u70', bios: 'us12', size: 2097152, crc32: '4ab5dd40', sha1: 'a6812cc624e6a98ea7b0697e2797fe10ba8e303e' }),
        new ROM({ name: '01.02.08_right.u2', merge: '01.02.08_right.u2', bios: 'us13', size: 1048576, crc32: 'aaaeac8c', sha1: 'a565e5fcb4f55f31e7d36be40eec234248a66efd' }),
        new ROM({ name: '01.02.08_left.u3', merge: '01.02.08_left.u3', bios: 'us13', size: 1048576, crc32: 'f29fd1bf', sha1: '33e043d2616e10a1c7a0936c3d208f9bcc2ca6f3' }),
        new ROM({ name: '06.03.04_right.u2', merge: '06.03.04_right.u2', bios: 'set-us1', size: 1048576, crc32: '6f5f5ef1', sha1: '70a43fba4de47ed8dcf38b25eafd5873f3428e72' }),
        new ROM({ name: '06.03.04_left.u3', merge: '06.03.04_left.u3', bios: 'set-us1', size: 1048576, crc32: '7034f26b', sha1: '7be78f23bec38d05240cdfe1186ec0c8291f5a1c' }),
        new ROM({ name: '06.03.03_right.u2', merge: '06.03.03_right.u2', bios: 'set-us2', size: 1048576, crc32: '98763498', sha1: '246e95cc12eb34f946b2f4938c59217718f6d841' }),
        new ROM({ name: '06.03.03_left.u3', merge: '06.03.03_left.u3', bios: 'set-us2', size: 1048576, crc32: 'a6924238', sha1: 'b71ab39bf9c1fdbab556028138749e8c040ec83c' }),
        new ROM({ name: '06.02.20_right.u83', merge: '06.02.20_right.u83', bios: 'set-us3', size: 1048576, crc32: 'e4001f60', sha1: '5da34efb1ac0f7c84a48e09363d20cfecda4bcf1' }),
        new ROM({ name: '06.02.20_left.u70', merge: '06.02.20_left.u70', bios: 'set-us3', size: 1048576, crc32: '199ed3b9', sha1: 'e3ee81ffd713f09e35a10c38e4f59282e2c5cd30' }),
        new ROM({ name: '06.02.04_right.u2', merge: '06.02.04_right.u2', bios: 'set-us4', size: 1048576, crc32: '1cf5a853', sha1: '64d17efcce702df7a0b0e151293199478e25226d' }),
        new ROM({ name: '06.02.04_left.u3', merge: '06.02.04_left.u3', bios: 'set-us4', size: 1048576, crc32: '117b75f2', sha1: '2129286853d3c50b8a943b71334d4ef6b98adc05' }),
        new ROM({ name: '30223811.u86', size: 4194304, crc32: '735285e1', sha1: '964dd5ceeb6604620bc1293559d51b2abd9afd87' }),
        new ROM({ name: '30223811.u73', size: 4194304, crc32: '8e34e360', sha1: '84c287973a61f4ca39b9c367a6b547d4e8210e4e' }),
      ],
      deviceRef: [
        new DeviceRef('sh4le'),
        new DeviceRef('ns16550'),
        new DeviceRef('ns16550'),
        new DeviceRef('93c56_16'),
        new DeviceRef('screen'),
        new DeviceRef('palette'),
      ],
    }),

    new Machine({
      // Game with multiple clones, where clones have duplicate filenames with different checksums
      // (3.bin)
      name: '1942',
      description: '1942 (Revision B)',
      rom: [
        new ROM({ name: 'srb-03.m3', size: 16384, crc32: 'd9dafcc3', sha1: 'a089a9bc55fb7d6d0ac53f91b258396d5d62677a' }),
        new ROM({ name: 'srb-04.m4', size: 16384, crc32: 'da0cf924', sha1: '856fbb302c9a4ec7850a26ab23dab8467f79bba4' }),
        new ROM({ name: 'srb-05.m5', size: 16384, crc32: 'd102911c', sha1: '35ba1d82bd901940f61d8619273463d02fc0a952' }),
        new ROM({ name: 'srb-06.m6', size: 8192, crc32: '466f8248', sha1: '2ccc8fc59962d3001fbc10e8d2f20a254a74f251' }),
        new ROM({ name: 'srb-07.m7', size: 16384, crc32: '0d31038c', sha1: 'b588eaf6fddd66ecb2d9832dc197f286f1ccd846' }),
        new ROM({ name: 'sr-01.c11', size: 16384, crc32: 'bd87f06b', sha1: '821f85cf157f81117eeaba0c3cf0337eac357e58' }),
        new ROM({ name: 'sr-02.f2', size: 8192, crc32: '6ebca191', sha1: '0dbddadde54a0ab66994c4a8726be05c6ca88a0e' }),
        new ROM({ name: 'sr-08.a1', size: 8192, crc32: '3884d9eb', sha1: '5cbd9215fa5ba5a61208b383700adc4428521aed' }),
        new ROM({ name: 'sr-09.a2', size: 8192, crc32: '999cf6e0', sha1: '5b8b685038ec98b781908b92eb7fb9506db68544' }),
        new ROM({ name: 'sr-10.a3', size: 8192, crc32: '8edb273a', sha1: '85fdd4c690ed31e6396e3c16aa02140ee7ea2d61' }),
        new ROM({ name: 'sr-11.a4', size: 8192, crc32: '3a2726c3', sha1: '187c92ef591febdcbd1d42ab850e0cbb62c00873' }),
        new ROM({ name: 'sr-12.a5', size: 8192, crc32: '1bd3d8bb', sha1: 'ef4dce605eb4dc8035985a415315ec61c21419c6' }),
        new ROM({ name: 'sr-13.a6', size: 8192, crc32: '658f02c4', sha1: 'f087d69e49e38cf3107350cde18fcf85a8fa04f0' }),
        new ROM({ name: 'sr-14.l1', size: 16384, crc32: '2528bec6', sha1: '29f7719f18faad6bd1ec6735cc24e69168361470' }),
        new ROM({ name: 'sr-15.l2', size: 16384, crc32: 'f89287aa', sha1: '136fff6d2a4f48a488fc7c620213761459c3ada0' }),
        new ROM({ name: 'sr-16.n1', size: 16384, crc32: '024418f8', sha1: '145b8d5d6c8654cd090955a98f6dd8c8dbafe7c1' }),
        new ROM({ name: 'sr-17.n2', size: 16384, crc32: 'e2c7e489', sha1: 'd4b5d575c021f58f6966df189df94e08c5b3621c' }),
        new ROM({ name: 'sb-5.e8', size: 256, crc32: '93ab8153', sha1: 'a792f24e5c0c3c4a6b436102e7a98199f878ece1' }),
        new ROM({ name: 'sb-6.e9', size: 256, crc32: '8ab44f7d', sha1: 'f74680a6a987d74b3acb32e6396f20e127874149' }),
        new ROM({ name: 'sb-7.e10', size: 256, crc32: 'f4ade9a4', sha1: '62ad31d31d183cce213b03168daa035083b2f28e' }),
        new ROM({ name: 'sb-0.f1', size: 256, crc32: '6047d91b', sha1: '1ce025f9524c1033e48c5294ee7d360f8bfebe8d' }),
        new ROM({ name: 'sb-4.d6', size: 256, crc32: '4858968d', sha1: '20b5dbcaa1a4081b3139e7e2332d8fe3c9e55ed6' }),
        new ROM({ name: 'sb-8.k3', size: 256, crc32: 'f6fad943', sha1: 'b0a24ea7805272e8ebf72a99b08907bc00d5f82f' }),
        new ROM({ name: 'sb-2.d1', size: 256, crc32: '8bb8b3df', sha1: '49de2819c4c92057fedcb20425282515d85829aa' }),
        new ROM({ name: 'sb-3.d2', size: 256, crc32: '3b0c99af', sha1: '38f30ac1e48632634e409f328ee3051b987de7ad' }),
        new ROM({ name: 'sb-1.k6', size: 256, crc32: '712ac508', sha1: '5349d722ab6733afdda65f6e0a98322f0d515e86' }),
        new ROM({ name: 'sb-9.m11', size: 256, crc32: '4921635c', sha1: 'aee37d6cdc36acf0f11ff5f93e7b16e4b12f6c39' }),
      ],
      deviceRef: [
        new DeviceRef('z80'),
        new DeviceRef('timer'),
        new DeviceRef('z80'),
        new DeviceRef('gfxdecode'),
        new DeviceRef('palette'),
        new DeviceRef('screen'),
        new DeviceRef('speaker'),
        new DeviceRef('generic_latch_8'),
        new DeviceRef('ay8910'),
        new DeviceRef('ay8910'),
        new DeviceRef('netlist_sound'),
        new DeviceRef('nl_stream_in'),
        new DeviceRef('nl_stream_in'),
        new DeviceRef('nl_stream_in'),
        new DeviceRef('nl_stream_in'),
        new DeviceRef('nl_stream_in'),
        new DeviceRef('nl_stream_in'),
        new DeviceRef('nl_stream_out'),
      ],
    }),
    new Machine({
      name: '1942a',
      cloneOf: '1942',
      romOf: '1942',
      description: '1942 (Revision A)',
      rom: [
        new ROM({ name: 'sra-03.m3', size: 16384, crc32: '40201bab', sha1: '4886c07a4602223c21419118e10aadce9c99fa5a' }),
        new ROM({ name: 'sr-04.m4', size: 16384, crc32: 'a60ac644', sha1: 'f37862db3cf5e6cc9ab3276f3bc45fd629fd70dd' }),
        new ROM({ name: 'sr-05.m5', size: 16384, crc32: '835f7b24', sha1: '24b66827f08c43fbf5b9517d638acdfc38e1b1e7' }),
        new ROM({ name: 'sr-06.m6', size: 8192, crc32: '821c6481', sha1: '06becb6bf8b4bde3a458098498eecad566a87711' }),
        new ROM({ name: 'sr-07.m7', size: 16384, crc32: '5df525e1', sha1: '70cd2910e2945db76bd6ebfa0ff09a5efadc2d0b' }),
        new ROM({ name: 'sr-01.c11', merge: 'sr-01.c11', size: 16384, crc32: 'bd87f06b', sha1: '821f85cf157f81117eeaba0c3cf0337eac357e58' }),
        new ROM({ name: 'sr-02.f2', merge: 'sr-02.f2', size: 8192, crc32: '6ebca191', sha1: '0dbddadde54a0ab66994c4a8726be05c6ca88a0e' }),
        new ROM({ name: 'sr-08.a1', merge: 'sr-08.a1', size: 8192, crc32: '3884d9eb', sha1: '5cbd9215fa5ba5a61208b383700adc4428521aed' }),
        new ROM({ name: 'sr-09.a2', merge: 'sr-09.a2', size: 8192, crc32: '999cf6e0', sha1: '5b8b685038ec98b781908b92eb7fb9506db68544' }),
        new ROM({ name: 'sr-10.a3', merge: 'sr-10.a3', size: 8192, crc32: '8edb273a', sha1: '85fdd4c690ed31e6396e3c16aa02140ee7ea2d61' }),
        new ROM({ name: 'sr-11.a4', merge: 'sr-11.a4', size: 8192, crc32: '3a2726c3', sha1: '187c92ef591febdcbd1d42ab850e0cbb62c00873' }),
        new ROM({ name: 'sr-12.a5', merge: 'sr-12.a5', size: 8192, crc32: '1bd3d8bb', sha1: 'ef4dce605eb4dc8035985a415315ec61c21419c6' }),
        new ROM({ name: 'sr-13.a6', merge: 'sr-13.a6', size: 8192, crc32: '658f02c4', sha1: 'f087d69e49e38cf3107350cde18fcf85a8fa04f0' }),
        new ROM({ name: 'sr-14.l1', merge: 'sr-14.l1', size: 16384, crc32: '2528bec6', sha1: '29f7719f18faad6bd1ec6735cc24e69168361470' }),
        new ROM({ name: 'sr-15.l2', merge: 'sr-15.l2', size: 16384, crc32: 'f89287aa', sha1: '136fff6d2a4f48a488fc7c620213761459c3ada0' }),
        new ROM({ name: 'sr-16.n1', merge: 'sr-16.n1', size: 16384, crc32: '024418f8', sha1: '145b8d5d6c8654cd090955a98f6dd8c8dbafe7c1' }),
        new ROM({ name: 'sr-17.n2', merge: 'sr-17.n2', size: 16384, crc32: 'e2c7e489', sha1: 'd4b5d575c021f58f6966df189df94e08c5b3621c' }),
        new ROM({ name: 'sb-5.e8', merge: 'sb-5.e8', size: 256, crc32: '93ab8153', sha1: 'a792f24e5c0c3c4a6b436102e7a98199f878ece1' }),
        new ROM({ name: 'sb-6.e9', merge: 'sb-6.e9', size: 256, crc32: '8ab44f7d', sha1: 'f74680a6a987d74b3acb32e6396f20e127874149' }),
        new ROM({ name: 'sb-7.e10', merge: 'sb-7.e10', size: 256, crc32: 'f4ade9a4', sha1: '62ad31d31d183cce213b03168daa035083b2f28e' }),
        new ROM({ name: 'sb-0.f1', merge: 'sb-0.f1', size: 256, crc32: '6047d91b', sha1: '1ce025f9524c1033e48c5294ee7d360f8bfebe8d' }),
        new ROM({ name: 'sb-4.d6', merge: 'sb-4.d6', size: 256, crc32: '4858968d', sha1: '20b5dbcaa1a4081b3139e7e2332d8fe3c9e55ed6' }),
        new ROM({ name: 'sb-8.k3', merge: 'sb-8.k3', size: 256, crc32: 'f6fad943', sha1: 'b0a24ea7805272e8ebf72a99b08907bc00d5f82f' }),
        new ROM({ name: 'sb-2.d1', merge: 'sb-2.d1', size: 256, crc32: '8bb8b3df', sha1: '49de2819c4c92057fedcb20425282515d85829aa' }),
        new ROM({ name: 'sb-3.d2', merge: 'sb-3.d2', size: 256, crc32: '3b0c99af', sha1: '38f30ac1e48632634e409f328ee3051b987de7ad' }),
        new ROM({ name: 'sb-1.k6', merge: 'sb-1.k6', size: 256, crc32: '712ac508', sha1: '5349d722ab6733afdda65f6e0a98322f0d515e86' }),
        new ROM({ name: 'sb-9.m11', merge: 'sb-9.m11', size: 256, crc32: '4921635c', sha1: 'aee37d6cdc36acf0f11ff5f93e7b16e4b12f6c39' }),
      ],
      deviceRef: [
        new DeviceRef('z80'),
        new DeviceRef('timer'),
        new DeviceRef('z80'),
        new DeviceRef('gfxdecode'),
        new DeviceRef('palette'),
        new DeviceRef('screen'),
        new DeviceRef('speaker'),
        new DeviceRef('generic_latch_8'),
        new DeviceRef('ay8910'),
        new DeviceRef('ay8910'),
        new DeviceRef('netlist_sound'),
        new DeviceRef('nl_stream_in'),
        new DeviceRef('nl_stream_in'),
        new DeviceRef('nl_stream_in'),
        new DeviceRef('nl_stream_in'),
        new DeviceRef('nl_stream_in'),
        new DeviceRef('nl_stream_in'),
        new DeviceRef('nl_stream_out'),
      ],
    }),
    new Machine({
      name: '1942abl',
      cloneOf: '1942',
      romOf: '1942',
      description: '1942 (Revision A, bootleg)',
      rom: [
        new ROM({ name: '3.bin', size: 32768, crc32: 'f3184f5a', sha1: 'a566c344ee1f63580d41aca95ece9ad1f7a135d2' }),
        new ROM({ name: '5.bin', size: 16384, crc32: '835f7b24', sha1: '24b66827f08c43fbf5b9517d638acdfc38e1b1e7' }),
        new ROM({ name: '7.bin', size: 32768, crc32: '2f456c6e', sha1: 'b728c72f97ccdb57a4aac53ef7ca3f4516fc2ecb' }),
        new ROM({ name: '1.bin', merge: 'sr-01.c11', size: 16384, crc32: 'bd87f06b', sha1: '821f85cf157f81117eeaba0c3cf0337eac357e58' }),
        new ROM({ name: '2.bin', merge: 'sr-02.f2', size: 8192, crc32: '6ebca191', sha1: '0dbddadde54a0ab66994c4a8726be05c6ca88a0e' }),
        new ROM({ name: '9.bin', size: 16384, crc32: '60329fa4', sha1: '8f66c283c992a6bc676f5f0f739b7e9d07bbf9ee' }),
        new ROM({ name: '11.bin', size: 16384, crc32: '66bac116', sha1: 'ce21a693ad8d7592d21e05d0cb9eabb36e7e8fef' }),
        new ROM({ name: '13.bin', size: 16384, crc32: '623fcec1', sha1: 'b3eea37d705e3871dc94e4cf6f2aacc6fbd09216' }),
        new ROM({ name: '14.bin', size: 32768, crc32: 'df2345ef', sha1: '3776edebda7bc9c72117f4b764f3bdaec0a632b4' }),
        new ROM({ name: '16.bin', size: 32768, crc32: 'c106b1ed', sha1: 'a16520752fb02e403c93975ecf12b75854d58d69' }),
        new ROM({ name: 'sb-5.e8', merge: 'sb-5.e8', size: 256, crc32: '93ab8153', sha1: 'a792f24e5c0c3c4a6b436102e7a98199f878ece1' }),
        new ROM({ name: 'sb-6.e9', merge: 'sb-6.e9', size: 256, crc32: '8ab44f7d', sha1: 'f74680a6a987d74b3acb32e6396f20e127874149' }),
        new ROM({ name: 'sb-7.e10', merge: 'sb-7.e10', size: 256, crc32: 'f4ade9a4', sha1: '62ad31d31d183cce213b03168daa035083b2f28e' }),
        new ROM({ name: 'sb-0.f1', merge: 'sb-0.f1', size: 256, crc32: '6047d91b', sha1: '1ce025f9524c1033e48c5294ee7d360f8bfebe8d' }),
        new ROM({ name: 'sb-4.d6', merge: 'sb-4.d6', size: 256, crc32: '4858968d', sha1: '20b5dbcaa1a4081b3139e7e2332d8fe3c9e55ed6' }),
        new ROM({ name: 'sb-8.k3', merge: 'sb-8.k3', size: 256, crc32: 'f6fad943', sha1: 'b0a24ea7805272e8ebf72a99b08907bc00d5f82f' }),
        new ROM({ name: 'sb-2.d1', merge: 'sb-2.d1', size: 256, crc32: '8bb8b3df', sha1: '49de2819c4c92057fedcb20425282515d85829aa' }),
        new ROM({ name: 'sb-3.d2', merge: 'sb-3.d2', size: 256, crc32: '3b0c99af', sha1: '38f30ac1e48632634e409f328ee3051b987de7ad' }),
        new ROM({ name: 'sb-1.k6', merge: 'sb-1.k6', size: 256, crc32: '712ac508', sha1: '5349d722ab6733afdda65f6e0a98322f0d515e86' }),
        new ROM({ name: 'sb-9.m11', merge: 'sb-9.m11', size: 256, crc32: '4921635c', sha1: 'aee37d6cdc36acf0f11ff5f93e7b16e4b12f6c39' }),
      ],
      deviceRef: [
        new DeviceRef('z80'),
        new DeviceRef('timer'),
        new DeviceRef('z80'),
        new DeviceRef('gfxdecode'),
        new DeviceRef('palette'),
        new DeviceRef('screen'),
        new DeviceRef('speaker'),
        new DeviceRef('generic_latch_8'),
        new DeviceRef('ay8910'),
        new DeviceRef('ay8910'),
        new DeviceRef('netlist_sound'),
        new DeviceRef('nl_stream_in'),
        new DeviceRef('nl_stream_in'),
        new DeviceRef('nl_stream_in'),
        new DeviceRef('nl_stream_in'),
        new DeviceRef('nl_stream_in'),
        new DeviceRef('nl_stream_in'),
        new DeviceRef('nl_stream_out'),
      ],
    }),
    new Machine({
      name: '1942b',
      cloneOf: '1942',
      romOf: '1942',
      description: '1942 (First Version)',
      rom: [
        new ROM({ name: 'sr-03.m3', size: 16384, crc32: '612975f2', sha1: 'f3744335862dd4c53925cc32792badd4a378c837' }),
        new ROM({ name: 'sr-04.m4', size: 16384, crc32: 'a60ac644', sha1: 'f37862db3cf5e6cc9ab3276f3bc45fd629fd70dd' }),
        new ROM({ name: 'sr-05.m5', size: 16384, crc32: '835f7b24', sha1: '24b66827f08c43fbf5b9517d638acdfc38e1b1e7' }),
        new ROM({ name: 'sr-06.m6', size: 8192, crc32: '821c6481', sha1: '06becb6bf8b4bde3a458098498eecad566a87711' }),
        new ROM({ name: 'sr-07.m7', size: 16384, crc32: '5df525e1', sha1: '70cd2910e2945db76bd6ebfa0ff09a5efadc2d0b' }),
        new ROM({ name: 'sr-01.c11', merge: 'sr-01.c11', size: 16384, crc32: 'bd87f06b', sha1: '821f85cf157f81117eeaba0c3cf0337eac357e58' }),
        new ROM({ name: 'sr-02.f2', merge: 'sr-02.f2', size: 8192, crc32: '6ebca191', sha1: '0dbddadde54a0ab66994c4a8726be05c6ca88a0e' }),
        new ROM({ name: 'sr-08.a1', merge: 'sr-08.a1', size: 8192, crc32: '3884d9eb', sha1: '5cbd9215fa5ba5a61208b383700adc4428521aed' }),
        new ROM({ name: 'sr-09.a2', merge: 'sr-09.a2', size: 8192, crc32: '999cf6e0', sha1: '5b8b685038ec98b781908b92eb7fb9506db68544' }),
        new ROM({ name: 'sr-10.a3', merge: 'sr-10.a3', size: 8192, crc32: '8edb273a', sha1: '85fdd4c690ed31e6396e3c16aa02140ee7ea2d61' }),
        new ROM({ name: 'sr-11.a4', merge: 'sr-11.a4', size: 8192, crc32: '3a2726c3', sha1: '187c92ef591febdcbd1d42ab850e0cbb62c00873' }),
        new ROM({ name: 'sr-12.a5', merge: 'sr-12.a5', size: 8192, crc32: '1bd3d8bb', sha1: 'ef4dce605eb4dc8035985a415315ec61c21419c6' }),
        new ROM({ name: 'sr-13.a6', merge: 'sr-13.a6', size: 8192, crc32: '658f02c4', sha1: 'f087d69e49e38cf3107350cde18fcf85a8fa04f0' }),
        new ROM({ name: 'sr-14.l1', merge: 'sr-14.l1', size: 16384, crc32: '2528bec6', sha1: '29f7719f18faad6bd1ec6735cc24e69168361470' }),
        new ROM({ name: 'sr-15.l2', merge: 'sr-15.l2', size: 16384, crc32: 'f89287aa', sha1: '136fff6d2a4f48a488fc7c620213761459c3ada0' }),
        new ROM({ name: 'sr-16.n1', merge: 'sr-16.n1', size: 16384, crc32: '024418f8', sha1: '145b8d5d6c8654cd090955a98f6dd8c8dbafe7c1' }),
        new ROM({ name: 'sr-17.n2', merge: 'sr-17.n2', size: 16384, crc32: 'e2c7e489', sha1: 'd4b5d575c021f58f6966df189df94e08c5b3621c' }),
        new ROM({ name: 'sb-5.e8', merge: 'sb-5.e8', size: 256, crc32: '93ab8153', sha1: 'a792f24e5c0c3c4a6b436102e7a98199f878ece1' }),
        new ROM({ name: 'sb-6.e9', merge: 'sb-6.e9', size: 256, crc32: '8ab44f7d', sha1: 'f74680a6a987d74b3acb32e6396f20e127874149' }),
        new ROM({ name: 'sb-7.e10', merge: 'sb-7.e10', size: 256, crc32: 'f4ade9a4', sha1: '62ad31d31d183cce213b03168daa035083b2f28e' }),
        new ROM({ name: 'sb-0.f1', merge: 'sb-0.f1', size: 256, crc32: '6047d91b', sha1: '1ce025f9524c1033e48c5294ee7d360f8bfebe8d' }),
        new ROM({ name: 'sb-4.d6', merge: 'sb-4.d6', size: 256, crc32: '4858968d', sha1: '20b5dbcaa1a4081b3139e7e2332d8fe3c9e55ed6' }),
        new ROM({ name: 'sb-8.k3', merge: 'sb-8.k3', size: 256, crc32: 'f6fad943', sha1: 'b0a24ea7805272e8ebf72a99b08907bc00d5f82f' }),
        new ROM({ name: 'sb-2.d1', merge: 'sb-2.d1', size: 256, crc32: '8bb8b3df', sha1: '49de2819c4c92057fedcb20425282515d85829aa' }),
        new ROM({ name: 'sb-3.d2', merge: 'sb-3.d2', size: 256, crc32: '3b0c99af', sha1: '38f30ac1e48632634e409f328ee3051b987de7ad' }),
        new ROM({ name: 'sb-1.k6', merge: 'sb-1.k6', size: 256, crc32: '712ac508', sha1: '5349d722ab6733afdda65f6e0a98322f0d515e86' }),
        new ROM({ name: 'sb-9.m11', merge: 'sb-9.m11', size: 256, crc32: '4921635c', sha1: 'aee37d6cdc36acf0f11ff5f93e7b16e4b12f6c39' }),
      ],
      deviceRef: [
        new DeviceRef('z80'),
        new DeviceRef('timer'),
        new DeviceRef('z80'),
        new DeviceRef('gfxdecode'),
        new DeviceRef('palette'),
        new DeviceRef('screen'),
        new DeviceRef('speaker'),
        new DeviceRef('generic_latch_8'),
        new DeviceRef('ay8910'),
        new DeviceRef('ay8910'),
        new DeviceRef('netlist_sound'),
        new DeviceRef('nl_stream_in'),
        new DeviceRef('nl_stream_in'),
        new DeviceRef('nl_stream_in'),
        new DeviceRef('nl_stream_in'),
        new DeviceRef('nl_stream_in'),
        new DeviceRef('nl_stream_in'),
        new DeviceRef('nl_stream_out'),
      ],
    }),
    new Machine({
      name: '1942h',
      cloneOf: '1942',
      romOf: '1942',
      description: 'Supercharger 1942',
      rom: [
        new ROM({ name: 'supercharger_1942_@3.m3', size: 16384, crc32: 'ec70785f', sha1: '2010a945e1d5c984a14cf7f47a883d04bd71567d' }),
        new ROM({ name: 'supercharger_1942_@4.m4', size: 16384, crc32: 'cc11355f', sha1: '44fceb449f406f657494eeee4e6b43bf063f2013' }),
        new ROM({ name: 'supercharger_1942_@5.m5', size: 16384, crc32: '42746d75', sha1: 'ede6919b84653b94fddeb40b3004e44336880ba2' }),
        new ROM({ name: 'srb-06.m6', merge: 'srb-06.m6', size: 8192, crc32: '466f8248', sha1: '2ccc8fc59962d3001fbc10e8d2f20a254a74f251' }),
        new ROM({ name: 'srb-07.m7', merge: 'srb-07.m7', size: 16384, crc32: '0d31038c', sha1: 'b588eaf6fddd66ecb2d9832dc197f286f1ccd846' }),
        new ROM({ name: 'sr-01.c11', merge: 'sr-01.c11', size: 16384, crc32: 'bd87f06b', sha1: '821f85cf157f81117eeaba0c3cf0337eac357e58' }),
        new ROM({ name: 'sr-02.f2', merge: 'sr-02.f2', size: 8192, crc32: '6ebca191', sha1: '0dbddadde54a0ab66994c4a8726be05c6ca88a0e' }),
        new ROM({ name: 'sr-08.a1', merge: 'sr-08.a1', size: 8192, crc32: '3884d9eb', sha1: '5cbd9215fa5ba5a61208b383700adc4428521aed' }),
        new ROM({ name: 'sr-09.a2', merge: 'sr-09.a2', size: 8192, crc32: '999cf6e0', sha1: '5b8b685038ec98b781908b92eb7fb9506db68544' }),
        new ROM({ name: 'sr-10.a3', merge: 'sr-10.a3', size: 8192, crc32: '8edb273a', sha1: '85fdd4c690ed31e6396e3c16aa02140ee7ea2d61' }),
        new ROM({ name: 'sr-11.a4', merge: 'sr-11.a4', size: 8192, crc32: '3a2726c3', sha1: '187c92ef591febdcbd1d42ab850e0cbb62c00873' }),
        new ROM({ name: 'sr-12.a5', merge: 'sr-12.a5', size: 8192, crc32: '1bd3d8bb', sha1: 'ef4dce605eb4dc8035985a415315ec61c21419c6' }),
        new ROM({ name: 'sr-13.a6', merge: 'sr-13.a6', size: 8192, crc32: '658f02c4', sha1: 'f087d69e49e38cf3107350cde18fcf85a8fa04f0' }),
        new ROM({ name: 'sr-14.l1', merge: 'sr-14.l1', size: 16384, crc32: '2528bec6', sha1: '29f7719f18faad6bd1ec6735cc24e69168361470' }),
        new ROM({ name: 'sr-15.l2', merge: 'sr-15.l2', size: 16384, crc32: 'f89287aa', sha1: '136fff6d2a4f48a488fc7c620213761459c3ada0' }),
        new ROM({ name: 'sr-16.n1', merge: 'sr-16.n1', size: 16384, crc32: '024418f8', sha1: '145b8d5d6c8654cd090955a98f6dd8c8dbafe7c1' }),
        new ROM({ name: 'sr-17.n2', merge: 'sr-17.n2', size: 16384, crc32: 'e2c7e489', sha1: 'd4b5d575c021f58f6966df189df94e08c5b3621c' }),
        new ROM({ name: 'sb-5.e8', merge: 'sb-5.e8', size: 256, crc32: '93ab8153', sha1: 'a792f24e5c0c3c4a6b436102e7a98199f878ece1' }),
        new ROM({ name: 'sb-6.e9', merge: 'sb-6.e9', size: 256, crc32: '8ab44f7d', sha1: 'f74680a6a987d74b3acb32e6396f20e127874149' }),
        new ROM({ name: 'sb-7.e10', merge: 'sb-7.e10', size: 256, crc32: 'f4ade9a4', sha1: '62ad31d31d183cce213b03168daa035083b2f28e' }),
        new ROM({ name: 'sb-0.f1', merge: 'sb-0.f1', size: 256, crc32: '6047d91b', sha1: '1ce025f9524c1033e48c5294ee7d360f8bfebe8d' }),
        new ROM({ name: 'sb-4.d6', merge: 'sb-4.d6', size: 256, crc32: '4858968d', sha1: '20b5dbcaa1a4081b3139e7e2332d8fe3c9e55ed6' }),
        new ROM({ name: 'sb-8.k3', merge: 'sb-8.k3', size: 256, crc32: 'f6fad943', sha1: 'b0a24ea7805272e8ebf72a99b08907bc00d5f82f' }),
        new ROM({ name: 'sb-2.d1', merge: 'sb-2.d1', size: 256, crc32: '8bb8b3df', sha1: '49de2819c4c92057fedcb20425282515d85829aa' }),
        new ROM({ name: 'sb-3.d2', merge: 'sb-3.d2', size: 256, crc32: '3b0c99af', sha1: '38f30ac1e48632634e409f328ee3051b987de7ad' }),
        new ROM({ name: 'sb-1.k6', merge: 'sb-1.k6', size: 256, crc32: '712ac508', sha1: '5349d722ab6733afdda65f6e0a98322f0d515e86' }),
        new ROM({ name: 'sb-9.m11', merge: 'sb-9.m11', size: 256, crc32: '4921635c', sha1: 'aee37d6cdc36acf0f11ff5f93e7b16e4b12f6c39' }),
      ],
      deviceRef: [
        new DeviceRef('z80'),
        new DeviceRef('timer'),
        new DeviceRef('z80'),
        new DeviceRef('gfxdecode'),
        new DeviceRef('palette'),
        new DeviceRef('screen'),
        new DeviceRef('speaker'),
        new DeviceRef('generic_latch_8'),
        new DeviceRef('ay8910'),
        new DeviceRef('ay8910'),
        new DeviceRef('netlist_sound'),
        new DeviceRef('nl_stream_in'),
        new DeviceRef('nl_stream_in'),
        new DeviceRef('nl_stream_in'),
        new DeviceRef('nl_stream_in'),
        new DeviceRef('nl_stream_in'),
        new DeviceRef('nl_stream_in'),
        new DeviceRef('nl_stream_out'),
      ],
    }),
    new Machine({
      name: '1942p',
      cloneOf: '1942',
      romOf: '1942',
      description: '1942 (Tecfri PCB, bootleg?)',
      rom: [
        new ROM({ name: '1.bin', size: 32768, crc32: 'd8506aee', sha1: 'aebdce3203e7743d70a8465a5e5766f9f47cb33f' }),
        new ROM({ name: '2.bin', size: 32768, crc32: '793a8fbc', sha1: '57f27a2b59cbc7e82e41683ddfd58055350f80bc' }),
        new ROM({ name: '3.bin', size: 16384, crc32: '108fda63', sha1: '6ffdf57a04bcfae9fdb2343f30cff50926188cbf' }),
        new ROM({ name: '04.bin', size: 16384, crc32: 'b4efd1af', sha1: '015b687b1714f892c3b2528bceb2df8ca48b6b8e' }),
        new ROM({ name: '8.bin', merge: 'sr-02.f2', size: 8192, crc32: '6ebca191', sha1: '0dbddadde54a0ab66994c4a8726be05c6ca88a0e' }),
        new ROM({ name: '5.bin', size: 16384, crc32: '1081b88c', sha1: 'f3026e72206c96573fd6ba28d15e865b51735004' }),
        new ROM({ name: '6.bin', size: 16384, crc32: '2d6acd8c', sha1: '914bb971c8f1364d0c44bd11f5f7e8da1f4953bb' }),
        new ROM({ name: '7.bin', size: 16384, crc32: '30f13e78', sha1: '51b9c0dfc53db705b75dd7ce643cec807533af5a' }),
        new ROM({ name: '9.bin', size: 16384, crc32: '755a4762', sha1: 'b8747e02854a2dd8fa1251e206dbf0a0fc017b38' }),
        new ROM({ name: '10.bin', size: 16384, crc32: '4a5a9084', sha1: 'dcf9834e58324f9c94206728a055083e335bc862' }),
        new ROM({ name: '11.bin', size: 16384, crc32: 'd2ce3eb6', sha1: 'ebe71bd413b169ff2cea6973faf48527a8283eef' }),
        new ROM({ name: '12.bin', size: 16384, crc32: 'aaa86493', sha1: 'b0f6c59b5369b565bf863544a26cde2105aa35be' }),
        new ROM({ name: 'ic22.bin', merge: 'sb-8.k3', size: 256, crc32: 'f6fad943', sha1: 'b0a24ea7805272e8ebf72a99b08907bc00d5f82f' }),
      ],
      deviceRef: [
        new DeviceRef('z80'),
        new DeviceRef('z80'),
        new DeviceRef('gfxdecode'),
        new DeviceRef('palette'),
        new DeviceRef('screen'),
        new DeviceRef('speaker'),
        new DeviceRef('generic_latch_8'),
        new DeviceRef('ay8910'),
        new DeviceRef('ay8910'),
      ],
    }),
    new Machine({
      name: '1942w',
      cloneOf: '1942',
      romOf: '1942',
      description: '1942 (Williams Electronics license)',
      rom: [
        new ROM({ name: 'sw-03.m3', size: 16384, crc32: 'afd79770', sha1: '74c7a887fe3d4abfce1dcfec4c75b21ab81adc8c' }),
        new ROM({ name: 'sw-04.m4', size: 16384, crc32: '933d9910', sha1: '9c73ef880f56e30a865be959f8bbdbe79c7ef8e2' }),
        new ROM({ name: 'sw-05.m5', size: 16384, crc32: 'e9a71bb6', sha1: '1f0d52c9282d15f9e4898b3b144ece25d345b71f' }),
        new ROM({ name: 'sw-06.m6', merge: 'srb-06.m6', size: 8192, crc32: '466f8248', sha1: '2ccc8fc59962d3001fbc10e8d2f20a254a74f251' }),
        new ROM({ name: 'sw-07.m7', size: 16384, crc32: 'ec41655e', sha1: 'dbe4bb11f2e88574cb43ba5cd216354c3b7f69a6' }),
        new ROM({ name: 'sr-01.c11', merge: 'sr-01.c11', size: 16384, crc32: 'bd87f06b', sha1: '821f85cf157f81117eeaba0c3cf0337eac357e58' }),
        new ROM({ name: 'sw-02.f2', size: 8192, crc32: 'f8e9ada2', sha1: '028f554e70425c53faa30a6fe1c45cc16724560a' }),
        new ROM({ name: 'sr-08.a1', merge: 'sr-08.a1', size: 8192, crc32: '3884d9eb', sha1: '5cbd9215fa5ba5a61208b383700adc4428521aed' }),
        new ROM({ name: 'sr-09.a2', merge: 'sr-09.a2', size: 8192, crc32: '999cf6e0', sha1: '5b8b685038ec98b781908b92eb7fb9506db68544' }),
        new ROM({ name: 'sr-10.a3', merge: 'sr-10.a3', size: 8192, crc32: '8edb273a', sha1: '85fdd4c690ed31e6396e3c16aa02140ee7ea2d61' }),
        new ROM({ name: 'sr-11.a4', merge: 'sr-11.a4', size: 8192, crc32: '3a2726c3', sha1: '187c92ef591febdcbd1d42ab850e0cbb62c00873' }),
        new ROM({ name: 'sr-12.a5', merge: 'sr-12.a5', size: 8192, crc32: '1bd3d8bb', sha1: 'ef4dce605eb4dc8035985a415315ec61c21419c6' }),
        new ROM({ name: 'sr-13.a6', merge: 'sr-13.a6', size: 8192, crc32: '658f02c4', sha1: 'f087d69e49e38cf3107350cde18fcf85a8fa04f0' }),
        new ROM({ name: 'sr-14.l1', merge: 'sr-14.l1', size: 16384, crc32: '2528bec6', sha1: '29f7719f18faad6bd1ec6735cc24e69168361470' }),
        new ROM({ name: 'sr-15.l2', merge: 'sr-15.l2', size: 16384, crc32: 'f89287aa', sha1: '136fff6d2a4f48a488fc7c620213761459c3ada0' }),
        new ROM({ name: 'sr-16.n1', merge: 'sr-16.n1', size: 16384, crc32: '024418f8', sha1: '145b8d5d6c8654cd090955a98f6dd8c8dbafe7c1' }),
        new ROM({ name: 'sr-17.n2', merge: 'sr-17.n2', size: 16384, crc32: 'e2c7e489', sha1: 'd4b5d575c021f58f6966df189df94e08c5b3621c' }),
        new ROM({ name: 'sb-5.e8', merge: 'sb-5.e8', size: 256, crc32: '93ab8153', sha1: 'a792f24e5c0c3c4a6b436102e7a98199f878ece1' }),
        new ROM({ name: 'sb-6.e9', merge: 'sb-6.e9', size: 256, crc32: '8ab44f7d', sha1: 'f74680a6a987d74b3acb32e6396f20e127874149' }),
        new ROM({ name: 'sb-7.e10', merge: 'sb-7.e10', size: 256, crc32: 'f4ade9a4', sha1: '62ad31d31d183cce213b03168daa035083b2f28e' }),
        new ROM({ name: 'sb-0.f1', merge: 'sb-0.f1', size: 256, crc32: '6047d91b', sha1: '1ce025f9524c1033e48c5294ee7d360f8bfebe8d' }),
        new ROM({ name: 'sb-4.d6', merge: 'sb-4.d6', size: 256, crc32: '4858968d', sha1: '20b5dbcaa1a4081b3139e7e2332d8fe3c9e55ed6' }),
        new ROM({ name: 'sb-8.k3', merge: 'sb-8.k3', size: 256, crc32: 'f6fad943', sha1: 'b0a24ea7805272e8ebf72a99b08907bc00d5f82f' }),
        new ROM({ name: 'sb-2.d1', merge: 'sb-2.d1', size: 256, crc32: '8bb8b3df', sha1: '49de2819c4c92057fedcb20425282515d85829aa' }),
        new ROM({ name: 'sb-3.d2', merge: 'sb-3.d2', size: 256, crc32: '3b0c99af', sha1: '38f30ac1e48632634e409f328ee3051b987de7ad' }),
        new ROM({ name: 'sb-1.k6', merge: 'sb-1.k6', size: 256, crc32: '712ac508', sha1: '5349d722ab6733afdda65f6e0a98322f0d515e86' }),
        new ROM({ name: 'sb-9.m11', merge: 'sb-9.m11', size: 256, crc32: '4921635c', sha1: 'aee37d6cdc36acf0f11ff5f93e7b16e4b12f6c39' }),
      ],
      deviceRef: [
        new DeviceRef('z80'),
        new DeviceRef('timer'),
        new DeviceRef('z80'),
        new DeviceRef('gfxdecode'),
        new DeviceRef('palette'),
        new DeviceRef('screen'),
        new DeviceRef('speaker'),
        new DeviceRef('generic_latch_8'),
        new DeviceRef('ay8910'),
        new DeviceRef('ay8910'),
        new DeviceRef('netlist_sound'),
        new DeviceRef('nl_stream_in'),
        new DeviceRef('nl_stream_in'),
        new DeviceRef('nl_stream_in'),
        new DeviceRef('nl_stream_in'),
        new DeviceRef('nl_stream_in'),
        new DeviceRef('nl_stream_in'),
        new DeviceRef('nl_stream_out'),
      ],
    }),

    new Machine({
      // Game with BIOS files but no romOf BIOS parent
      name: 'aes',
      description: 'Neo-Geo AES (NTSC)',
      rom: [
        new ROM({ name: 'neo-epo.bin', bios: 'asia', size: 131072, crc32: 'd27a71f1', sha1: '1b3b22092f30c4d1b2c15f04d1670eb1e9fbea07' }),
        new ROM({ name: 'neo-po.bin', bios: 'japan', size: 131072, crc32: '16d0c132', sha1: '4e4a440cae46f3889d20234aebd7f8d5f522e22c' }),
        new ROM({ name: 'neodebug.rom', bios: 'devel', size: 131072, crc32: '698ebb7d', sha1: '081c49aa8cc7dad5939833dc1b18338321ea0a07' }),
        new ROM({ name: 'uni-bios_4_0.rom', bios: 'unibios40', size: 131072, crc32: 'a7aab458', sha1: '938a0bda7d9a357240718c2cec319878d36b8f72' }),
        new ROM({ name: 'uni-bios_3_3.rom', bios: 'unibios33', size: 131072, crc32: '24858466', sha1: '0ad92efb0c2338426635e0159d1f60b4473d0785' }),
        new ROM({ name: 'uni-bios_3_2.rom', bios: 'unibios32', size: 131072, crc32: 'a4e8b9b3', sha1: 'c92f18c3f1edda543d264ecd0ea915240e7c8258' }),
        new ROM({ name: 'uni-bios_3_1.rom', bios: 'unibios31', size: 131072, crc32: '0c58093f', sha1: '29329a3448c2505e1ff45ffa75e61e9693165153' }),
        new ROM({ name: 'uni-bios_3_0.rom', bios: 'unibios30', size: 131072, crc32: 'a97c89a9', sha1: '97a5eff3b119062f10e31ad6f04fe4b90d366e7f' }),
        new ROM({ name: 'uni-bios_2_3.rom', bios: 'unibios23', size: 131072, crc32: '27664eb5', sha1: '5b02900a3ccf3df168bdcfc98458136fd2b92ac0' }),
        new ROM({ name: 'uni-bios_2_3o.rom', bios: 'unibios23o', size: 131072, crc32: '601720ae', sha1: '1b8a72c720cdb5ee3f1d735bbcf447b09204b8d9' }),
        new ROM({ name: 'uni-bios_2_2.rom', bios: 'unibios22', size: 131072, crc32: '2d50996a', sha1: '5241a4fb0c63b1a23fd1da8efa9c9a9bd3b4279c' }),
        new ROM({ name: 'uni-bios_2_1.rom', bios: 'unibios21', size: 131072, crc32: '8dabf76b', sha1: 'c23732c4491d966cf0373c65c83c7a4e88f0082c' }),
        new ROM({ name: 'uni-bios_2_0.rom', bios: 'unibios20', size: 131072, crc32: '0c12c2ad', sha1: '37bcd4d30f3892078b46841d895a6eff16dc921e' }),
        new ROM({ name: 'uni-bios_1_3.rom', bios: 'unibios13', size: 131072, crc32: 'b24b44a0', sha1: 'eca8851d30557b97c309a0d9f4a9d20e5b14af4e' }),
        new ROM({ name: '000-lo.lo', size: 131072, crc32: '5a86cff2', sha1: '5992277debadeb64d1c1c64b0a92d9293eaf7e4a' }),
      ],
      deviceRef: [
        new DeviceRef('m68000'),
        new DeviceRef('z80'),
        new DeviceRef('hc259'),
        new DeviceRef('screen'),
        new DeviceRef('palette'),
        new DeviceRef('neosprite_opt'),
        new DeviceRef('ipt_merge_all_hi'),
        new DeviceRef('generic_latch_8'),
        new DeviceRef('generic_latch_8'),
        new DeviceRef('ym2610'),
        new DeviceRef('speaker'),
        new DeviceRef('speaker'),
        new DeviceRef('ng_memcard'),
        new DeviceRef('neogeo_cart_slot'),
        new DeviceRef('neogeo_control_port'),
        new DeviceRef('neogeo_joy'),
        new DeviceRef('neogeo_control_port'),
        new DeviceRef('neogeo_joy'),
        new DeviceRef('software_list'),
      ],
    }),

    new Machine({
      // Game with no clones
      name: 'bbtime',
      description: 'Burger Time (Bandai)',
      rom: [
        new ROM({ name: 'hd38820a65', size: 4352, crc32: '33611faf', sha1: '29b6a30ed543688d31ec2aa18f7938fa4eef30b0' }),
        new ROM({ name: 'bbtime.svg', size: 461598, crc32: '297f30de', sha1: 'a5f38cd9c5d5ba9392c5d57ac85ecc2782b6ae7a', status: 'baddump' }),
      ],
      deviceRef: [
        new DeviceRef('hd38820'),
        new DeviceRef('screen'),
        new DeviceRef('pwm_display'),
        new DeviceRef('speaker'),
        new DeviceRef('speaker_sound_device'),
      ],
    }),

    new Machine({
      // Game with DeviceRefs that have 'status=nodump' ROMs
      name: 'c64',
      description: 'Commodore 64 (NTSC)',
      rom: [
        new ROM({ name: '901227-01.u4', bios: 'r1', size: 8192, crc32: 'dce782fa', sha1: '87cc04d61fc748b82df09856847bb5c2754a2033' }),
        new ROM({ name: '901227-02.u4', bios: 'r2', size: 8192, crc32: 'a5c687b3', sha1: '0e2e4ee3f2d41f00bed72f9ab588b83e306fdb13' }),
        new ROM({ name: '901227-03.u4', bios: 'r3', size: 8192, crc32: 'dbe3e7c7', sha1: '1d503e56df85a62fee696e7618dc5b4e781df1bb' }),
        new ROM({ name: 'jiffydos c64.u4', bios: 'jiffydos', size: 8192, crc32: '2f79984c', sha1: '31e73e66eccb28732daea8ec3ad1addd9b39a017' }),
        new ROM({ name: 'speed-dos.u4', bios: 'speeddos', size: 8192, crc32: '5beb9ac8', sha1: '8896c8de9e26ef1396eb46020b2de346a3eeab7e' }),
        new ROM({ name: 'speed-dosplus.u4', bios: 'speeddos20', size: 8192, crc32: '10aee0ae', sha1: '6cebd4dc0c5e8c0b073586a3f1c43cc3349b9736' }),
        new ROM({ name: 'speed-dosplus27.u4', bios: 'speeddos27', size: 8192, crc32: 'ff59995e', sha1: 'c8d864e5fc7089af8afce97dc0a0224df11df1c3' }),
        new ROM({ name: 'prodos.u4', bios: 'prodos', size: 8192, crc32: '37ed83a2', sha1: '35f4f0fe03c0b7b3762b526ba855de41b496fb60' }),
        new ROM({ name: 'prodos24l2.u4', bios: 'prodos2', size: 8192, crc32: '41dad9fe', sha1: 'fbf3dcc2ed40e58b07595740ea6fbff7ab19ebad' }),
        new ROM({ name: 'prodos35l2.u4', bios: 'prodos3', size: 8192, crc32: '2822eee7', sha1: '77356b84c1648018863d1c8dd5bc3a37485bc00e' }),
        new ROM({ name: 'turborom.u4', bios: 'turborom', size: 8192, crc32: 'e6c763a2', sha1: 'eff5a4b6bc65daa9421bd3856dd99a3195068e1c' }),
        new ROM({ name: 'dosrom12.u4', bios: 'dosrom', size: 8192, crc32: 'ac030fc0', sha1: '0e4b38e81b49f55d52162154a44f0fffd2b0d04f' }),
        new ROM({ name: 'turborom2.u4', bios: 'turborom2', size: 8192, crc32: 'ea3ba683', sha1: '4bb23f764a3d255119fbae37202ca820caa04e1f' }),
        new ROM({ name: 'mercury3.u4', bios: 'mercury', size: 8192, crc32: '6eac46a2', sha1: '4e351aa5fcb97c4c21e565aa2c830cc09bd47533' }),
        new ROM({ name: 'kernal-10-mager.u4', bios: 'dolphin', size: 8192, crc32: 'c9bb21bc', sha1: 'e305216e50ff8a7acf102be6c6343e3d44a16233' }),
        new ROM({ name: 'kernal-20-1_au.u4', bios: 'dolphin201au', size: 8192, crc32: '7068bbcc', sha1: '325ce7e32609a8fc704aaa76f5eb4cd7d8099a92' }),
        new ROM({ name: 'kernal-20-1.u4', bios: 'dolphin201', size: 8192, crc32: 'c9c4c44e', sha1: '7f5d8f08c5ed2182ffb415a3d777fdd922496d02' }),
        new ROM({ name: 'kernal-20-2.u4', bios: 'dolphin202', size: 8192, crc32: 'ffaeb9bc', sha1: '5f6c1bad379da16f77bccb58e80910f307dfd5f8' }),
        new ROM({ name: 'kernal-20-3.u4', bios: 'dolphin203', size: 8192, crc32: '4fd511f2', sha1: '316fba280dcb29496d593c0c4e3ee9a19844054e' }),
        new ROM({ name: 'kernal-30.u4', bios: 'dolphin30', size: 8192, crc32: '5402d643', sha1: '733acb96fead2fb4df77840c5bb618f08439fc7e' }),
        new ROM({ name: 'turboaccess26.u4', bios: 'taccess', size: 8192, crc32: '93de6cd9', sha1: 'a74478f3b9153c13176eac80ebfacc512ae7cbf0' }),
        new ROM({ name: 'turboaccess301.u4', bios: 'ttrans301', size: 8192, crc32: 'b3304dcf', sha1: '4d47a265ef65e4823f862cfc3d514c2a71473580' }),
        new ROM({ name: 'turboaccess302.u4', bios: 'ttrans302', size: 8192, crc32: '9e696a7b', sha1: '5afae75d66d539f4bb4af763f029f0ef6523a4eb' }),
        new ROM({ name: 'turboprocess.u4', bios: 'tprocess', size: 8192, crc32: 'e5610d76', sha1: 'e3f35777cfd16cce4717858f77ff354763395ba9' }),
        new ROM({ name: 'turboprocessus.u4', bios: 'tprocessn', size: 8192, crc32: '7480b76a', sha1: 'ef1664b5057ae3cc6d104fc2f5c1fb29ee5a1b2b' }),
        new ROM({ name: 'exos3.u4', bios: 'exos3', size: 8192, crc32: '4e54d020', sha1: 'f8931b7c0b26807f4de0cc241f0b1e2c8f5271e9' }),
        new ROM({ name: 'exos4.u4', bios: 'exos4', size: 8192, crc32: 'd5cf83a9', sha1: 'd5f03a5c0e9d00032d4751ecc6bcd6385879c9c7' }),
        new ROM({ name: 'digidos.u4', bios: 'digidos', size: 8192, crc32: '2b0c8e89', sha1: '542d6f61c318bced0642e7c2d4d3b34a0f13e634' }),
        new ROM({ name: 'magnum.u4', bios: 'magnum', size: 8192, crc32: 'b2cffcc6', sha1: '827c782c1723b5d0992c05c00738ae4b2133b641' }),
        new ROM({ name: 'mercury31s.u4', bios: 'mercury31s', size: 8192, crc32: '97aa5d2f', sha1: '9fc653e61c34225245036f266db14e05feeadb21' }),
        new ROM({ name: '901226-01.u3', size: 8192, crc32: 'f833d117', sha1: '79015323128650c742a3694c9429aa91f355905e' }),
        new ROM({ name: '901225-01.u5', size: 4096, crc32: 'ec4272ee', sha1: 'adc7c31e18c7c7413d54802ef2f4193da14711aa' }),
        new ROM({ name: '906114-01.u17', size: 245, crc32: '54c89351', sha1: 'efb315f560b6f72444b8f0b2ca4b0ccbcd144a1b' }),
      ],
      deviceRef: [
        new DeviceRef('m6510'),
        new DeviceRef('ipt_merge_any_hi'),
        new DeviceRef('ipt_merge_any_hi'),
        new DeviceRef('mos6567'),
        new DeviceRef('screen'),
        new DeviceRef('speaker'),
        new DeviceRef('mos6581'),
        new DeviceRef('pls100'),
        new DeviceRef('mos6526'),
        new DeviceRef('mos6526'),
        new DeviceRef('pet_datassette_port'),
        new DeviceRef('c1530'),
        new DeviceRef('cassette_image'),
        new DeviceRef('cbm_iec_slot'),
        new DeviceRef('cbm_iec_slot'),
        new DeviceRef('c1541'),
        new DeviceRef('m6502'),
        new DeviceRef('mos6522'),
        new DeviceRef('mos6522'),
        new DeviceRef('c64h156'),
        new DeviceRef('floppy_connector'),
        new DeviceRef('alps_3255190x'),
        new DeviceRef('speaker'),
        new DeviceRef('flopsnd'),
        new DeviceRef('cbm_iec_slot'),
        new DeviceRef('cbm_iec_slot'),
        new DeviceRef('cbm_iec_slot'),
        new DeviceRef('cbm_iec'),
        new DeviceRef('vcs_control_port'),
        new DeviceRef('vcs_control_port'),
        new DeviceRef('vcs_joystick'),
        new DeviceRef('c64_expansion_slot'),
        new DeviceRef('pet_user_port'),
        new DeviceRef('quickload'),
        new DeviceRef('software_list'),
        new DeviceRef('software_list'),
        new DeviceRef('software_list'),
        new DeviceRef('software_list'),
        new DeviceRef('software_list'),
        new DeviceRef('ram'),
      ],
    }),

    new Machine({
      // Game where parent and clone(s) have duplicate filenames with different checksums
      // (eeprom-ddonpach.bin)
      name: 'ddonpach',
      description: 'DoDonPachi (World, 1997 2/ 5 Master Ver.)',
      rom: [
        new ROM({ name: 'b1.u27', size: 524288, crc32: 'b5cdc8d3', sha1: '58757b50e21a27e500a82c03f62cf02a85389926' }),
        new ROM({ name: 'b2.u26', size: 524288, crc32: '6bbb063a', sha1: 'e5de64b9c3efc0a38a2e0e16b78ee393bff63558' }),
        new ROM({ name: 'u50.bin', size: 2097152, crc32: '14b260ec', sha1: '33bda210302428d5500115d0c7a839cdfcb67d17' }),
        new ROM({ name: 'u51.bin', size: 2097152, crc32: 'e7ba8cce', sha1: 'ad74a6b7d53760b19587c4a6dbea937daa7e87ce' }),
        new ROM({ name: 'u52.bin', size: 2097152, crc32: '02492ee0', sha1: '64d9cc64a4ad189a8b03cf6a749ddb732b4a0014' }),
        new ROM({ name: 'u53.bin', size: 2097152, crc32: 'cb4c10f0', sha1: 'a622e8bd0c938b5d38b392b247400b744d8be288' }),
        new ROM({ name: 'u60.bin', size: 2097152, crc32: '903096a7', sha1: 'a243e903fef7c4a7b71383263e82e42acd869261' }),
        new ROM({ name: 'u61.bin', size: 2097152, crc32: 'd89b7631', sha1: 'a66bb4955ca58fab8973ca37a0f971e9a67ce017' }),
        new ROM({ name: 'u62.bin', size: 2097152, crc32: '292bfb6b', sha1: '11b385991ee990eb5ef36e136b988802b5f90fa4' }),
        new ROM({ name: 'u6.bin', size: 2097152, crc32: '9dfdafaf', sha1: 'f5cb450cdc78a20c3a74c6dac05c9ac3cba08327' }),
        new ROM({ name: 'u7.bin', size: 2097152, crc32: '795b17d5', sha1: 'cbfc29f1df9600c82e0fdae00edd00da5b73e14c' }),
        new ROM({ name: 'eeprom-ddonpach.bin', size: 128, crc32: '315fb546', sha1: '7f597107d1610fc286413e0e93c794c80c0c554f' }),
      ],
      deviceRef: [
        new DeviceRef('m68000'),
        new DeviceRef('timer'),
        new DeviceRef('screen'),
        new DeviceRef('palette'),
        new DeviceRef('gfxdecode'),
        new DeviceRef('tmap038'),
        new DeviceRef('tmap038'),
        new DeviceRef('tmap038'),
        new DeviceRef('93c46_16'),
        new DeviceRef('gfxdecode'),
        new DeviceRef('speaker'),
        new DeviceRef('ymz280b'),
      ],
    }),
    new Machine({
      name: 'ddonpacha',
      cloneOf: 'ddonpach',
      romOf: 'ddonpach',
      description: 'DoDonPachi (2012/02/12 Arrange Ver. 1.1) (hack)',
      rom: [
        new ROM({ name: 'arrange_u27.bin', size: 524288, crc32: '44b899ae', sha1: '798ec437d861b94fcd90c99a7015dd420887c788' }),
        new ROM({ name: 'arrange_u26.bin', size: 524288, crc32: '727a09a8', sha1: '91876386855f19e8a3d8d1df71dfe9b3d98e9ea9' }),
        new ROM({ name: 'u50.bin', merge: 'u50.bin', size: 2097152, crc32: '14b260ec', sha1: '33bda210302428d5500115d0c7a839cdfcb67d17' }),
        new ROM({ name: 'arrange_u51.bin', size: 2097152, crc32: '0f3e5148', sha1: '3016f4d075940feae691389606cd2aa7ac53849e' }),
        new ROM({ name: 'u52.bin', merge: 'u52.bin', size: 2097152, crc32: '02492ee0', sha1: '64d9cc64a4ad189a8b03cf6a749ddb732b4a0014' }),
        new ROM({ name: 'u53.bin', merge: 'u53.bin', size: 2097152, crc32: 'cb4c10f0', sha1: 'a622e8bd0c938b5d38b392b247400b744d8be288' }),
        new ROM({ name: 'u60.bin', merge: 'u60.bin', size: 2097152, crc32: '903096a7', sha1: 'a243e903fef7c4a7b71383263e82e42acd869261' }),
        new ROM({ name: 'u61.bin', merge: 'u61.bin', size: 2097152, crc32: 'd89b7631', sha1: 'a66bb4955ca58fab8973ca37a0f971e9a67ce017' }),
        new ROM({ name: 'arrange_u62.bin', size: 2097152, crc32: '42e4c6c5', sha1: '4d282f7592f5fc5e11839c57f39cae20b8422aa1' }),
        new ROM({ name: 'u6.bin', merge: 'u6.bin', size: 2097152, crc32: '9dfdafaf', sha1: 'f5cb450cdc78a20c3a74c6dac05c9ac3cba08327' }),
        new ROM({ name: 'u7.bin', merge: 'u7.bin', size: 2097152, crc32: '795b17d5', sha1: 'cbfc29f1df9600c82e0fdae00edd00da5b73e14c' }),
        new ROM({ name: 'eeprom-ddonpach.bin', size: 128, crc32: '2df16438', sha1: '4881b70589a97e2420feb6d6e6737273beeff303' }),
      ],
      deviceRef: [
        new DeviceRef('m68000'),
        new DeviceRef('timer'),
        new DeviceRef('screen'),
        new DeviceRef('palette'),
        new DeviceRef('gfxdecode'),
        new DeviceRef('tmap038'),
        new DeviceRef('tmap038'),
        new DeviceRef('tmap038'),
        new DeviceRef('93c46_16'),
        new DeviceRef('gfxdecode'),
        new DeviceRef('speaker'),
        new DeviceRef('ymz280b'),
      ],
    }),
    new Machine({
      name: 'ddonpachj',
      cloneOf: 'ddonpach',
      romOf: 'ddonpach',
      description: 'DoDonPachi (Japan, 1997 2/ 5 Master Ver.)',
      rom: [
        new ROM({ name: 'u27.bin', size: 524288, crc32: '2432ff9b', sha1: 'fbc826c30553f6553ead40b312b73c049e8f4bf6' }),
        new ROM({ name: 'u26.bin', size: 524288, crc32: '4f3a914a', sha1: 'ae98eba049f1462aa1145f6959b9f9a32c97278f' }),
        new ROM({ name: 'u50.bin', merge: 'u50.bin', size: 2097152, crc32: '14b260ec', sha1: '33bda210302428d5500115d0c7a839cdfcb67d17' }),
        new ROM({ name: 'u51.bin', merge: 'u51.bin', size: 2097152, crc32: 'e7ba8cce', sha1: 'ad74a6b7d53760b19587c4a6dbea937daa7e87ce' }),
        new ROM({ name: 'u52.bin', merge: 'u52.bin', size: 2097152, crc32: '02492ee0', sha1: '64d9cc64a4ad189a8b03cf6a749ddb732b4a0014' }),
        new ROM({ name: 'u53.bin', merge: 'u53.bin', size: 2097152, crc32: 'cb4c10f0', sha1: 'a622e8bd0c938b5d38b392b247400b744d8be288' }),
        new ROM({ name: 'u60.bin', merge: 'u60.bin', size: 2097152, crc32: '903096a7', sha1: 'a243e903fef7c4a7b71383263e82e42acd869261' }),
        new ROM({ name: 'u61.bin', merge: 'u61.bin', size: 2097152, crc32: 'd89b7631', sha1: 'a66bb4955ca58fab8973ca37a0f971e9a67ce017' }),
        new ROM({ name: 'u62.bin', merge: 'u62.bin', size: 2097152, crc32: '292bfb6b', sha1: '11b385991ee990eb5ef36e136b988802b5f90fa4' }),
        new ROM({ name: 'u6.bin', merge: 'u6.bin', size: 2097152, crc32: '9dfdafaf', sha1: 'f5cb450cdc78a20c3a74c6dac05c9ac3cba08327' }),
        new ROM({ name: 'u7.bin', merge: 'u7.bin', size: 2097152, crc32: '795b17d5', sha1: 'cbfc29f1df9600c82e0fdae00edd00da5b73e14c' }),
        new ROM({ name: 'eeprom-ddonpach.bin', merge: 'eeprom-ddonpach.bin', size: 128, crc32: '315fb546', sha1: '7f597107d1610fc286413e0e93c794c80c0c554f' }),
      ],
      deviceRef: [
        new DeviceRef('m68000'),
        new DeviceRef('timer'),
        new DeviceRef('screen'),
        new DeviceRef('palette'),
        new DeviceRef('gfxdecode'),
        new DeviceRef('tmap038'),
        new DeviceRef('tmap038'),
        new DeviceRef('tmap038'),
        new DeviceRef('93c46_16'),
        new DeviceRef('gfxdecode'),
        new DeviceRef('speaker'),
        new DeviceRef('ymz280b'),
      ],
    }),

    new Machine({
      // Game with clones that have DeviceRefs with ROM files
      name: 'galaga',
      description: 'Galaga (Namco rev. B)',
      rom: [
        new ROM({ name: 'gg1_1b.3p', size: 4096, crc32: 'ab036c9f', sha1: 'ca7f5da42d4e76fd89bb0b35198a23c01462fbfe' }),
        new ROM({ name: 'gg1_2b.3m', size: 4096, crc32: 'd9232240', sha1: 'ab202aa259c3d332ef13dfb8fc8580ce2a5a253d' }),
        new ROM({ name: 'gg1_3.2m', size: 4096, crc32: '753ce503', sha1: '481f443aea3ed3504ec2f3a6bfcf3cd47e2f8f81' }),
        new ROM({ name: 'gg1_4b.2l', size: 4096, crc32: '499fcc76', sha1: 'ddb8b121903646c320939c7d13f4aa4ebb130378' }),
        new ROM({ name: 'gg1_5b.3f', size: 4096, crc32: 'bb5caae3', sha1: 'e957a581463caac27bc37ca2e2a90f27e4f62b6f' }),
        new ROM({ name: 'gg1_7b.2c', size: 4096, crc32: 'd016686b', sha1: '44c1a04fba3c7c826ff484185cb881b4b22e6657' }),
        new ROM({ name: 'gg1_9.4l', size: 4096, crc32: '58b2f47c', sha1: '62f1279a784ab2f8218c4137c7accda00e6a3490' }),
        new ROM({ name: 'gg1_11.4d', size: 4096, crc32: 'ad447c80', sha1: 'e697c180178cabd1d32483c5d8889a40633f7857' }),
        new ROM({ name: 'gg1_10.4f', size: 4096, crc32: 'dd6f1afc', sha1: 'c340ed8c25e0979629a9a1730edc762bd72d0cff' }),
        new ROM({ name: 'prom-5.5n', size: 32, crc32: '54603c6b', sha1: '1a6dea13b4af155d9cb5b999a75d4f1eb9c71346' }),
        new ROM({ name: 'prom-4.2n', size: 256, crc32: '59b6edab', sha1: '0281de86c236c88739297ff712e0a4f5c8bf8ab9' }),
        new ROM({ name: 'prom-3.1c', size: 256, crc32: '4a04bb6b', sha1: 'cdd4bc1013f5c11984fdc4fd10e2d2e27120c1e5' }),
        new ROM({ name: 'prom-1.1d', size: 256, crc32: '7a2815b4', sha1: '085ada18c498fdb18ecedef0ea8fe9217edb7b46' }),
        new ROM({ name: 'prom-2.5c', size: 256, crc32: '77245b66', sha1: '0c4d0bee858b97632411c440bea6948a74759746' }),
      ],
      deviceRef: [
        new DeviceRef('z80'),
        new DeviceRef('z80'),
        new DeviceRef('z80'),
        new DeviceRef('ls259'),
        new DeviceRef('namco51'),
        new DeviceRef('mb8843'),
        new DeviceRef('namco54'),
        new DeviceRef('mb8844'),
        new DeviceRef('namco06'),
        new DeviceRef('ls259'),
        new DeviceRef('watchdog'),
        new DeviceRef('screen'),
        new DeviceRef('gfxdecode'),
        new DeviceRef('palette'),
        new DeviceRef('namco_05xx_starfield'),
        new DeviceRef('speaker'),
        new DeviceRef('namco'),
        new DeviceRef('discrete'),
      ],
    }),
    new Machine({
      name: 'galagamf',
      cloneOf: 'galaga',
      romOf: 'galaga',
      description: 'Galaga (Midway set 1 with fast shoot hack)',
      rom: [
        new ROM({ name: '3200a.bin', size: 4096, crc32: '3ef0b053', sha1: '0c04a362b737998c0952a753fb3fd8c8a17e9b46' }),
        new ROM({ name: '3300b.bin', size: 4096, crc32: '1b280831', sha1: 'f7ea12e61929717ebe43a4198a97f109845a2c62' }),
        new ROM({ name: '3400c.bin', size: 4096, crc32: '16233d33', sha1: 'a7eb799be5e23058754a92b15e6527bfbb47a354' }),
        new ROM({ name: '3500d.bin', size: 4096, crc32: '0aaf5c23', sha1: '3f4b0bb960bf002261e9c1278c88f594c6aa8ab6' }),
        new ROM({ name: '3600fast.bin', size: 4096, crc32: '23d586e5', sha1: '43346c69385e9091e64cff6c027ac2689cafcbb9' }),
        new ROM({ name: '3700g.bin', size: 4096, crc32: 'b07f0aa4', sha1: '7528644a8480d0be2d0d37069515ed319e94778f' }),
        new ROM({ name: '2600j.bin', merge: 'gg1_9.4l', size: 4096, crc32: '58b2f47c', sha1: '62f1279a784ab2f8218c4137c7accda00e6a3490' }),
        new ROM({ name: '2800l.bin', merge: 'gg1_11.4d', size: 4096, crc32: 'ad447c80', sha1: 'e697c180178cabd1d32483c5d8889a40633f7857' }),
        new ROM({ name: '2700k.bin', merge: 'gg1_10.4f', size: 4096, crc32: 'dd6f1afc', sha1: 'c340ed8c25e0979629a9a1730edc762bd72d0cff' }),
        new ROM({ name: 'prom-5.5n', merge: 'prom-5.5n', size: 32, crc32: '54603c6b', sha1: '1a6dea13b4af155d9cb5b999a75d4f1eb9c71346' }),
        new ROM({ name: 'prom-4.2n', merge: 'prom-4.2n', size: 256, crc32: '59b6edab', sha1: '0281de86c236c88739297ff712e0a4f5c8bf8ab9' }),
        new ROM({ name: 'prom-3.1c', merge: 'prom-3.1c', size: 256, crc32: '4a04bb6b', sha1: 'cdd4bc1013f5c11984fdc4fd10e2d2e27120c1e5' }),
        new ROM({ name: 'prom-1.1d', merge: 'prom-1.1d', size: 256, crc32: '7a2815b4', sha1: '085ada18c498fdb18ecedef0ea8fe9217edb7b46' }),
        new ROM({ name: 'prom-2.5c', merge: 'prom-2.5c', size: 256, crc32: '77245b66', sha1: '0c4d0bee858b97632411c440bea6948a74759746' }),
      ],
      deviceRef: [
        new DeviceRef('z80'),
        new DeviceRef('z80'),
        new DeviceRef('z80'),
        new DeviceRef('ls259'),
        new DeviceRef('namco51'),
        new DeviceRef('mb8843'),
        new DeviceRef('namco54'),
        new DeviceRef('mb8844'),
        new DeviceRef('namco06'),
        new DeviceRef('ls259'),
        new DeviceRef('watchdog'),
        new DeviceRef('screen'),
        new DeviceRef('gfxdecode'),
        new DeviceRef('palette'),
        new DeviceRef('namco_05xx_starfield'),
        new DeviceRef('speaker'),
        new DeviceRef('namco'),
        new DeviceRef('discrete'),
      ],
    }),
    new Machine({
      name: 'galagamk',
      cloneOf: 'galaga',
      romOf: 'galaga',
      description: 'Galaga (Midway set 2)',
      rom: [
        new ROM({ name: 'mk2-1', size: 4096, crc32: '23cea1e2', sha1: '18db33ade0ca6e47cc48aa151d2ccbb4646e3ae3' }),
        new ROM({ name: 'mk2-2', size: 4096, crc32: '89695b1a', sha1: 'fda5557018884e903f855bf3b69a25d75ed8a767' }),
        new ROM({ name: '3400c.bin', size: 4096, crc32: '16233d33', sha1: 'a7eb799be5e23058754a92b15e6527bfbb47a354' }),
        new ROM({ name: 'mk2-4', size: 4096, crc32: '24b767f5', sha1: 'd4c03e2ed582cfa7f8168ac352f790ef7af54cb8' }),
        new ROM({ name: 'gg1-5.3f', size: 4096, crc32: '3102fccd', sha1: 'd29b68d6aab3217fa2106b3507b9273ff3f927bf' }),
        new ROM({ name: 'gg1-7b.2c', merge: 'gg1_7b.2c', size: 4096, crc32: 'd016686b', sha1: '44c1a04fba3c7c826ff484185cb881b4b22e6657' }),
        new ROM({ name: 'gg1-9.4l', merge: 'gg1_9.4l', size: 4096, crc32: '58b2f47c', sha1: '62f1279a784ab2f8218c4137c7accda00e6a3490' }),
        new ROM({ name: 'gg1-11.4d', merge: 'gg1_11.4d', size: 4096, crc32: 'ad447c80', sha1: 'e697c180178cabd1d32483c5d8889a40633f7857' }),
        new ROM({ name: 'gg1-10.4f', merge: 'gg1_10.4f', size: 4096, crc32: 'dd6f1afc', sha1: 'c340ed8c25e0979629a9a1730edc762bd72d0cff' }),
        new ROM({ name: 'prom-5.5n', merge: 'prom-5.5n', size: 32, crc32: '54603c6b', sha1: '1a6dea13b4af155d9cb5b999a75d4f1eb9c71346' }),
        new ROM({ name: 'prom-4.2n', merge: 'prom-4.2n', size: 256, crc32: '59b6edab', sha1: '0281de86c236c88739297ff712e0a4f5c8bf8ab9' }),
        new ROM({ name: 'prom-3.1c', merge: 'prom-3.1c', size: 256, crc32: '4a04bb6b', sha1: 'cdd4bc1013f5c11984fdc4fd10e2d2e27120c1e5' }),
        new ROM({ name: 'prom-1.1d', merge: 'prom-1.1d', size: 256, crc32: '7a2815b4', sha1: '085ada18c498fdb18ecedef0ea8fe9217edb7b46' }),
        new ROM({ name: 'prom-2.5c', merge: 'prom-2.5c', size: 256, crc32: '77245b66', sha1: '0c4d0bee858b97632411c440bea6948a74759746' }),
      ],
      deviceRef: [
        new DeviceRef('z80'),
        new DeviceRef('z80'),
        new DeviceRef('z80'),
        new DeviceRef('ls259'),
        new DeviceRef('namco51'),
        new DeviceRef('mb8843'),
        new DeviceRef('namco54'),
        new DeviceRef('mb8844'),
        new DeviceRef('namco06'),
        new DeviceRef('ls259'),
        new DeviceRef('watchdog'),
        new DeviceRef('screen'),
        new DeviceRef('gfxdecode'),
        new DeviceRef('palette'),
        new DeviceRef('namco_05xx_starfield'),
        new DeviceRef('speaker'),
        new DeviceRef('namco'),
        new DeviceRef('discrete'),
      ],
    }),
    new Machine({
      name: 'galagamw',
      cloneOf: 'galaga',
      romOf: 'galaga',
      description: 'Galaga (Midway set 1)',
      rom: [
        new ROM({ name: '3200a.bin', size: 4096, crc32: '3ef0b053', sha1: '0c04a362b737998c0952a753fb3fd8c8a17e9b46' }),
        new ROM({ name: '3300b.bin', size: 4096, crc32: '1b280831', sha1: 'f7ea12e61929717ebe43a4198a97f109845a2c62' }),
        new ROM({ name: '3400c.bin', size: 4096, crc32: '16233d33', sha1: 'a7eb799be5e23058754a92b15e6527bfbb47a354' }),
        new ROM({ name: '3500d.bin', size: 4096, crc32: '0aaf5c23', sha1: '3f4b0bb960bf002261e9c1278c88f594c6aa8ab6' }),
        new ROM({ name: '3600e.bin', size: 4096, crc32: 'bc556e76', sha1: '0d3d68243c4571d985b4d8f7e0ea9f6fcffa2116' }),
        new ROM({ name: '3700g.bin', size: 4096, crc32: 'b07f0aa4', sha1: '7528644a8480d0be2d0d37069515ed319e94778f' }),
        new ROM({ name: '2600j.bin', merge: 'gg1_9.4l', size: 4096, crc32: '58b2f47c', sha1: '62f1279a784ab2f8218c4137c7accda00e6a3490' }),
        new ROM({ name: '2800l.bin', merge: 'gg1_11.4d', size: 4096, crc32: 'ad447c80', sha1: 'e697c180178cabd1d32483c5d8889a40633f7857' }),
        new ROM({ name: '2700k.bin', merge: 'gg1_10.4f', size: 4096, crc32: 'dd6f1afc', sha1: 'c340ed8c25e0979629a9a1730edc762bd72d0cff' }),
        new ROM({ name: 'prom-5.5n', merge: 'prom-5.5n', size: 32, crc32: '54603c6b', sha1: '1a6dea13b4af155d9cb5b999a75d4f1eb9c71346' }),
        new ROM({ name: 'prom-4.2n', merge: 'prom-4.2n', size: 256, crc32: '59b6edab', sha1: '0281de86c236c88739297ff712e0a4f5c8bf8ab9' }),
        new ROM({ name: 'prom-3.1c', merge: 'prom-3.1c', size: 256, crc32: '4a04bb6b', sha1: 'cdd4bc1013f5c11984fdc4fd10e2d2e27120c1e5' }),
        new ROM({ name: 'prom-1.1d', merge: 'prom-1.1d', size: 256, crc32: '7a2815b4', sha1: '085ada18c498fdb18ecedef0ea8fe9217edb7b46' }),
        new ROM({ name: 'prom-2.5c', merge: 'prom-2.5c', size: 256, crc32: '77245b66', sha1: '0c4d0bee858b97632411c440bea6948a74759746' }),
      ],
      deviceRef: [
        new DeviceRef('z80'),
        new DeviceRef('z80'),
        new DeviceRef('z80'),
        new DeviceRef('ls259'),
        new DeviceRef('namco51'),
        new DeviceRef('mb8843'),
        new DeviceRef('namco54'),
        new DeviceRef('mb8844'),
        new DeviceRef('namco06'),
        new DeviceRef('ls259'),
        new DeviceRef('watchdog'),
        new DeviceRef('screen'),
        new DeviceRef('gfxdecode'),
        new DeviceRef('palette'),
        new DeviceRef('namco_05xx_starfield'),
        new DeviceRef('speaker'),
        new DeviceRef('namco'),
        new DeviceRef('discrete'),
      ],
    }),
    new Machine({
      name: 'galagao',
      cloneOf: 'galaga',
      romOf: 'galaga',
      description: 'Galaga (Namco)',
      rom: [
        new ROM({ name: 'gg1-1.3p', size: 4096, crc32: 'a3a0f743', sha1: '6907773db7c002ecde5e41853603d53387c5c7cd' }),
        new ROM({ name: 'gg1-2.3m', size: 4096, crc32: '43bb0d5c', sha1: '666975aed5ce84f09794c54b550d64d95ab311f0' }),
        new ROM({ name: 'gg1-3.2m', merge: 'gg1_3.2m', size: 4096, crc32: '753ce503', sha1: '481f443aea3ed3504ec2f3a6bfcf3cd47e2f8f81' }),
        new ROM({ name: 'gg1-4.2l', size: 4096, crc32: '83874442', sha1: '366cb0dbd31b787e64f88d182108b670d03b393e' }),
        new ROM({ name: 'gg1-5.3f', size: 4096, crc32: '3102fccd', sha1: 'd29b68d6aab3217fa2106b3507b9273ff3f927bf' }),
        new ROM({ name: 'gg1-7.2c', size: 4096, crc32: '8995088d', sha1: 'd6cb439de0718826d1a0363c9d77de8740b18ecf' }),
        new ROM({ name: 'gg1-9.4l', merge: 'gg1_9.4l', size: 4096, crc32: '58b2f47c', sha1: '62f1279a784ab2f8218c4137c7accda00e6a3490' }),
        new ROM({ name: 'gg1-11.4d', merge: 'gg1_11.4d', size: 4096, crc32: 'ad447c80', sha1: 'e697c180178cabd1d32483c5d8889a40633f7857' }),
        new ROM({ name: 'gg1-10.4f', merge: 'gg1_10.4f', size: 4096, crc32: 'dd6f1afc', sha1: 'c340ed8c25e0979629a9a1730edc762bd72d0cff' }),
        new ROM({ name: 'prom-5.5n', merge: 'prom-5.5n', size: 32, crc32: '54603c6b', sha1: '1a6dea13b4af155d9cb5b999a75d4f1eb9c71346' }),
        new ROM({ name: 'prom-4.2n', merge: 'prom-4.2n', size: 256, crc32: '59b6edab', sha1: '0281de86c236c88739297ff712e0a4f5c8bf8ab9' }),
        new ROM({ name: 'prom-3.1c', merge: 'prom-3.1c', size: 256, crc32: '4a04bb6b', sha1: 'cdd4bc1013f5c11984fdc4fd10e2d2e27120c1e5' }),
        new ROM({ name: 'prom-1.1d', merge: 'prom-1.1d', size: 256, crc32: '7a2815b4', sha1: '085ada18c498fdb18ecedef0ea8fe9217edb7b46' }),
        new ROM({ name: 'prom-2.5c', merge: 'prom-2.5c', size: 256, crc32: '77245b66', sha1: '0c4d0bee858b97632411c440bea6948a74759746' }),
      ],
      deviceRef: [
        new DeviceRef('z80'),
        new DeviceRef('z80'),
        new DeviceRef('z80'),
        new DeviceRef('ls259'),
        new DeviceRef('namco51'),
        new DeviceRef('mb8843'),
        new DeviceRef('namco54'),
        new DeviceRef('mb8844'),
        new DeviceRef('namco06'),
        new DeviceRef('ls259'),
        new DeviceRef('watchdog'),
        new DeviceRef('screen'),
        new DeviceRef('gfxdecode'),
        new DeviceRef('palette'),
        new DeviceRef('namco_05xx_starfield'),
        new DeviceRef('speaker'),
        new DeviceRef('namco'),
        new DeviceRef('discrete'),
      ],
    }),
    new Machine({
      name: 'gallag',
      cloneOf: 'galaga',
      romOf: 'galaga',
      description: 'Gallag',
      rom: [
        new ROM({ name: 'gallag.1', size: 4096, crc32: 'a3a0f743', sha1: '6907773db7c002ecde5e41853603d53387c5c7cd' }),
        new ROM({ name: 'gallag.2', size: 4096, crc32: '5eda60a7', sha1: '853d7b974dd04abd7af3a8ba2681dfabce4dce18' }),
        new ROM({ name: 'gallag.3', merge: 'gg1_3.2m', size: 4096, crc32: '753ce503', sha1: '481f443aea3ed3504ec2f3a6bfcf3cd47e2f8f81' }),
        new ROM({ name: 'gallag.4', size: 4096, crc32: '83874442', sha1: '366cb0dbd31b787e64f88d182108b670d03b393e' }),
        new ROM({ name: 'gallag.5', size: 4096, crc32: '3102fccd', sha1: 'd29b68d6aab3217fa2106b3507b9273ff3f927bf' }),
        new ROM({ name: 'gallag.7', size: 4096, crc32: '8995088d', sha1: 'd6cb439de0718826d1a0363c9d77de8740b18ecf' }),
        new ROM({ name: 'gallag.6', size: 4096, crc32: '001b70bc', sha1: 'b465eee91e75257b7b049d49c0064ab5fd66c576' }),
        new ROM({ name: 'gallag.8', size: 4096, crc32: '169a98a4', sha1: 'edbeb11076061e744ea88d9899dbdfe0964c7e78' }),
        new ROM({ name: 'gallag.a', merge: 'gg1_11.4d', size: 4096, crc32: 'ad447c80', sha1: 'e697c180178cabd1d32483c5d8889a40633f7857' }),
        new ROM({ name: 'gallag.9', merge: 'gg1_10.4f', size: 4096, crc32: 'dd6f1afc', sha1: 'c340ed8c25e0979629a9a1730edc762bd72d0cff' }),
        new ROM({ name: 'prom-5.5n', merge: 'prom-5.5n', size: 32, crc32: '54603c6b', sha1: '1a6dea13b4af155d9cb5b999a75d4f1eb9c71346' }),
        new ROM({ name: 'prom-4.2n', merge: 'prom-4.2n', size: 256, crc32: '59b6edab', sha1: '0281de86c236c88739297ff712e0a4f5c8bf8ab9' }),
        new ROM({ name: 'prom-3.1c', merge: 'prom-3.1c', size: 256, crc32: '4a04bb6b', sha1: 'cdd4bc1013f5c11984fdc4fd10e2d2e27120c1e5' }),
        new ROM({ name: 'prom-1.1d', merge: 'prom-1.1d', size: 256, crc32: '7a2815b4', sha1: '085ada18c498fdb18ecedef0ea8fe9217edb7b46' }),
        new ROM({ name: 'prom-2.5c', merge: 'prom-2.5c', size: 256, crc32: '77245b66', sha1: '0c4d0bee858b97632411c440bea6948a74759746' }),
      ],
      deviceRef: [
        new DeviceRef('z80'),
        new DeviceRef('z80'),
        new DeviceRef('z80'),
        new DeviceRef('ls259'),
        new DeviceRef('namco51'),
        new DeviceRef('mb8843'),
        new DeviceRef('ls259'),
        new DeviceRef('watchdog'),
        new DeviceRef('screen'),
        new DeviceRef('gfxdecode'),
        new DeviceRef('palette'),
        new DeviceRef('namco_05xx_starfield'),
        new DeviceRef('speaker'),
        new DeviceRef('namco'),
        new DeviceRef('namco06'),
        new DeviceRef('z80'),
      ],
    }),
    new Machine({
      name: 'gatsbee',
      cloneOf: 'galaga',
      romOf: 'galaga',
      description: 'Gatsbee',
      rom: [
        new ROM({ name: '1.4b', size: 4096, crc32: '9fb8e28b', sha1: '7171e3fb37b0d6cc8f7a023c1775080d5986de99' }),
        new ROM({ name: '2.4c', size: 4096, crc32: 'bf6cb840', sha1: '5763140d32d35a38cdcb49e6de1fd5b07a9e8cc2' }),
        new ROM({ name: '3.4d', size: 4096, crc32: '3604e2dd', sha1: '1736cf8497f7ac28e92ca94fa137c144353dc192' }),
        new ROM({ name: '4.4e', size: 4096, crc32: 'bf9f613b', sha1: '41c852fc77f0f35bf48a5b81a19234ed99871c89' }),
        new ROM({ name: 'gg1-5.3f', size: 4096, crc32: '3102fccd', sha1: 'd29b68d6aab3217fa2106b3507b9273ff3f927bf' }),
        new ROM({ name: 'gg1-7.2c', size: 4096, crc32: '8995088d', sha1: 'd6cb439de0718826d1a0363c9d77de8740b18ecf' }),
        new ROM({ name: 'gallag.6', size: 4096, crc32: '001b70bc', sha1: 'b465eee91e75257b7b049d49c0064ab5fd66c576' }),
        new ROM({ name: '8.5r', size: 8192, crc32: 'b324f650', sha1: '7bcb254f7cf03bd84291b9fdc27b8962b3e12aa4' }),
        new ROM({ name: '9.6a', size: 4096, crc32: '22e339d5', sha1: '9ac2887ede802d28daa4ad0a0a54bcf7b1155a2e' }),
        new ROM({ name: '10.7a', size: 4096, crc32: '60dcf940', sha1: '6530aa5b4afef4a8422ece76a93d0c5b1d93355e' }),
        new ROM({ name: 'prom-5.5n', merge: 'prom-5.5n', size: 32, crc32: '54603c6b', sha1: '1a6dea13b4af155d9cb5b999a75d4f1eb9c71346' }),
        new ROM({ name: 'prom-4.2n', merge: 'prom-4.2n', size: 256, crc32: '59b6edab', sha1: '0281de86c236c88739297ff712e0a4f5c8bf8ab9' }),
        new ROM({ name: 'prom-3.1c', merge: 'prom-3.1c', size: 256, crc32: '4a04bb6b', sha1: 'cdd4bc1013f5c11984fdc4fd10e2d2e27120c1e5' }),
        new ROM({ name: 'prom-1.1d', merge: 'prom-1.1d', size: 256, crc32: '7a2815b4', sha1: '085ada18c498fdb18ecedef0ea8fe9217edb7b46' }),
        new ROM({ name: 'prom-2.5c', merge: 'prom-2.5c', size: 256, crc32: '77245b66', sha1: '0c4d0bee858b97632411c440bea6948a74759746' }),
      ],
      deviceRef: [
        new DeviceRef('z80'),
        new DeviceRef('z80'),
        new DeviceRef('z80'),
        new DeviceRef('ls259'),
        new DeviceRef('namco51'),
        new DeviceRef('mb8843'),
        new DeviceRef('namco54'),
        new DeviceRef('mb8844'),
        new DeviceRef('namco06'),
        new DeviceRef('ls259'),
        new DeviceRef('watchdog'),
        new DeviceRef('screen'),
        new DeviceRef('gfxdecode'),
        new DeviceRef('palette'),
        new DeviceRef('namco_05xx_starfield'),
        new DeviceRef('speaker'),
        new DeviceRef('namco'),
        new DeviceRef('discrete'),
        new DeviceRef('ls259'),
      ],
    }),
    new Machine({
      name: 'nebulbee',
      cloneOf: 'galaga',
      romOf: 'galaga',
      description: 'Nebulous Bee',
      rom: [
        new ROM({ name: 'nebulbee.01', size: 4096, crc32: 'f405f2c4', sha1: '9249afeffd8df0f24539ea9b4f88c23a6ad58d8c' }),
        new ROM({ name: 'nebulbee.02', size: 4096, crc32: '31022b60', sha1: '90e64afb4128c6dfeeee89635ea9f97a34f70f5f' }),
        new ROM({ name: 'gg1_3.2m', merge: 'gg1_3.2m', size: 4096, crc32: '753ce503', sha1: '481f443aea3ed3504ec2f3a6bfcf3cd47e2f8f81' }),
        new ROM({ name: 'nebulbee.04', size: 4096, crc32: 'd76788a5', sha1: 'adcb83cf64951d86c701a99b410e9230912f8a48' }),
        new ROM({ name: 'gg1-5', size: 4096, crc32: '3102fccd', sha1: 'd29b68d6aab3217fa2106b3507b9273ff3f927bf' }),
        new ROM({ name: 'gg1-7', size: 4096, crc32: '8995088d', sha1: 'd6cb439de0718826d1a0363c9d77de8740b18ecf' }),
        new ROM({ name: 'nebulbee.07', size: 4096, crc32: '035e300c', sha1: 'cfda2467e71c27381b7150ff8fc7b69d61df123a' }),
        new ROM({ name: 'gg1_9.4l', merge: 'gg1_9.4l', size: 4096, crc32: '58b2f47c', sha1: '62f1279a784ab2f8218c4137c7accda00e6a3490' }),
        new ROM({ name: 'gg1_11.4d', merge: 'gg1_11.4d', size: 4096, crc32: 'ad447c80', sha1: 'e697c180178cabd1d32483c5d8889a40633f7857' }),
        new ROM({ name: 'gg1_10.4f', merge: 'gg1_10.4f', size: 4096, crc32: 'dd6f1afc', sha1: 'c340ed8c25e0979629a9a1730edc762bd72d0cff' }),
        new ROM({ name: 'prom-5.5n', merge: 'prom-5.5n', size: 32, crc32: '54603c6b', sha1: '1a6dea13b4af155d9cb5b999a75d4f1eb9c71346' }),
        new ROM({ name: '2n.bin', size: 256, crc32: 'a547d33b', sha1: '7323084320bb61ae1530d916f5edd8835d4d2461' }),
        new ROM({ name: '1c.bin', size: 256, crc32: 'b6f585fb', sha1: 'dd10147c4f05fede7ae6e7a760681700a660e87e' }),
        new ROM({ name: '5c.bin', size: 256, crc32: '8bd565f6', sha1: 'bedba65816abfc2ebeacac6ee335ca6f136e3e3d' }),
        new ROM({ name: '1d.bin', size: 256, crc32: '86d92b24', sha1: '6bef9102b97c83025a2cf84e89d95f2d44c3d2ed' }),
      ],
      deviceRef: [
        new DeviceRef('z80'),
        new DeviceRef('z80'),
        new DeviceRef('z80'),
        new DeviceRef('ls259'),
        new DeviceRef('namco51'),
        new DeviceRef('mb8843'),
        new DeviceRef('ls259'),
        new DeviceRef('watchdog'),
        new DeviceRef('screen'),
        new DeviceRef('gfxdecode'),
        new DeviceRef('palette'),
        new DeviceRef('namco_05xx_starfield'),
        new DeviceRef('speaker'),
        new DeviceRef('namco'),
        new DeviceRef('namco06'),
        new DeviceRef('z80'),
      ],
    }),

    new Machine({
      // Game with DeviceRefs that have 'status=nodump' ROMs
      name: 'liblrabl',
      description: 'Libble Rabble',
      rom: [
        new ROM({ name: '5b.rom', size: 16384, crc32: 'da7a93c2', sha1: 'fe4a02cdab66722eb7b8cf58825f899b1949a6a2' }),
        new ROM({ name: '5c.rom', size: 16384, crc32: '6cae25dc', sha1: 'de74317a7d5de1865d096c377923a764be5e6879' }),
        new ROM({ name: '2c.rom', size: 8192, crc32: '7c09e50a', sha1: '5f004d60bbb7355e008a9cda137b28bc2192b8ef' }),
        new ROM({ name: '8c.rom', size: 16384, crc32: 'a00cd959', sha1: 'cc5621103c31cfbc65941615cab391db0f74e6ce' }),
        new ROM({ name: '10c.rom', size: 16384, crc32: '09ce209b', sha1: '2ed46d6592f8227bac8ab54963d9a300706ade47' }),
        new ROM({ name: '5p.rom', size: 8192, crc32: '3b4937f0', sha1: '06d9de576f1c2262c34aeb91054e68c9298af688' }),
        new ROM({ name: '9t.rom', size: 16384, crc32: 'a88e24ca', sha1: 'eada133579f19de09255084dcdc386311606a335' }),
        new ROM({ name: 'lr1-3.1r', size: 256, crc32: 'f3ec0d07', sha1: 'b0aad1fb6df79f202889600f486853995352f9c2' }),
        new ROM({ name: 'lr1-2.1s', size: 256, crc32: '2ae4f702', sha1: '838fdca9e91fea4f64a59880ac47c48973bb8fbf' }),
        new ROM({ name: 'lr1-1.1t', size: 256, crc32: '7601f208', sha1: '572d070ca387b780030ed5de38a8970b7cc14349' }),
        new ROM({ name: 'lr1-5.5l', size: 256, crc32: '940f5397', sha1: '825a7bd78a8a08d30bad2e4890ae6e9ad88b36b8' }),
        new ROM({ name: 'lr1-6.2p', size: 512, crc32: 'a6b7f850', sha1: '7cfde16dfd5c4d5b876b4fbe4f924f1385932a93' }),
        new ROM({ name: 'lr1-4.3d', size: 256, crc32: '16a9166a', sha1: '847cbaf7c88616576c410177e066ae1d792ac0ba' }),
      ],
      deviceRef: [
        new DeviceRef('mc6809e'),
        new DeviceRef('timer'),
        new DeviceRef('m68000'),
        new DeviceRef('mc6809e'),
        new DeviceRef('namco58'),
        new DeviceRef('namco56'),
        new DeviceRef('namco56'),
        new DeviceRef('screen'),
        new DeviceRef('gfxdecode'),
        new DeviceRef('palette'),
        new DeviceRef('speaker'),
        new DeviceRef('namco_15xx'),
      ],
    }),

    // ***** BIOSes *****
    new Machine({
      name: 'aristmk6',
      bios: 'yes',
      description: 'MK6 System Software/Setchips',
      rom: [
        new ROM({ name: '24013001_right.u83', bios: 'au-nsw1', size: 2097152, crc32: 'e97afedf', sha1: '10ca3b015afaff5d7812f0f5207b2535602136a5' }),
        new ROM({ name: '24013001_left.u70', bios: 'au-nsw1', size: 2097152, crc32: '06ae7e07', sha1: '39a45575b66906d73b519988d1001c99b05c5f34' }),
        new ROM({ name: '21012901_right.u83', bios: 'au-nsw2', size: 2097152, crc32: '757618f2', sha1: '43f9a3e7d544979f8c6974945914d9e099b02abd' }),
        new ROM({ name: '21012901_left.u70', bios: 'au-nsw2', size: 2097152, crc32: '0d271470', sha1: '5cd4b604bfe2fd7e9a8d08e1c7c97f17ae068479' }),
        new ROM({ name: '19012801_right.u83', bios: 'au-nsw3', size: 2097152, crc32: '5b20a96c', sha1: '5fd916b7cc2cdd51bf7dd212c1114f94dc9c7926' }),
        new ROM({ name: '19012801_left.u70', bios: 'au-nsw3', size: 2097152, crc32: 'b03bd17c', sha1: 'f281e80f6dda5b727ed71d2deebe3b0ff548773f' }),
        new ROM({ name: '13012001_right.u83', bios: 'au-nsw4', size: 2097152, crc32: 'e627dbfa', sha1: '4fedbe0975ceb7dc0ebebf18a7708d78984db9b7' }),
        new ROM({ name: '13012001_left.u70', bios: 'au-nsw4', size: 2097152, crc32: '38e8f659', sha1: '88c6acba99b0aca023c6f4d27c061c231490e9e0' }),
        new ROM({ name: '11011901_right.u83', bios: 'au-nsw5', size: 2097152, crc32: '73dcb11c', sha1: '69ae4f32a0c9141b2a82ff3935b0cd20333d2964' }),
        new ROM({ name: '11011901_left.u70', bios: 'au-nsw5', size: 2097152, crc32: 'd3dd2210', sha1: '3548f8cc39859d3f44a55f6bae48966a2d48e0eb' }),
        new ROM({ name: '11011501_right.u83', bios: 'au-nsw6', size: 2097152, crc32: 'de4c3aed', sha1: '21596a2edd20eb7de7a4ec8900a270b09c8f326f' }),
        new ROM({ name: '11011501_left.u70', bios: 'au-nsw6', size: 2097152, crc32: 'c5cc3461', sha1: '5b43c4cb6110a6ccf67cd0f3789253f6872b20c4' }),
        new ROM({ name: '09011001_right.u83', bios: 'au-nsw7', size: 2097152, crc32: '8a853f80', sha1: '9a75498f7b02c81a483b4e1c158f35f0ee4c0112' }),
        new ROM({ name: '09011001_left.u70', bios: 'au-nsw7', size: 2097152, crc32: '229c2e63', sha1: '91fd2b1acb69efe073647e93db9f11042add2feb' }),
        new ROM({ name: '07010801_right.u83', bios: 'au-nsw8', size: 2097152, crc32: '8c148c11', sha1: '5ff3be18455b4f04675fec8d5b9d881295c65e23' }),
        new ROM({ name: '07010801_left.u70', bios: 'au-nsw8', size: 2097152, crc32: '8e92af68', sha1: '00d2bb655b7964a9652896741210ec534df0b0d2' }),
        new ROM({ name: '05010601_right.u83', bios: 'au-nsw9', size: 1048576, crc32: 'c12eac11', sha1: '683b9ddc323865ace7dca37d13b55de6e42759a5' }),
        new ROM({ name: '05010601_left.u70', bios: 'au-nsw9', size: 1048576, crc32: 'b3e6b4a0', sha1: '3bf398c9257579f8e51ce716d6ebfa74fa510273' }),
        new ROM({ name: '04010501_right.u83', bios: 'au-nsw10', size: 1048576, crc32: '3daefb7a', sha1: '411471713219f4bab5ccf5fe7a12a6c138c8c550' }),
        new ROM({ name: '04010501_left.u70', bios: 'au-nsw10', size: 1048576, crc32: '21182775', sha1: '7c5b7f5aba3babc85f512a8f7d4ebc0d83eb842a' }),
        new ROM({ name: '03010301.u84', bios: 'au-nsw11', size: 1048576, crc32: 'a34a9f16', sha1: 'b8750e6ceb1715da8e5ac2f0183254e29a042641' }),
        new ROM({ name: '03010301.u71', bios: 'au-nsw11', size: 1048576, crc32: 'd793440a', sha1: 'dced4c04bde13293af77a9a1f4c5c606e3758de0' }),
        new ROM({ name: '03010301.u83', bios: 'au-nsw11', size: 1048576, crc32: 'c8580554', sha1: '58b8bfff2f8d298c4e3be2b01900800c45fa7ad7' }),
        new ROM({ name: '03010301.u70', bios: 'au-nsw11', size: 1048576, crc32: '5ae69121', sha1: '36dd3f9aaf5f7d2751d1954d67f898bc3ec71f3b' }),
        new ROM({ name: '02010201.u84', bios: 'au-nsw12', size: 1048576, crc32: '0920930f', sha1: '771b0f62442d1c75b1bb59ad82365b7ab8747173' }),
        new ROM({ name: '02010201.u71', bios: 'au-nsw12', size: 1048576, crc32: '24d5614a', sha1: 'fdcf3826dccc72b74b66379b1411cf211d5a1670' }),
        new ROM({ name: '02010201.u83', bios: 'au-nsw12', size: 1048576, crc32: '5f64a20c', sha1: '397404ab6d2a1aa3c1fc77bb9421fef7079b65a5' }),
        new ROM({ name: '02010201.u70', bios: 'au-nsw12', size: 1048576, crc32: '9b2db442', sha1: 'd512398a2d9257bd385dc50d61c63cd1a47300ba' }),
        new ROM({ name: '02010114.u84', bios: 'au-nsw13', size: 1048576, crc32: '183e3836', sha1: '4c802d0cd010bc007acb3a83e37aaa29b2d13d87' }),
        new ROM({ name: '02010114.u71', bios: 'au-nsw13', size: 1048576, crc32: '8f83c3dd', sha1: 'a5f9d80b4b515b24299d0241e1665cfd9da8bab7' }),
        new ROM({ name: '02010114.u83', bios: 'au-nsw13', size: 1048576, crc32: '945104d7', sha1: 'e372d0cf889c72b5d001b26fe4a925a28486537f' }),
        new ROM({ name: '02010114.u70', bios: 'au-nsw13', size: 1048576, crc32: '3ba4379f', sha1: '84367f12c4c9224d2ab9cae83ae8727de338408c' }),
        new ROM({ name: '25012805_right.u83', bios: 'au-qld1', size: 2097152, crc32: '2ecd8da8', sha1: '389e9668b2ba4fffed5d2721b2ce70d502fb9f67' }),
        new ROM({ name: '25012805_left.u70', bios: 'au-qld1', size: 2097152, crc32: '996f32ce', sha1: 'cf21bef745986fcbd298167453c7b8e5945ce602' }),
        new ROM({ name: '20012605_right.u83', bios: 'au-qld2', size: 2097152, crc32: '045b82ad', sha1: 'b8e4f9f826970d83ae5fd2f2898de12ad1bf2d24' }),
        new ROM({ name: '20012605_left.u70', bios: 'au-qld2', size: 2097152, crc32: '87331111', sha1: '6cdc2d81f68de23af18a975a6f27ddec246be405' }),
        new ROM({ name: '20012305_right.u83', bios: 'au-qld3', size: 2097152, crc32: 'e436c1f5', sha1: '62ee529cc971fd76aa2ccc15778e3f0c40e3e47f' }),
        new ROM({ name: '20012305_left.u70', bios: 'au-qld3', size: 2097152, crc32: 'ea8961cc', sha1: '0ebc7c3b94a6e01ee984af4711043130d9670bd3' }),
        new ROM({ name: '14011605_right.u83', bios: 'au-qld4', size: 2097152, crc32: '2bec5b74', sha1: '854733cada75e632f01f7096d4740ed4941a3d5b' }),
        new ROM({ name: '14011605_left.u70', bios: 'au-qld4', size: 2097152, crc32: 'cd26d4f0', sha1: '40822714abf08aeb08d827dbd8cd099f86803754' }),
        new ROM({ name: '04041205_right.u83', bios: 'au-qld5', size: 1048576, crc32: 'ca6bc86c', sha1: '69fe7fc35694e4cd7f861bff4ec3a6165a81df6e' }),
        new ROM({ name: '04041205_left.u70', bios: 'au-qld5', size: 1048576, crc32: 'dfb9a119', sha1: '814a5a7877392aec4e4871d7f0e19d2fbd717409' }),
        new ROM({ name: '03130334_right.u83', bios: 'au-qld6', size: 2097152, crc32: 'bce3d97f', sha1: 'da36377cc1465022a2434703adee63bf48c71a9c' }),
        new ROM({ name: '03130334_left.u70', bios: 'au-qld6', size: 2097152, crc32: '02175fde', sha1: '4e9a9e1e803a0c84b06aec99dc3147dd7a919eee' }),
        new ROM({ name: '01040505.u84', bios: 'au-qld7', size: 1048576, crc32: 'cf5a9d1e', sha1: '0ebba478fc883831d70b0fa95f43e5f93b07ae9e' }),
        new ROM({ name: '01040505.u71', bios: 'au-qld7', size: 1048576, crc32: 'f56ea77e', sha1: '319be1bee66a289e2c1f6beec07758f79aa0cf16' }),
        new ROM({ name: '01040505.u83', bios: 'au-qld7', size: 1048576, crc32: '90f32169', sha1: '228be8b4a9eb6b2acf7f7a7561bd194009936026' }),
        new ROM({ name: '01040505.u70', bios: 'au-qld7', size: 1048576, crc32: 'b9ddea66', sha1: 'f4bfdeada39a3f0094d6468b7374a34f88f5df7f' }),
        new ROM({ name: '03030708_right.u83', bios: 'au-sa1', size: 1048576, crc32: 'b4b3c6a5', sha1: '5747f98a6eaa5c24a23d1d76a28b33a3bfbbfd1f' }),
        new ROM({ name: '03030708_left.u70', bios: 'au-sa1', size: 1048576, crc32: '4e5ad823', sha1: '77ab1c29c6172cfdcef776222a72b2b44114d4da' }),
        new ROM({ name: '14011913_right.u83', bios: 'nz1', size: 2097152, crc32: '01d13b89', sha1: 'b1013366d0803dfbec5a5f90f6a5cea862de0513' }),
        new ROM({ name: '14011913_left.u70', bios: 'nz1', size: 2097152, crc32: '9a4cefdf', sha1: '6c15bc565ede8af19361d60ee1e6657a8055c92c' }),
        new ROM({ name: '14010152_right.u83', bios: 'nz2', size: 2097152, crc32: '7e3f61f6', sha1: '1e27d72c35b0c633187159ef434f22398df28882' }),
        new ROM({ name: '14010152_left.u70', bios: 'nz2', size: 2097152, crc32: '2716e1ef', sha1: '81fe1ae4f9cd1bcb24795ce85913ee22ed0fabcd' }),
        new ROM({ name: '02061013_right.u83', bios: 'nz3', size: 1048576, crc32: '7a8619a5', sha1: 'bd03ddb68817c1660b009e102ccf69e5b603b875' }),
        new ROM({ name: '02061013_left.u70', bios: 'nz3', size: 1048576, crc32: 'e70a7007', sha1: '0935f924866162d9c0fbdbb99391cbf730a04b76' }),
        new ROM({ name: '02060913_right.u83', bios: 'nz4', size: 1048576, crc32: '31068c41', sha1: '962da0079495a64f7ffb34be643892c272017cc9' }),
        new ROM({ name: '02060913_left.u70', bios: 'nz4', size: 1048576, crc32: 'd6a6713c', sha1: '0f3bb2746f1a6fa6a587fd50827299408a3b28d2' }),
        new ROM({ name: '15011025_right.u83', bios: 'my', size: 2097152, crc32: 'bf21a975', sha1: 'a251b1a7342387300689cd50fe4ce7975b903ac5' }),
        new ROM({ name: '15011025_left.u70', bios: 'my', size: 2097152, crc32: 'c02e14b0', sha1: '6bf98927813519dfe60e582dbe5be3ccd87f7c91' }),
        new ROM({ name: '24010467_right.u83', bios: 'afr', size: 2097152, crc32: 'eddeff13', sha1: '77ccbcf40aeb7305eb13d6d24efafd09955f1eac' }),
        new ROM({ name: '24010467_left.u70', bios: 'afr', size: 2097152, crc32: '9093d820', sha1: '05bb14895e3077d277a1d0822036d08f359c0307' }),
        new ROM({ name: '01.04.11_right.u83', bios: 'us1', size: 2097152, crc32: '2dae8ca0', sha1: '7a0fb38b4c1ac7195d15bdab6f0cfb16c78430f0' }),
        new ROM({ name: '01.04.11_left.u70', bios: 'us1', size: 2097152, crc32: '787f2b07', sha1: '2548289e44f4b935346b759afb5383bdbac04c3e' }),
        new ROM({ name: '01.04.10_right.u83', bios: 'us2', size: 2097152, crc32: '82ce2fcc', sha1: '4c8fb3db084a67e99d1420b3f895a06ce9ef5ec2' }),
        new ROM({ name: '01.04.10_left.u70', bios: 'us2', size: 2097152, crc32: '9d9d52c1', sha1: 'b957220cdbedd516c219d1bfc28807ce466df93f' }),
        new ROM({ name: '01.04.08_right.u83', bios: 'us3', size: 2097152, crc32: '95333304', sha1: '7afe49d6c5e4d6820f349778557daa88c5366a51' }),
        new ROM({ name: '01.04.08_left.u70', bios: 'us3', size: 2097152, crc32: '0dfcad10', sha1: '53798be000304aed38909f5fd8470a68bedd8229' }),
        new ROM({ name: '01.04.07_right.u83', bios: 'us4', size: 2097152, crc32: '23c28e22', sha1: '98f24a1f86232b6c2c288a61ec7d60c867f192e5' }),
        new ROM({ name: '01.04.07_left.u70', bios: 'us4', size: 2097152, crc32: 'acfb0fe0', sha1: 'b1a772d7978e6ff4406a5bb39a71cb3f89608e72' }),
        new ROM({ name: '01.04.04_right.u83', bios: 'us5', size: 2097152, crc32: 'e57ba02d', sha1: '8e29403e6b619eeab41dc171221720bc7820ccdc' }),
        new ROM({ name: '01.04.04_left.u70', bios: 'us5', size: 2097152, crc32: 'b984a92c', sha1: '90f7a61302caee40195c08565bdac856a3234c1d' }),
        new ROM({ name: '01.03.17_right.u83', bios: 'us6', size: 2097152, crc32: '1582714b', sha1: '92d0a15314ffe526159bef9a364898dd1ebdfde7' }),
        new ROM({ name: '01.03.17_left.u70', bios: 'us6', size: 2097152, crc32: 'a88193dc', sha1: 'c9e1d483edaecd318d2e5fc8a54e84516c93e0ca' }),
        new ROM({ name: '01.03.14_right.u83', bios: 'us7', size: 2097152, crc32: '889ffd82', sha1: '9c98c9cdcf5f7d05095f11006418133029e9f0f8' }),
        new ROM({ name: '01.03.14_left.u70', bios: 'us7', size: 2097152, crc32: '7138fec4', sha1: 'f81331d1875ac574d3e6c98be218ff25c6c7be5a' }),
        new ROM({ name: '01.03.07_right.u83', bios: 'us8', size: 2097152, crc32: '2ebccc4e', sha1: '9342724e4451e9ab24ceae208284b50abd4f0be3' }),
        new ROM({ name: '01.03.07_left.u70', bios: 'us8', size: 2097152, crc32: 'a3632da4', sha1: '1c96a88e86095b81801ab88e36a4cdfa4b893265' }),
        new ROM({ name: '01.03.06_right.u83', bios: 'us9', size: 2097152, crc32: 'bd48ca55', sha1: '8fb1576cbeb1c64c358880714740195d2e73e03e' }),
        new ROM({ name: '01.03.06_left.u70', bios: 'us9', size: 2097152, crc32: '2f9d9a29', sha1: 'fdebfaca9a579d7249379f19aef22fbfd66bf943' }),
        new ROM({ name: '01.03.05_right.u83', bios: 'us10', size: 2097152, crc32: '2c7f1ec3', sha1: 'd03167f43ed6f9596080d91472695829378cef0a' }),
        new ROM({ name: '01.03.05_left.u70', bios: 'us10', size: 2097152, crc32: '0095e3f9', sha1: 'd2e8786158b1ab0a614aab21cf1d14cbc04754af' }),
        new ROM({ name: '01.03.03e_right.u83', bios: 'us11', size: 2097152, crc32: '2255e263', sha1: '5e9e093aaa17172f47a14c3baf7f6f0f73b19398' }),
        new ROM({ name: '01.03.03e_left.u70', bios: 'us11', size: 2097152, crc32: 'ea50729a', sha1: '14b5a71bfb91ac366ddcb5f77fb54127808f8163' }),
        new ROM({ name: '01.03.03a_right.u83', bios: 'us12', size: 2097152, crc32: '253415f4', sha1: '50dc77ad87bc6be1932dda2fd4865602c8c49729' }),
        new ROM({ name: '01.03.03a_left.u70', bios: 'us12', size: 2097152, crc32: '4ab5dd40', sha1: 'a6812cc624e6a98ea7b0697e2797fe10ba8e303e' }),
        new ROM({ name: '01.02.08_right.u2', bios: 'us13', size: 1048576, crc32: 'aaaeac8c', sha1: 'a565e5fcb4f55f31e7d36be40eec234248a66efd' }),
        new ROM({ name: '01.02.08_left.u3', bios: 'us13', size: 1048576, crc32: 'f29fd1bf', sha1: '33e043d2616e10a1c7a0936c3d208f9bcc2ca6f3' }),
        new ROM({ name: '06.03.04_right.u2', bios: 'set-us1', size: 1048576, crc32: '6f5f5ef1', sha1: '70a43fba4de47ed8dcf38b25eafd5873f3428e72' }),
        new ROM({ name: '06.03.04_left.u3', bios: 'set-us1', size: 1048576, crc32: '7034f26b', sha1: '7be78f23bec38d05240cdfe1186ec0c8291f5a1c' }),
        new ROM({ name: '06.03.03_right.u2', bios: 'set-us2', size: 1048576, crc32: '98763498', sha1: '246e95cc12eb34f946b2f4938c59217718f6d841' }),
        new ROM({ name: '06.03.03_left.u3', bios: 'set-us2', size: 1048576, crc32: 'a6924238', sha1: 'b71ab39bf9c1fdbab556028138749e8c040ec83c' }),
        new ROM({ name: '06.02.20_right.u83', bios: 'set-us3', size: 1048576, crc32: 'e4001f60', sha1: '5da34efb1ac0f7c84a48e09363d20cfecda4bcf1' }),
        new ROM({ name: '06.02.20_left.u70', bios: 'set-us3', size: 1048576, crc32: '199ed3b9', sha1: 'e3ee81ffd713f09e35a10c38e4f59282e2c5cd30' }),
        new ROM({ name: '06.02.04_right.u2', bios: 'set-us4', size: 1048576, crc32: '1cf5a853', sha1: '64d17efcce702df7a0b0e151293199478e25226d' }),
        new ROM({ name: '06.02.04_left.u3', bios: 'set-us4', size: 1048576, crc32: '117b75f2', sha1: '2129286853d3c50b8a943b71334d4ef6b98adc05' }),
      ],
      deviceRef: [
        new DeviceRef('sh4le'),
        new DeviceRef('ns16550'),
        new DeviceRef('ns16550'),
        new DeviceRef('93c56_16'),
        new DeviceRef('screen'),
        new DeviceRef('palette'),
      ],
    }),

    // ***** Devices *****
    new Machine({ name: '93c46_16', device: 'yes' }),
    new Machine({ name: '93c56_16', device: 'yes' }),
    new Machine({
      name: 'alps_3255190x',
      device: 'yes',
      description: 'ALPS 32551901/32551902 Floppy Drive',
      deviceRef: [
        new DeviceRef('speaker'),
        new DeviceRef('flopsnd'),
      ],
    }),
    new Machine({ name: 'ay8910', device: 'yes' }),
    new Machine({
      name: 'c1530',
      device: 'yes',
      description: 'Commodore 1530 Datassette',
      deviceRef: new DeviceRef('cassette_image'),
    }),
    new Machine({
      name: 'c1541',
      device: 'yes',
      description: 'Commodore 1541 Disk Drive',
      rom: [
        new ROM({ name: '901229-01.uab5', bios: 'r1', size: 8192, crc32: '9a48d3f0', sha1: '7a1054c6156b51c25410caec0f609efb079d3a77' }),
        new ROM({ name: '901229-02.uab5', bios: 'r2', size: 8192, crc32: 'b29bab75', sha1: '91321142e226168b1139c30c83896933f317d000' }),
        new ROM({ name: '901229-03.uab5', bios: 'r3', size: 8192, crc32: '9126e74a', sha1: '03d17bd745066f1ead801c5183ac1d3af7809744' }),
        new ROM({ name: '901229-04.uab5', bios: 'r4', size: 8192, status: 'nodump' }),
        new ROM({ name: '901229-05 ae.uab5', bios: 'r5', size: 8192, crc32: '361c9f37', sha1: 'f5d60777440829e46dc91285e662ba072acd2d8b' }),
        new ROM({ name: '901229-06 aa.uab5', bios: 'r6', size: 8192, crc32: '3a235039', sha1: 'c7f94f4f51d6de4cdc21ecbb7e57bb209f0530c0' }),
        new ROM({ name: 'jiffydos 1541.uab5', bios: 'jiffydos', size: 8192, crc32: 'bc7e4aeb', sha1: 'db6cfaa6d9b78d58746c811de29f3b1f44d99ddf' }),
        new ROM({ name: 'speed-dosplus.uab5', bios: 'speeddos', size: 16384, crc32: 'f9db1eac', sha1: '95407e59a9c1d26a0e4bcf2c244cfe8942576e2c' }),
        new ROM({ name: 'rolo27.uab5', bios: 'rolo27', size: 8192, crc32: '171c7962', sha1: '04c892c4b3d7c74750576521fa081f07d8ca8557' }),
        new ROM({ name: 'ttd34.uab5', bios: 'tt34', size: 32768, crc32: '518d34a1', sha1: '4d6ffdce6ab122e9627b0a839861687bcd4e03ec' }),
        new ROM({ name: 'digidos.uab5', bios: 'digidos', size: 8192, crc32: 'b3f05ea3', sha1: '99d3d848344c68410b686cda812f3788b41fead3' }),
        new ROM({ name: '325302-01.uab4', size: 8192, crc32: '29ae9752', sha1: '8e0547430135ba462525c224e76356bd3d430f11' }),
      ],
      deviceRef: [
        new DeviceRef('m6502'),
        new DeviceRef('mos6522'),
        new DeviceRef('mos6522'),
        new DeviceRef('c64h156'),
        new DeviceRef('floppy_connector'),
      ],
    }),
    new Machine({ name: 'c64_expansion_slot', device: 'yes' }),
    new Machine({ name: 'c64h156', device: 'yes' }),
    new Machine({ name: 'cassette_image', device: 'yes' }),
    new Machine({ name: 'cbm_iec', device: 'yes' }),
    new Machine({ name: 'cbm_iec_slot', device: 'yes' }),
    new Machine({ name: 'discrete', device: 'yes' }),
    new Machine({ name: 'floppy_connector', device: 'yes' }),
    new Machine({ name: 'flopsnd', device: 'yes' }),
    new Machine({ name: 'generic_latch_8', device: 'yes' }),
    new Machine({ name: 'gfxdecode', device: 'yes' }),
    new Machine({ name: 'hc259', device: 'yes' }),
    new Machine({ name: 'hd38820', device: 'yes' }),
    new Machine({ name: 'ipt_merge_all_hi', device: 'yes' }),
    new Machine({ name: 'ipt_merge_any_hi', device: 'yes' }),
    new Machine({ name: 'ls259', device: 'yes' }),
    new Machine({ name: 'm6502', device: 'yes' }),
    new Machine({ name: 'm6510', device: 'yes' }),
    new Machine({ name: 'm68000', device: 'yes' }),
    new Machine({ name: 'mb8843', device: 'yes' }),
    new Machine({ name: 'mb8844', device: 'yes' }),
    new Machine({ name: 'mc6809e', device: 'yes' }),
    new Machine({ name: 'mos6522', device: 'yes' }),
    new Machine({ name: 'mos6526', device: 'yes' }),
    new Machine({ name: 'mos6567', device: 'yes' }),
    new Machine({ name: 'mos6581', device: 'yes' }),
    new Machine({ name: 'namco', device: 'yes' }),
    new Machine({ name: 'namco_05xx_starfield', device: 'yes' }),
    new Machine({ name: 'namco_15xx', device: 'yes' }),
    new Machine({ name: 'namco06', device: 'yes' }),
    new Machine({
      name: 'namco51',
      device: 'yes',
      description: 'Namco 51xx',
      rom: new ROM({ name: '51xx.bin', size: 1024, crc32: 'c2f57ef8', sha1: '50de79e0d6a76bda95ffb02fcce369a79e6abfec' }),
      deviceRef: new DeviceRef('mb8843'),
    }),
    new Machine({
      name: 'namco54',
      device: 'yes',
      description: 'Namco 54xx',
      rom: new ROM({ name: '54xx.bin', size: 1024, crc32: 'ee7357e0', sha1: '01bdf984a49e8d0cc8761b2cc162fd6434d5afbe' }),
      deviceRef: new DeviceRef('mb8844'),
    }),
    new Machine({
      name: 'namco56',
      rom: new ROM({ name: '56xx.bin', size: 1024, status: 'nodump' }),
    }),
    new Machine({
      name: 'namco58',
      rom: new ROM({ name: '58xx.bin', size: 1024, status: 'nodump' }),
    }),
    new Machine({
      name: 'neogeo',
      bios: 'yes',
      description: 'Neo-Geo MV-6',
      rom: [
        new ROM({ name: 'sp-s2.sp1', bios: 'euro', size: 131072, crc32: '9036d879', sha1: '4f5ed7105b7128794654ce82b51723e16e389543' }),
        new ROM({ name: 'sp-s.sp1', bios: 'euro-s1', size: 131072, crc32: 'c7f2fa45', sha1: '09576ff20b4d6b365e78e6a5698ea450262697cd' }),
        new ROM({ name: 'sp-45.sp1', bios: 'asia-mv1c', size: 524288, crc32: '03cc9f6a', sha1: 'cdf1f49e3ff2bac528c21ed28449cf35b7957dc1' }),
        new ROM({ name: 'sp-s3.sp1', bios: 'asia-mv1b', size: 131072, crc32: '91b64be3', sha1: '720a3e20d26818632aedf2c2fd16c54f213543e1' }),
        new ROM({ name: 'sp-u2.sp1', bios: 'us', size: 131072, crc32: 'e72943de', sha1: '5c6bba07d2ec8ac95776aa3511109f5e1e2e92eb' }),
        new ROM({ name: 'sp-e.sp1', bios: 'us-e', size: 131072, crc32: '2723a5b5', sha1: '5dbff7531cf04886cde3ef022fb5ca687573dcb8' }),
        new ROM({ name: 'sp1-u2', bios: 'us-v2', size: 131072, crc32: '62f021f4', sha1: '62d372269e1b3161c64ae21123655a0a22ffd1bb' }),
        new ROM({ name: 'sp1-u4.bin', bios: 'us-u4', size: 131072, crc32: '1179a30f', sha1: '866817f47aa84d903d0b819d61f6ef356893d16a' }),
        new ROM({ name: 'sp1-u3.bin', bios: 'us-u3', size: 131072, crc32: '2025b7a2', sha1: '73d774746196f377111cd7aa051cc8bb5dd948b3' }),
        new ROM({ name: 'vs-bios.rom', bios: 'japan', size: 131072, crc32: 'f0e8f27d', sha1: 'ecf01eda815909f1facec62abf3594eaa8d11075' }),
        new ROM({ name: 'sp-j2.sp1', bios: 'japan-s2', size: 131072, crc32: 'acede59c', sha1: 'b6f97acd282fd7e94d9426078a90f059b5e9dd91' }),
        new ROM({ name: 'sp1.jipan.1024', bios: 'japan-s1', size: 131072, crc32: '9fb0abe4', sha1: '18a987ce2229df79a8cf6a84f968f0e42ce4e59d' }),
        new ROM({ name: 'japan-j3.bin', bios: 'japan-mv1b', size: 131072, crc32: 'dff6d41f', sha1: 'e92910e20092577a4523a6b39d578a71d4de7085' }),
        new ROM({ name: 'sp1-j3.bin', bios: 'japan-j3a', size: 131072, crc32: 'fbc6d469', sha1: '46b2b409b5b68869e367b40c846373623edb632a' }),
        new ROM({ name: 'sp-j3.sp1', bios: 'japan-mv1c', size: 524288, crc32: '486cb450', sha1: '52c21ea817928904b80745a8c8d15cbad61e1dc1' }),
        new ROM({ name: 'sp-1v1_3db8c.bin', bios: 'japan-hotel', size: 131072, crc32: '162f0ebe', sha1: 'fe1c6dd3dfcf97d960065b1bb46c1e11cb7bf271' }),
        new ROM({ name: 'uni-bios_4_0.rom', bios: 'unibios40', size: 131072, crc32: 'a7aab458', sha1: '938a0bda7d9a357240718c2cec319878d36b8f72' }),
        new ROM({ name: 'uni-bios_3_3.rom', bios: 'unibios33', size: 131072, crc32: '24858466', sha1: '0ad92efb0c2338426635e0159d1f60b4473d0785' }),
        new ROM({ name: 'uni-bios_3_2.rom', bios: 'unibios32', size: 131072, crc32: 'a4e8b9b3', sha1: 'c92f18c3f1edda543d264ecd0ea915240e7c8258' }),
        new ROM({ name: 'uni-bios_3_1.rom', bios: 'unibios31', size: 131072, crc32: '0c58093f', sha1: '29329a3448c2505e1ff45ffa75e61e9693165153' }),
        new ROM({ name: 'uni-bios_3_0.rom', bios: 'unibios30', size: 131072, crc32: 'a97c89a9', sha1: '97a5eff3b119062f10e31ad6f04fe4b90d366e7f' }),
        new ROM({ name: 'uni-bios_2_3.rom', bios: 'unibios23', size: 131072, crc32: '27664eb5', sha1: '5b02900a3ccf3df168bdcfc98458136fd2b92ac0' }),
        new ROM({ name: 'uni-bios_2_3o.rom', bios: 'unibios23o', size: 131072, crc32: '601720ae', sha1: '1b8a72c720cdb5ee3f1d735bbcf447b09204b8d9' }),
        new ROM({ name: 'uni-bios_2_2.rom', bios: 'unibios22', size: 131072, crc32: '2d50996a', sha1: '5241a4fb0c63b1a23fd1da8efa9c9a9bd3b4279c' }),
        new ROM({ name: 'uni-bios_2_1.rom', bios: 'unibios21', size: 131072, crc32: '8dabf76b', sha1: 'c23732c4491d966cf0373c65c83c7a4e88f0082c' }),
        new ROM({ name: 'uni-bios_2_0.rom', bios: 'unibios20', size: 131072, crc32: '0c12c2ad', sha1: '37bcd4d30f3892078b46841d895a6eff16dc921e' }),
        new ROM({ name: 'uni-bios_1_3.rom', bios: 'unibios13', size: 131072, crc32: 'b24b44a0', sha1: 'eca8851d30557b97c309a0d9f4a9d20e5b14af4e' }),
        new ROM({ name: 'uni-bios_1_2.rom', bios: 'unibios12', size: 131072, crc32: '4fa698e9', sha1: '682e13ec1c42beaa2d04473967840c88fd52c75a' }),
        new ROM({ name: 'uni-bios_1_2o.rom', bios: 'unibios12o', size: 131072, crc32: 'e19d3ce9', sha1: 'af88ef837f44a3af2d7144bb46a37c8512b67770' }),
        new ROM({ name: 'uni-bios_1_1.rom', bios: 'unibios11', size: 131072, crc32: '5dda0d84', sha1: '4153d533c02926a2577e49c32657214781ff29b7' }),
        new ROM({ name: 'uni-bios_1_0.rom', bios: 'unibios10', size: 131072, crc32: '0ce453a0', sha1: '3b4c0cd26c176fc6b26c3a2f95143dd478f6abf9' }),
        new ROM({ name: 'sm1.sm1', size: 131072, crc32: '94416d67', sha1: '42f9d7ddd6c0931fd64226a60dc73602b2819dcf' }),
        new ROM({ name: 'sm1.sm1', size: 131072, crc32: '94416d67', sha1: '42f9d7ddd6c0931fd64226a60dc73602b2819dcf' }),
        new ROM({ name: '000-lo.lo', size: 131072, crc32: '5a86cff2', sha1: '5992277debadeb64d1c1c64b0a92d9293eaf7e4a' }),
        new ROM({ name: 'sfix.sfix', size: 131072, crc32: 'c2ea0cfd', sha1: 'fd4a618cdcdbf849374f0a50dd8efe9dbab706c3' }),
      ],
      deviceRef: [
        new DeviceRef('m68000'),
        new DeviceRef('z80'),
        new DeviceRef('hc259'),
        new DeviceRef('screen'),
        new DeviceRef('palette'),
        new DeviceRef('neosprite_opt'),
        new DeviceRef('ipt_merge_all_hi'),
        new DeviceRef('generic_latch_8'),
        new DeviceRef('generic_latch_8'),
        new DeviceRef('ym2610'),
        new DeviceRef('watchdog'),
        new DeviceRef('upd4990a'),
        new DeviceRef('nvram'),
        new DeviceRef('speaker'),
        new DeviceRef('speaker'),
        new DeviceRef('ng_memcard'),
        new DeviceRef('neogeo_ctrl_edge'),
        new DeviceRef('neogeo_joyac'),
        new DeviceRef('neogeo_control_port'),
        new DeviceRef('neogeo_control_port'),
        new DeviceRef('neogeo_cart_slot'),
        new DeviceRef('neogeo_cart_slot'),
        new DeviceRef('neogeo_cart_slot'),
        new DeviceRef('neogeo_cart_slot'),
        new DeviceRef('neogeo_cart_slot'),
        new DeviceRef('neogeo_cart_slot'),
        new DeviceRef('software_list'),
      ],
    }),
    new Machine({ name: 'neogeo_cart_slot', device: 'yes' }),
    new Machine({ name: 'neogeo_control_port', device: 'yes' }),
    new Machine({ name: 'neogeo_joy', device: 'yes' }),
    new Machine({ name: 'neosprite_opt', device: 'yes' }),
    new Machine({ name: 'netlist_sound', device: 'yes' }),
    new Machine({ name: 'ng_memcard', device: 'yes' }),
    new Machine({ name: 'nl_stream_in', device: 'yes' }),
    new Machine({ name: 'nl_stream_out', device: 'yes' }),
    new Machine({ name: 'ns16550', device: 'yes' }),
    new Machine({ name: 'palette', device: 'yes' }),
    new Machine({ name: 'pet_datassette_port', device: 'yes' }),
    new Machine({ name: 'pet_user_port', device: 'yes' }),
    new Machine({ name: 'pls100', device: 'yes' }),
    new Machine({ name: 'pwm_display', device: 'yes' }),
    new Machine({ name: 'quickload', device: 'yes' }),
    new Machine({ name: 'ram', device: 'yes' }),
    new Machine({ name: 'screen', device: 'yes' }),
    new Machine({ name: 'sh4le', device: 'yes' }),
    new Machine({ name: 'speaker', device: 'yes' }),
    new Machine({ name: 'speaker_sound_device', device: 'yes' }),
    new Machine({ name: 'timer', device: 'yes' }),
    new Machine({ name: 'tmap038', device: 'yes' }),
    new Machine({ name: 'vcs_control_port', device: 'yes' }),
    new Machine({ name: 'vcs_joystick', device: 'yes' }),
    new Machine({ name: 'watchdog', device: 'yes' }),
    new Machine({ name: 'ym2610', device: 'yes' }),
    new Machine({ name: 'ymz280b', device: 'yes' }),
    new Machine({ name: 'z80', device: 'yes' }),
  ]);

  it('should full-non-merged', async () => {
    // Given
    const options = new Options({
      mergeRoms: MergeMode[MergeMode.FULLNONMERGED].toLowerCase(),
    });

    // When
    const result = await new DATMergerSplitter(options, new ProgressBarFake()).merge(dat);

    // Then nothing was merged
    expect(result.getParents()).toHaveLength(dat.getParents().length);
    expect(result.getGames()).toHaveLength(dat.getGames().length);

    const gameNamesToRomNames = result.getGames()
      .reduce((map, game) => {
        map.set(game.getName(), game.getRoms().map((rom) => rom.getName().replace(/[\\/]/g, '\\')));
        return map;
      }, new Map<string, string[]>());

    // Includes BIOS files
    expect(gameNamesToRomNames.get('100lions')).toIncludeAllMembers([
      '01.02.08_left.u3', '01.02.08_right.u2', '01.03.03a_left.u70', '01.03.03a_right.u83',
      '01.03.03e_left.u70', '01.03.03e_right.u83', '01.03.05_left.u70', '01.03.05_right.u83',
      '01.03.06_left.u70', '01.03.06_right.u83', '01.03.07_left.u70', '01.03.07_right.u83',
      '01.03.14_left.u70', '01.03.14_right.u83', '01.03.17_left.u70', '01.03.17_right.u83',
      '01.04.04_left.u70', '01.04.04_right.u83', '01.04.07_left.u70', '01.04.07_right.u83',
      '01.04.08_left.u70', '01.04.08_right.u83', '01.04.10_left.u70', '01.04.10_right.u83',
      '01.04.11_left.u70', '01.04.11_right.u83', '06.02.04_left.u3', '06.02.04_right.u2',
      '06.02.20_left.u70', '06.02.20_right.u83', '06.03.03_left.u3', '06.03.03_right.u2',
      '06.03.04_left.u3', '06.03.04_right.u2', '01040505.u70', '01040505.u71', '01040505.u83',
      '01040505.u84', '02010114.u70', '02010114.u71', '02010114.u83', '02010114.u84', '02010201.u70',
      '02010201.u71', '02010201.u83', '02010201.u84', '02060913_left.u70', '02060913_right.u83',
      '02061013_left.u70', '02061013_right.u83', '03010301.u70', '03010301.u71', '03010301.u83',
      '03010301.u84', '03030708_left.u70', '03030708_right.u83', '03130334_left.u70',
      '03130334_right.u83', '04010501_left.u70', '04010501_right.u83', '04041205_left.u70',
      '04041205_right.u83', '05010601_left.u70', '05010601_right.u83', '07010801_left.u70',
      '07010801_right.u83', '09011001_left.u70', '09011001_right.u83', '10219211.u73', '10219211.u86',
      '11011501_left.u70', '11011501_right.u83', '11011901_left.u70', '11011901_right.u83',
      '13012001_left.u70', '13012001_right.u83', '14010152_left.u70', '14010152_right.u83',
      '14011605_left.u70', '14011605_right.u83', '14011913_left.u70', '14011913_right.u83',
      '15011025_left.u70', '15011025_right.u83', '19012801_left.u70', '19012801_right.u83',
      '20012305_left.u70', '20012305_right.u83', '20012605_left.u70', '20012605_right.u83',
      '21012901_left.u70', '21012901_right.u83', '24010467_left.u70', '24010467_right.u83',
      '24013001_left.u70', '24013001_right.u83', '25012805_left.u70', '25012805_right.u83',
    ]);
    expect(gameNamesToRomNames.get('100lionsa')).toIncludeAllMembers([
      '01.02.08_left.u3', '01.02.08_right.u2', '01.03.03a_left.u70', '01.03.03a_right.u83',
      '01.03.03e_left.u70', '01.03.03e_right.u83', '01.03.05_left.u70', '01.03.05_right.u83',
      '01.03.06_left.u70', '01.03.06_right.u83', '01.03.07_left.u70', '01.03.07_right.u83',
      '01.03.14_left.u70', '01.03.14_right.u83', '01.03.17_left.u70', '01.03.17_right.u83',
      '01.04.04_left.u70', '01.04.04_right.u83', '01.04.07_left.u70', '01.04.07_right.u83',
      '01.04.08_left.u70', '01.04.08_right.u83', '01.04.10_left.u70', '01.04.10_right.u83',
      '01.04.11_left.u70', '01.04.11_right.u83', '06.02.04_left.u3', '06.02.04_right.u2',
      '06.02.20_left.u70', '06.02.20_right.u83', '06.03.03_left.u3', '06.03.03_right.u2',
      '06.03.04_left.u3', '06.03.04_right.u2', '01040505.u70', '01040505.u71', '01040505.u83',
      '01040505.u84', '02010114.u70', '02010114.u71', '02010114.u83', '02010114.u84', '02010201.u70',
      '02010201.u71', '02010201.u83', '02010201.u84', '02060913_left.u70', '02060913_right.u83',
      '02061013_left.u70', '02061013_right.u83', '03010301.u70', '03010301.u71', '03010301.u83',
      '03010301.u84', '03030708_left.u70', '03030708_right.u83', '03130334_left.u70',
      '03130334_right.u83', '04010501_left.u70', '04010501_right.u83', '04041205_left.u70',
      '04041205_right.u83', '05010601_left.u70', '05010601_right.u83', '07010801_left.u70',
      '07010801_right.u83', '09011001_left.u70', '09011001_right.u83', '11011501_left.u70',
      '11011501_right.u83', '11011901_left.u70', '11011901_right.u83', '13012001_left.u70',
      '13012001_right.u83', '14010152_left.u70', '14010152_right.u83', '14011605_left.u70',
      '14011605_right.u83', '14011913_left.u70', '14011913_right.u83', '15011025_left.u70',
      '15011025_right.u83', '19012801_left.u70', '19012801_right.u83', '20012305_left.u70',
      '20012305_right.u83', '20012605_left.u70', '20012605_right.u83', '21012901_left.u70',
      '21012901_right.u83', '24010467_left.u70', '24010467_right.u83', '24013001_left.u70',
      '24013001_right.u83', '25012805_left.u70', '25012805_right.u83', '30223811.u73', '30223811.u86',
    ]);
    expect(gameNamesToRomNames.get('1942')).toIncludeAllMembers([
      'sb-0.f1', 'sb-1.k6', 'sb-2.d1', 'sb-3.d2', 'sb-4.d6', 'sb-5.e8', 'sb-6.e9', 'sb-7.e10',
      'sb-8.k3', 'sb-9.m11', 'sr-01.c11', 'sr-02.f2', 'sr-08.a1', 'sr-09.a2', 'sr-10.a3', 'sr-11.a4',
      'sr-12.a5', 'sr-13.a6', 'sr-14.l1', 'sr-15.l2', 'sr-16.n1', 'sr-17.n2', 'srb-03.m3',
      'srb-04.m4', 'srb-05.m5', 'srb-06.m6', 'srb-07.m7',
    ]);
    expect(gameNamesToRomNames.get('1942a')).toIncludeAllMembers([
      'sb-0.f1', 'sb-1.k6', 'sb-2.d1', 'sb-3.d2', 'sb-4.d6', 'sb-5.e8', 'sb-6.e9', 'sb-7.e10',
      'sb-8.k3', 'sb-9.m11', 'sr-01.c11', 'sr-02.f2', 'sr-04.m4', 'sr-05.m5', 'sr-06.m6', 'sr-07.m7',
      'sr-08.a1', 'sr-09.a2', 'sr-10.a3', 'sr-11.a4', 'sr-12.a5', 'sr-13.a6', 'sr-14.l1', 'sr-15.l2',
      'sr-16.n1', 'sr-17.n2', 'sra-03.m3',
    ]);
    expect(gameNamesToRomNames.get('1942abl')).toIncludeAllMembers([
      '1.bin', '2.bin', '3.bin', '5.bin', '7.bin', '9.bin', '11.bin', '13.bin', '14.bin', '16.bin',
      'sb-0.f1', 'sb-1.k6', 'sb-2.d1', 'sb-3.d2', 'sb-4.d6', 'sb-5.e8', 'sb-6.e9', 'sb-7.e10',
      'sb-8.k3', 'sb-9.m11',
    ]);
    expect(gameNamesToRomNames.get('1942b')).toIncludeAllMembers([
      'sb-0.f1', 'sb-1.k6', 'sb-2.d1', 'sb-3.d2', 'sb-4.d6', 'sb-5.e8', 'sb-6.e9', 'sb-7.e10',
      'sb-8.k3', 'sb-9.m11', 'sr-01.c11', 'sr-02.f2', 'sr-03.m3', 'sr-04.m4', 'sr-05.m5', 'sr-06.m6',
      'sr-07.m7', 'sr-08.a1', 'sr-09.a2', 'sr-10.a3', 'sr-11.a4', 'sr-12.a5', 'sr-13.a6', 'sr-14.l1',
      'sr-15.l2', 'sr-16.n1', 'sr-17.n2',
    ]);
    expect(gameNamesToRomNames.get('1942h')).toIncludeAllMembers([
      'sb-0.f1', 'sb-1.k6', 'sb-2.d1', 'sb-3.d2', 'sb-4.d6', 'sb-5.e8', 'sb-6.e9', 'sb-7.e10',
      'sb-8.k3', 'sb-9.m11', 'sr-01.c11', 'sr-02.f2', 'sr-08.a1', 'sr-09.a2', 'sr-10.a3', 'sr-11.a4',
      'sr-12.a5', 'sr-13.a6', 'sr-14.l1', 'sr-15.l2', 'sr-16.n1', 'sr-17.n2', 'srb-06.m6',
      'srb-07.m7', 'supercharger_1942_@3.m3', 'supercharger_1942_@4.m4', 'supercharger_1942_@5.m5',
    ]);
    expect(gameNamesToRomNames.get('1942p')).toIncludeAllMembers([
      '1.bin', '2.bin', '3.bin', '04.bin', '5.bin', '6.bin', '7.bin', '8.bin', '9.bin', '10.bin',
      '11.bin', '12.bin', 'ic22.bin',
    ]);
    expect(gameNamesToRomNames.get('1942w')).toIncludeAllMembers([
      'sb-0.f1', 'sb-1.k6', 'sb-2.d1', 'sb-3.d2', 'sb-4.d6', 'sb-5.e8', 'sb-6.e9', 'sb-7.e10',
      'sb-8.k3', 'sb-9.m11', 'sr-01.c11', 'sr-08.a1', 'sr-09.a2', 'sr-10.a3', 'sr-11.a4', 'sr-12.a5',
      'sr-13.a6', 'sr-14.l1', 'sr-15.l2', 'sr-16.n1', 'sr-17.n2', 'sw-02.f2', 'sw-03.m3', 'sw-04.m4',
      'sw-05.m5', 'sw-06.m6', 'sw-07.m7',
    ]);
    expect(gameNamesToRomNames.get('aes')).toIncludeAllMembers([
      '000-lo.lo', 'neo-epo.bin', 'neo-po.bin', 'neodebug.rom', 'uni-bios_1_3.rom',
      'uni-bios_2_0.rom', 'uni-bios_2_1.rom', 'uni-bios_2_2.rom', 'uni-bios_2_3.rom',
      'uni-bios_2_3o.rom', 'uni-bios_3_0.rom', 'uni-bios_3_1.rom', 'uni-bios_3_2.rom',
      'uni-bios_3_3.rom', 'uni-bios_4_0.rom',
    ]);
    expect(gameNamesToRomNames.get('bbtime')).toIncludeAllMembers(['bbtime.svg', 'hd38820a65']);
    expect(gameNamesToRomNames.get('c64')).toIncludeAllMembers([
      '325302-01.uab4', '901225-01.u5', '901226-01.u3', '901227-01.u4', '901227-02.u4',
      '901227-03.u4', '901229-01.uab5', '901229-02.uab5', '901229-03.uab5', '901229-05 ae.uab5',
      '901229-06 aa.uab5', '906114-01.u17', 'digidos.u4', 'digidos.uab5', 'dosrom12.u4', 'exos3.u4',
      'exos4.u4', 'jiffydos 1541.uab5', 'jiffydos c64.u4', 'kernal-10-mager.u4', 'kernal-20-1.u4',
      'kernal-20-1_au.u4', 'kernal-20-2.u4', 'kernal-20-3.u4', 'kernal-30.u4', 'magnum.u4',
      'mercury3.u4', 'mercury31s.u4', 'prodos24l2.u4', 'prodos35l2.u4', 'prodos.u4', 'rolo27.uab5',
      'speed-dos.u4', 'speed-dosplus27.u4', 'speed-dosplus.u4', 'speed-dosplus.uab5', 'ttd34.uab5',
      'turboaccess26.u4', 'turboaccess301.u4', 'turboaccess302.u4', 'turboprocess.u4',
      'turboprocessus.u4', 'turborom2.u4', 'turborom.u4',
    ]);
    expect(gameNamesToRomNames.get('ddonpach')).toIncludeAllMembers([
      'b1.u27', 'b2.u26', 'eeprom-ddonpach.bin', 'u6.bin', 'u7.bin', 'u50.bin', 'u51.bin', 'u52.bin',
      'u53.bin', 'u60.bin', 'u61.bin', 'u62.bin',
    ]);
    expect(gameNamesToRomNames.get('ddonpacha')).toIncludeAllMembers([
      'arrange_u26.bin', 'arrange_u27.bin', 'arrange_u51.bin', 'arrange_u62.bin',
      'eeprom-ddonpach.bin', 'u6.bin', 'u7.bin', 'u50.bin', 'u52.bin', 'u53.bin', 'u60.bin',
      'u61.bin',
    ]);
    expect(gameNamesToRomNames.get('ddonpachj')).toIncludeAllMembers([
      'eeprom-ddonpach.bin', 'u6.bin', 'u7.bin', 'u26.bin', 'u27.bin', 'u50.bin', 'u51.bin',
      'u52.bin', 'u53.bin', 'u60.bin', 'u61.bin', 'u62.bin',
    ]);
    // Includes device ROMs
    expect(gameNamesToRomNames.get('galaga')).toIncludeAllMembers([
      '51xx.bin', '54xx.bin', 'gg1_1b.3p', 'gg1_2b.3m', 'gg1_3.2m', 'gg1_4b.2l', 'gg1_5b.3f',
      'gg1_7b.2c', 'gg1_9.4l', 'gg1_10.4f', 'gg1_11.4d', 'prom-1.1d', 'prom-2.5c', 'prom-3.1c',
      'prom-4.2n', 'prom-5.5n',
    ]);
    expect(gameNamesToRomNames.get('galagamf')).toIncludeAllMembers([
      '51xx.bin', '54xx.bin', '2600j.bin', '2700k.bin', '2800l.bin', '3200a.bin', '3300b.bin',
      '3400c.bin', '3500d.bin', '3600fast.bin', '3700g.bin', 'prom-1.1d', 'prom-2.5c', 'prom-3.1c',
      'prom-4.2n', 'prom-5.5n',
    ]);
    expect(gameNamesToRomNames.get('galagamk')).toIncludeAllMembers([
      '51xx.bin', '54xx.bin', '3400c.bin', 'gg1-5.3f', 'gg1-7b.2c', 'gg1-9.4l', 'gg1-10.4f',
      'gg1-11.4d', 'mk2-1', 'mk2-2', 'mk2-4', 'prom-1.1d', 'prom-2.5c', 'prom-3.1c', 'prom-4.2n',
      'prom-5.5n',
    ]);
    expect(gameNamesToRomNames.get('galagamw')).toIncludeAllMembers([
      '51xx.bin', '54xx.bin', '2600j.bin', '2700k.bin', '2800l.bin', '3200a.bin', '3300b.bin',
      '3400c.bin', '3500d.bin', '3600e.bin', '3700g.bin', 'prom-1.1d', 'prom-2.5c', 'prom-3.1c',
      'prom-4.2n', 'prom-5.5n',
    ]);
    expect(gameNamesToRomNames.get('galagao')).toIncludeAllMembers([
      '51xx.bin', '54xx.bin', 'gg1-1.3p', 'gg1-2.3m', 'gg1-3.2m', 'gg1-4.2l', 'gg1-5.3f', 'gg1-7.2c',
      'gg1-9.4l', 'gg1-10.4f', 'gg1-11.4d', 'prom-1.1d', 'prom-2.5c', 'prom-3.1c', 'prom-4.2n',
      'prom-5.5n',
    ]);
    expect(gameNamesToRomNames.get('gallag')).toIncludeAllMembers([
      '51xx.bin', 'gallag.1', 'gallag.2', 'gallag.3', 'gallag.4', 'gallag.5', 'gallag.6', 'gallag.7',
      'gallag.8', 'gallag.9', 'gallag.a', 'prom-1.1d', 'prom-2.5c', 'prom-3.1c', 'prom-4.2n',
      'prom-5.5n',
    ]);
    expect(gameNamesToRomNames.get('gatsbee')).toIncludeAllMembers([
      '1.4b', '2.4c', '3.4d', '4.4e', '8.5r', '9.6a', '10.7a', '51xx.bin', '54xx.bin', 'gallag.6',
      'gg1-5.3f', 'gg1-7.2c', 'prom-1.1d', 'prom-2.5c', 'prom-3.1c', 'prom-4.2n', 'prom-5.5n',
    ]);
    expect(gameNamesToRomNames.get('nebulbee')).toIncludeAllMembers([
      '1c.bin', '1d.bin', '2n.bin', '5c.bin', '51xx.bin', 'gg1-5', 'gg1-7', 'gg1_3.2m', 'gg1_9.4l',
      'gg1_10.4f', 'gg1_11.4d', 'nebulbee.01', 'nebulbee.02', 'nebulbee.04', 'nebulbee.07',
      'prom-5.5n',
    ]);
    expect(gameNamesToRomNames.get('liblrabl')).toIncludeAllMembers([
      '2c.rom', '5b.rom', '5c.rom', '5p.rom', '8c.rom', '9t.rom', '10c.rom', 'lr1-1.1t', 'lr1-2.1s',
      'lr1-3.1r', 'lr1-4.3d', 'lr1-5.5l', 'lr1-6.2p',
    ]);

    // No change to BIOS or devices
    expect(result.getGames().filter((game) => game.isBios())).toHaveLength(2);
    expect(result.getGames().filter((game) => game.isDevice())).toHaveLength(65);
    expect(gameNamesToRomNames.get('aristmk6')).toHaveLength(96);
    expect(gameNamesToRomNames.get('neogeo')).toHaveLength(34);
  });

  it('should non-merged', async () => {
    // Given
    const options = new Options({
      mergeRoms: MergeMode[MergeMode.NONMERGED].toLowerCase(),
    });

    // When
    const result = await new DATMergerSplitter(options, new ProgressBarFake()).merge(dat);

    // Then nothing was merged
    expect(result.getParents()).toHaveLength(dat.getParents().length);
    expect(result.getGames()).toHaveLength(dat.getGames().length);

    const gameNamesToRomNames = result.getGames()
      .reduce((map, game) => {
        map.set(game.getName(), game.getRoms().map((rom) => rom.getName().replace(/[\\/]/g, '\\')));
        return map;
      }, new Map<string, string[]>());

    // Excludes device files
    expect(gameNamesToRomNames.get('100lions')).toIncludeAllMembers(['10219211.u73', '10219211.u86']);
    expect(gameNamesToRomNames.get('100lionsa')).toIncludeAllMembers(['30223811.u73', '30223811.u86']);
    expect(gameNamesToRomNames.get('1942')).toIncludeAllMembers([
      'sb-0.f1', 'sb-1.k6', 'sb-2.d1', 'sb-3.d2', 'sb-4.d6', 'sb-5.e8', 'sb-6.e9', 'sb-7.e10',
      'sb-8.k3', 'sb-9.m11', 'sr-01.c11', 'sr-02.f2', 'sr-08.a1', 'sr-09.a2', 'sr-10.a3', 'sr-11.a4',
      'sr-12.a5', 'sr-13.a6', 'sr-14.l1', 'sr-15.l2', 'sr-16.n1', 'sr-17.n2', 'srb-03.m3',
      'srb-04.m4', 'srb-05.m5', 'srb-06.m6', 'srb-07.m7',
    ]);
    expect(gameNamesToRomNames.get('1942a')).toIncludeAllMembers([
      'sb-0.f1', 'sb-1.k6', 'sb-2.d1', 'sb-3.d2', 'sb-4.d6', 'sb-5.e8', 'sb-6.e9', 'sb-7.e10',
      'sb-8.k3', 'sb-9.m11', 'sr-01.c11', 'sr-02.f2', 'sr-04.m4', 'sr-05.m5', 'sr-06.m6', 'sr-07.m7',
      'sr-08.a1', 'sr-09.a2', 'sr-10.a3', 'sr-11.a4', 'sr-12.a5', 'sr-13.a6', 'sr-14.l1', 'sr-15.l2',
      'sr-16.n1', 'sr-17.n2', 'sra-03.m3',
    ]);
    expect(gameNamesToRomNames.get('1942abl')).toIncludeAllMembers([
      '1.bin', '2.bin', '3.bin', '5.bin', '7.bin', '9.bin', '11.bin', '13.bin', '14.bin', '16.bin',
      'sb-0.f1', 'sb-1.k6', 'sb-2.d1', 'sb-3.d2', 'sb-4.d6', 'sb-5.e8', 'sb-6.e9', 'sb-7.e10',
      'sb-8.k3', 'sb-9.m11',
    ]);
    expect(gameNamesToRomNames.get('1942b')).toIncludeAllMembers([
      'sb-0.f1', 'sb-1.k6', 'sb-2.d1', 'sb-3.d2', 'sb-4.d6', 'sb-5.e8', 'sb-6.e9', 'sb-7.e10',
      'sb-8.k3', 'sb-9.m11', 'sr-01.c11', 'sr-02.f2', 'sr-03.m3', 'sr-04.m4', 'sr-05.m5', 'sr-06.m6',
      'sr-07.m7', 'sr-08.a1', 'sr-09.a2', 'sr-10.a3', 'sr-11.a4', 'sr-12.a5', 'sr-13.a6', 'sr-14.l1',
      'sr-15.l2', 'sr-16.n1', 'sr-17.n2',
    ]);
    expect(gameNamesToRomNames.get('1942h')).toIncludeAllMembers([
      'sb-0.f1', 'sb-1.k6', 'sb-2.d1', 'sb-3.d2', 'sb-4.d6', 'sb-5.e8', 'sb-6.e9', 'sb-7.e10',
      'sb-8.k3', 'sb-9.m11', 'sr-01.c11', 'sr-02.f2', 'sr-08.a1', 'sr-09.a2', 'sr-10.a3', 'sr-11.a4',
      'sr-12.a5', 'sr-13.a6', 'sr-14.l1', 'sr-15.l2', 'sr-16.n1', 'sr-17.n2', 'srb-06.m6',
      'srb-07.m7', 'supercharger_1942_@3.m3', 'supercharger_1942_@4.m4', 'supercharger_1942_@5.m5',
    ]);
    expect(gameNamesToRomNames.get('1942p')).toIncludeAllMembers([
      '1.bin', '2.bin', '3.bin', '04.bin', '5.bin', '6.bin', '7.bin', '8.bin', '9.bin', '10.bin',
      '11.bin', '12.bin', 'ic22.bin',
    ]);
    expect(gameNamesToRomNames.get('1942w')).toIncludeAllMembers([
      'sb-0.f1', 'sb-1.k6', 'sb-2.d1', 'sb-3.d2', 'sb-4.d6', 'sb-5.e8', 'sb-6.e9', 'sb-7.e10',
      'sb-8.k3', 'sb-9.m11', 'sr-01.c11', 'sr-08.a1', 'sr-09.a2', 'sr-10.a3', 'sr-11.a4', 'sr-12.a5',
      'sr-13.a6', 'sr-14.l1', 'sr-15.l2', 'sr-16.n1', 'sr-17.n2', 'sw-02.f2', 'sw-03.m3', 'sw-04.m4',
      'sw-05.m5', 'sw-06.m6', 'sw-07.m7',
    ]);
    expect(gameNamesToRomNames.get('aes')).toIncludeAllMembers([
      '000-lo.lo', 'neo-epo.bin', 'neo-po.bin', 'neodebug.rom', 'uni-bios_1_3.rom',
      'uni-bios_2_0.rom', 'uni-bios_2_1.rom', 'uni-bios_2_2.rom', 'uni-bios_2_3.rom',
      'uni-bios_2_3o.rom', 'uni-bios_3_0.rom', 'uni-bios_3_1.rom', 'uni-bios_3_2.rom',
      'uni-bios_3_3.rom', 'uni-bios_4_0.rom',
    ]);
    expect(gameNamesToRomNames.get('bbtime')).toIncludeAllMembers(['bbtime.svg', 'hd38820a65']);
    expect(gameNamesToRomNames.get('c64')).toIncludeAllMembers([
      '901225-01.u5', '901226-01.u3', '901227-01.u4', '901227-02.u4', '901227-03.u4', '906114-01.u17',
      'digidos.u4', 'dosrom12.u4', 'exos3.u4', 'exos4.u4', 'jiffydos c64.u4', 'kernal-10-mager.u4',
      'kernal-20-1.u4', 'kernal-20-1_au.u4', 'kernal-20-2.u4', 'kernal-20-3.u4', 'kernal-30.u4',
      'magnum.u4', 'mercury3.u4', 'mercury31s.u4', 'prodos24l2.u4', 'prodos35l2.u4', 'prodos.u4',
      'speed-dos.u4', 'speed-dosplus27.u4', 'speed-dosplus.u4', 'turboaccess26.u4',
      'turboaccess301.u4', 'turboaccess302.u4', 'turboprocess.u4', 'turboprocessus.u4',
      'turborom2.u4', 'turborom.u4',
    ]);
    expect(gameNamesToRomNames.get('ddonpach')).toIncludeAllMembers([
      'b1.u27', 'b2.u26', 'eeprom-ddonpach.bin', 'u6.bin', 'u7.bin', 'u50.bin', 'u51.bin', 'u52.bin',
      'u53.bin', 'u60.bin', 'u61.bin', 'u62.bin',
    ]);
    expect(gameNamesToRomNames.get('ddonpacha')).toIncludeAllMembers([
      'arrange_u26.bin', 'arrange_u27.bin', 'arrange_u51.bin', 'arrange_u62.bin',
      'eeprom-ddonpach.bin', 'u6.bin', 'u7.bin', 'u50.bin', 'u52.bin', 'u53.bin', 'u60.bin',
      'u61.bin',
    ]);
    expect(gameNamesToRomNames.get('ddonpachj')).toIncludeAllMembers([
      'eeprom-ddonpach.bin', 'u6.bin', 'u7.bin', 'u26.bin', 'u27.bin', 'u50.bin', 'u51.bin',
      'u52.bin', 'u53.bin', 'u60.bin', 'u61.bin', 'u62.bin',
    ]);
    expect(gameNamesToRomNames.get('galaga')).toIncludeAllMembers([
      'gg1_1b.3p', 'gg1_2b.3m', 'gg1_3.2m', 'gg1_4b.2l', 'gg1_5b.3f', 'gg1_7b.2c', 'gg1_9.4l',
      'gg1_10.4f', 'gg1_11.4d', 'prom-1.1d', 'prom-2.5c', 'prom-3.1c', 'prom-4.2n', 'prom-5.5n',
    ]);
    expect(gameNamesToRomNames.get('galagamf')).toIncludeAllMembers([
      '2600j.bin', '2700k.bin', '2800l.bin', '3200a.bin', '3300b.bin', '3400c.bin', '3500d.bin',
      '3600fast.bin', '3700g.bin', 'prom-1.1d', 'prom-2.5c', 'prom-3.1c', 'prom-4.2n', 'prom-5.5n',
    ]);
    expect(gameNamesToRomNames.get('galagamk')).toIncludeAllMembers([
      '3400c.bin', 'gg1-5.3f', 'gg1-7b.2c', 'gg1-9.4l', 'gg1-10.4f', 'gg1-11.4d', 'mk2-1', 'mk2-2',
      'mk2-4', 'prom-1.1d', 'prom-2.5c', 'prom-3.1c', 'prom-4.2n', 'prom-5.5n',
    ]);
    expect(gameNamesToRomNames.get('galagamw')).toIncludeAllMembers([
      '2600j.bin', '2700k.bin', '2800l.bin', '3200a.bin', '3300b.bin', '3400c.bin', '3500d.bin',
      '3600e.bin', '3700g.bin', 'prom-1.1d', 'prom-2.5c', 'prom-3.1c', 'prom-4.2n', 'prom-5.5n',
    ]);
    expect(gameNamesToRomNames.get('galagao')).toIncludeAllMembers([
      'gg1-1.3p', 'gg1-2.3m', 'gg1-3.2m', 'gg1-4.2l', 'gg1-5.3f', 'gg1-7.2c', 'gg1-9.4l', 'gg1-10.4f',
      'gg1-11.4d', 'prom-1.1d', 'prom-2.5c', 'prom-3.1c', 'prom-4.2n', 'prom-5.5n',
    ]);
    expect(gameNamesToRomNames.get('gallag')).toIncludeAllMembers([
      'gallag.1', 'gallag.2', 'gallag.3', 'gallag.4', 'gallag.5', 'gallag.6', 'gallag.7', 'gallag.8',
      'gallag.9', 'gallag.a', 'prom-1.1d', 'prom-2.5c', 'prom-3.1c', 'prom-4.2n', 'prom-5.5n',
    ]);
    expect(gameNamesToRomNames.get('gatsbee')).toIncludeAllMembers([
      '1.4b', '2.4c', '3.4d', '4.4e', '8.5r', '9.6a', '10.7a', 'gallag.6', 'gg1-5.3f', 'gg1-7.2c',
      'prom-1.1d', 'prom-2.5c', 'prom-3.1c', 'prom-4.2n', 'prom-5.5n',
    ]);
    expect(gameNamesToRomNames.get('nebulbee')).toIncludeAllMembers([
      '1c.bin', '1d.bin', '2n.bin', '5c.bin', 'gg1-5', 'gg1-7', 'gg1_3.2m', 'gg1_9.4l', 'gg1_10.4f',
      'gg1_11.4d', 'nebulbee.01', 'nebulbee.02', 'nebulbee.04', 'nebulbee.07', 'prom-5.5n',
    ]);
    expect(gameNamesToRomNames.get('liblrabl')).toIncludeAllMembers([
      '2c.rom', '5b.rom', '5c.rom', '5p.rom', '8c.rom', '9t.rom', '10c.rom', 'lr1-1.1t', 'lr1-2.1s',
      'lr1-3.1r', 'lr1-4.3d', 'lr1-5.5l', 'lr1-6.2p',
    ]);

    // No change to BIOS or devices
    expect(result.getGames().filter((game) => game.isBios())).toHaveLength(2);
    expect(result.getGames().filter((game) => game.isDevice())).toHaveLength(65);
    expect(gameNamesToRomNames.get('aristmk6')).toHaveLength(96);
    expect(gameNamesToRomNames.get('neogeo')).toHaveLength(34);
  });

  it('should split', async () => {
    // Given
    const options = new Options({
      mergeRoms: MergeMode[MergeMode.SPLIT].toLowerCase(),
    });

    // When
    const result = await new DATMergerSplitter(options, new ProgressBarFake()).merge(dat);

    // Then nothing was merged
    expect(result.getParents()).toHaveLength(dat.getParents().length);
    expect(result.getGames()).toHaveLength(dat.getGames().length);

    const gameNamesToRomNames = result.getGames()
      .reduce((map, game) => {
        map.set(game.getName(), game.getRoms().map((rom) => rom.getName().replace(/[\\/]/g, '\\')));
        return map;
      }, new Map<string, string[]>());

    // No change
    expect(gameNamesToRomNames.get('aes')).toIncludeAllMembers([
      '000-lo.lo', 'neo-epo.bin', 'neo-po.bin', 'neodebug.rom', 'uni-bios_1_3.rom',
      'uni-bios_2_0.rom', 'uni-bios_2_1.rom', 'uni-bios_2_2.rom', 'uni-bios_2_3.rom',
      'uni-bios_2_3o.rom', 'uni-bios_3_0.rom', 'uni-bios_3_1.rom', 'uni-bios_3_2.rom',
      'uni-bios_3_3.rom', 'uni-bios_4_0.rom',
    ]);
    expect(gameNamesToRomNames.get('bbtime')).toIncludeAllMembers(['bbtime.svg', 'hd38820a65']);
    expect(gameNamesToRomNames.get('liblrabl')).toIncludeAllMembers([
      '2c.rom', '5b.rom', '5c.rom', '5p.rom', '8c.rom', '9t.rom', '10c.rom', 'lr1-1.1t', 'lr1-2.1s',
      'lr1-3.1r', 'lr1-4.3d', 'lr1-5.5l', 'lr1-6.2p',
    ]);
    // Clones exclude parent ROMs
    expect(gameNamesToRomNames.get('100lions')).toIncludeAllMembers(['10219211.u73', '10219211.u86']);
    expect(gameNamesToRomNames.get('100lionsa')).toIncludeAllMembers(['30223811.u73', '30223811.u86']);
    expect(gameNamesToRomNames.get('1942')).toIncludeAllMembers([
      'sb-0.f1', 'sb-1.k6', 'sb-2.d1', 'sb-3.d2', 'sb-4.d6', 'sb-5.e8', 'sb-6.e9', 'sb-7.e10',
      'sb-8.k3', 'sb-9.m11', 'sr-01.c11', 'sr-02.f2', 'sr-08.a1', 'sr-09.a2', 'sr-10.a3', 'sr-11.a4',
      'sr-12.a5', 'sr-13.a6', 'sr-14.l1', 'sr-15.l2', 'sr-16.n1', 'sr-17.n2', 'srb-03.m3',
      'srb-04.m4', 'srb-05.m5', 'srb-06.m6', 'srb-07.m7',
    ]);
    expect(gameNamesToRomNames.get('1942a')).toIncludeAllMembers([
      'sr-04.m4', 'sr-05.m5', 'sr-06.m6', 'sr-07.m7', 'sra-03.m3',
    ]);
    expect(gameNamesToRomNames.get('1942abl')).toIncludeAllMembers([
      '3.bin', '5.bin', '7.bin', '9.bin', '11.bin', '13.bin', '14.bin', '16.bin',
    ]);
    expect(gameNamesToRomNames.get('1942b')).toIncludeAllMembers([
      'sr-03.m3', 'sr-04.m4', 'sr-05.m5', 'sr-06.m6', 'sr-07.m7',
    ]);
    expect(gameNamesToRomNames.get('1942h')).toIncludeAllMembers([
      'supercharger_1942_@3.m3', 'supercharger_1942_@4.m4', 'supercharger_1942_@5.m5',
    ]);
    expect(gameNamesToRomNames.get('1942p')).toIncludeAllMembers([
      '1.bin', '2.bin', '3.bin', '04.bin', '5.bin', '6.bin', '7.bin', '9.bin', '10.bin', '11.bin',
      '12.bin',
    ]);
    expect(gameNamesToRomNames.get('1942w')).toIncludeAllMembers([
      'sw-02.f2', 'sw-03.m3', 'sw-04.m4', 'sw-05.m5', 'sw-07.m7',
    ]);
    expect(gameNamesToRomNames.get('c64')).toIncludeAllMembers([
      '901225-01.u5', '901226-01.u3', '901227-01.u4', '901227-02.u4', '901227-03.u4', '906114-01.u17',
      'digidos.u4', 'dosrom12.u4', 'exos3.u4', 'exos4.u4', 'jiffydos c64.u4', 'kernal-10-mager.u4',
      'kernal-20-1.u4', 'kernal-20-1_au.u4', 'kernal-20-2.u4', 'kernal-20-3.u4', 'kernal-30.u4',
      'magnum.u4', 'mercury3.u4', 'mercury31s.u4', 'prodos24l2.u4', 'prodos35l2.u4', 'prodos.u4',
      'speed-dos.u4', 'speed-dosplus27.u4', 'speed-dosplus.u4', 'turboaccess26.u4',
      'turboaccess301.u4', 'turboaccess302.u4', 'turboprocess.u4', 'turboprocessus.u4',
      'turborom2.u4', 'turborom.u4',
    ]);
    expect(gameNamesToRomNames.get('ddonpach')).toIncludeAllMembers([
      'b1.u27', 'b2.u26', 'eeprom-ddonpach.bin', 'u6.bin', 'u7.bin', 'u50.bin', 'u51.bin', 'u52.bin',
      'u53.bin', 'u60.bin', 'u61.bin', 'u62.bin',
    ]);
    expect(gameNamesToRomNames.get('ddonpacha')).toIncludeAllMembers([
      'arrange_u26.bin', 'arrange_u27.bin', 'arrange_u51.bin', 'arrange_u62.bin',
      'eeprom-ddonpach.bin',
    ]);
    expect(gameNamesToRomNames.get('ddonpachj')).toIncludeAllMembers([
      'u26.bin', 'u27.bin',
    ]);
    expect(gameNamesToRomNames.get('galaga')).toIncludeAllMembers([
      'gg1_1b.3p', 'gg1_2b.3m', 'gg1_3.2m', 'gg1_4b.2l', 'gg1_5b.3f', 'gg1_7b.2c', 'gg1_9.4l',
      'gg1_10.4f', 'gg1_11.4d', 'prom-1.1d', 'prom-2.5c', 'prom-3.1c', 'prom-4.2n', 'prom-5.5n',
    ]);
    expect(gameNamesToRomNames.get('galagamf')).toIncludeAllMembers([
      '3200a.bin', '3300b.bin', '3400c.bin', '3500d.bin', '3600fast.bin', '3700g.bin',
    ]);
    expect(gameNamesToRomNames.get('galagamk')).toIncludeAllMembers([
      '3400c.bin', 'gg1-5.3f', 'mk2-1', 'mk2-2', 'mk2-4',
    ]);
    expect(gameNamesToRomNames.get('galagamw')).toIncludeAllMembers([
      '3200a.bin', '3300b.bin', '3400c.bin', '3500d.bin', '3600e.bin', '3700g.bin',
    ]);
    expect(gameNamesToRomNames.get('galagao')).toIncludeAllMembers([
      'gg1-1.3p', 'gg1-2.3m', 'gg1-4.2l', 'gg1-5.3f', 'gg1-7.2c',
    ]);
    expect(gameNamesToRomNames.get('gallag')).toIncludeAllMembers([
      'gallag.1', 'gallag.2', 'gallag.4', 'gallag.5', 'gallag.6', 'gallag.7', 'gallag.8',
    ]);
    expect(gameNamesToRomNames.get('gatsbee')).toIncludeAllMembers([
      '1.4b', '2.4c', '3.4d', '4.4e', '8.5r', '9.6a', '10.7a', 'gallag.6', 'gg1-5.3f', 'gg1-7.2c',
    ]);
    expect(gameNamesToRomNames.get('nebulbee')).toIncludeAllMembers([
      '1c.bin', '1d.bin', '2n.bin', '5c.bin', 'gg1-5', 'gg1-7', 'nebulbee.01', 'nebulbee.02',
      'nebulbee.04', 'nebulbee.07',
    ]);

    // No change to BIOS or devices
    expect(result.getGames().filter((game) => game.isBios())).toHaveLength(2);
    expect(result.getGames().filter((game) => game.isDevice())).toHaveLength(65);
    expect(gameNamesToRomNames.get('aristmk6')).toHaveLength(96);
    expect(gameNamesToRomNames.get('neogeo')).toHaveLength(34);
  });

  it('should merged', async () => {
    // Given
    const options = new Options({
      mergeRoms: MergeMode[MergeMode.MERGED].toLowerCase(),
    });

    // When
    const result = await new DATMergerSplitter(options, new ProgressBarFake()).merge(dat);

    // Then clones were merged
    expect(result.getParents()).toHaveLength(dat.getParents().length);
    expect(result.getGames()).toHaveLength(dat.getGames().filter((game) => !game.isClone()).length);

    const gameNamesToRomNames = result.getGames()
      .reduce((map, game) => {
        map.set(game.getName(), game.getRoms().map((rom) => rom.getName().replace(/[\\/]/g, '\\')));
        return map;
      }, new Map<string, string[]>());

    // No change from regular non-merged (because there are no clones)
    expect(gameNamesToRomNames.get('aes')).toIncludeAllMembers([
      '000-lo.lo', 'neo-epo.bin', 'neo-po.bin', 'neodebug.rom', 'uni-bios_1_3.rom',
      'uni-bios_2_0.rom', 'uni-bios_2_1.rom', 'uni-bios_2_2.rom', 'uni-bios_2_3.rom',
      'uni-bios_2_3o.rom', 'uni-bios_3_0.rom', 'uni-bios_3_1.rom', 'uni-bios_3_2.rom',
      'uni-bios_3_3.rom', 'uni-bios_4_0.rom',
    ]);
    expect(gameNamesToRomNames.get('bbtime')).toIncludeAllMembers(['bbtime.svg', 'hd38820a65']);
    expect(gameNamesToRomNames.get('c64')).toIncludeAllMembers([
      // NOTE(cemmer): excludes clones
      '901225-01.u5', '901226-01.u3', '901227-01.u4', '901227-02.u4', '901227-03.u4', '906114-01.u17',
      'digidos.u4', 'dosrom12.u4', 'exos3.u4', 'exos4.u4', 'jiffydos c64.u4', 'kernal-10-mager.u4',
      'kernal-20-1.u4', 'kernal-20-1_au.u4', 'kernal-20-2.u4', 'kernal-20-3.u4', 'kernal-30.u4',
      'magnum.u4', 'mercury3.u4', 'mercury31s.u4', 'prodos24l2.u4', 'prodos35l2.u4', 'prodos.u4',
      'speed-dos.u4', 'speed-dosplus27.u4', 'speed-dosplus.u4', 'turboaccess26.u4',
      'turboaccess301.u4', 'turboaccess302.u4', 'turboprocess.u4', 'turboprocessus.u4',
      'turborom2.u4', 'turborom.u4',
    ]);
    expect(gameNamesToRomNames.get('liblrabl')).toIncludeAllMembers([
      '2c.rom', '5b.rom', '5c.rom', '5p.rom', '8c.rom', '9t.rom', '10c.rom', 'lr1-1.1t', 'lr1-2.1s',
      'lr1-3.1r', 'lr1-4.3d', 'lr1-5.5l', 'lr1-6.2p',
    ]);
    // Clones are merged in
    expect(gameNamesToRomNames.get('100lions')).toIncludeAllMembers([
      '100lionsa\\30223811.u73', '100lionsa\\30223811.u86',
      '10219211.u73', '10219211.u86',
    ]);
    expect(gameNamesToRomNames.has('100lionsa')).toEqual(false);
    expect(gameNamesToRomNames.get('1942')).toIncludeAllMembers([
      '1942a\\sr-04.m4', '1942a\\sr-05.m5', '1942a\\sr-06.m6', '1942a\\sr-07.m7', '1942a\\sra-03.m3',
      '1942abl\\3.bin', '1942abl\\7.bin', '1942abl\\9.bin', '1942abl\\11.bin', '1942abl\\13.bin', '1942abl\\14.bin', '1942abl\\16.bin',
      '1942b\\sr-03.m3',
      '1942h\\supercharger_1942_@3.m3', '1942h\\supercharger_1942_@4.m4', '1942h\\supercharger_1942_@5.m5',
      '1942p\\1.bin', '1942p\\2.bin', '1942p\\3.bin', '1942p\\04.bin', '1942p\\5.bin', '1942p\\6.bin', '1942p\\7.bin', '1942p\\9.bin', '1942p\\10.bin', '1942p\\11.bin', '1942p\\12.bin',
      '1942w\\sw-02.f2', '1942w\\sw-03.m3', '1942w\\sw-04.m4', '1942w\\sw-05.m5', '1942w\\sw-07.m7',
      'sb-0.f1', 'sb-1.k6', 'sb-2.d1', 'sb-3.d2', 'sb-4.d6', 'sb-5.e8', 'sb-6.e9', 'sb-7.e10',
      'sb-8.k3', 'sb-9.m11', 'sr-01.c11', 'sr-02.f2', 'sr-08.a1', 'sr-09.a2', 'sr-10.a3', 'sr-11.a4',
      'sr-12.a5', 'sr-13.a6', 'sr-14.l1', 'sr-15.l2', 'sr-16.n1', 'sr-17.n2', 'srb-03.m3',
      'srb-04.m4', 'srb-05.m5', 'srb-06.m6', 'srb-07.m7',
    ]);
    expect(gameNamesToRomNames.has('1942a')).toEqual(false);
    expect(gameNamesToRomNames.has('1942abl')).toEqual(false);
    expect(gameNamesToRomNames.has('1942b')).toEqual(false);
    expect(gameNamesToRomNames.has('1942h')).toEqual(false);
    expect(gameNamesToRomNames.has('1942p')).toEqual(false);
    expect(gameNamesToRomNames.has('1942w')).toEqual(false);
    expect(gameNamesToRomNames.get('galaga')).toIncludeAllMembers([
      'galagamf\\3200a.bin', 'galagamf\\3300b.bin', 'galagamf\\3400c.bin', 'galagamf\\3500d.bin', 'galagamf\\3600fast.bin', 'galagamf\\3700g.bin',
      'galagamk\\gg1-5.3f', 'galagamk\\mk2-1', 'galagamk\\mk2-2', 'galagamk\\mk2-4',
      'galagamw\\3600e.bin', 'galagao\\gg1-1.3p', 'galagao\\gg1-2.3m', 'galagao\\gg1-4.2l', 'galagao\\gg1-7.2c',
      'gallag\\gallag.2', 'gallag\\gallag.6', 'gallag\\gallag.8',
      'gatsbee\\1.4b', 'gatsbee\\2.4c', 'gatsbee\\3.4d', 'gatsbee\\4.4e', 'gatsbee\\8.5r', 'gatsbee\\9.6a', 'gatsbee\\10.7a',
      'nebulbee\\1c.bin', 'nebulbee\\1d.bin', 'nebulbee\\2n.bin', 'nebulbee\\5c.bin', 'nebulbee\\nebulbee.01', 'nebulbee\\nebulbee.02', 'nebulbee\\nebulbee.04', 'nebulbee\\nebulbee.07',
      'gg1_1b.3p', 'gg1_2b.3m', 'gg1_3.2m', 'gg1_4b.2l', 'gg1_5b.3f', 'gg1_7b.2c', 'gg1_9.4l',
      'gg1_10.4f', 'gg1_11.4d', 'prom-1.1d', 'prom-2.5c', 'prom-3.1c', 'prom-4.2n', 'prom-5.5n',
    ]);
    expect(gameNamesToRomNames.get('ddonpach')).toIncludeAllMembers([
      'ddonpacha\\arrange_u26.bin', 'ddonpacha\\arrange_u27.bin', 'ddonpacha\\arrange_u51.bin',
      'ddonpacha\\arrange_u62.bin', 'ddonpacha\\eeprom-ddonpach.bin', 'ddonpachj\\u26.bin',
      'ddonpachj\\u27.bin', 'b1.u27', 'b2.u26', 'eeprom-ddonpach.bin', 'u6.bin', 'u7.bin', 'u50.bin',
      'u51.bin', 'u52.bin', 'u53.bin', 'u60.bin', 'u61.bin', 'u62.bin',
    ]);
    expect(gameNamesToRomNames.has('ddonpacha')).toEqual(false);
    expect(gameNamesToRomNames.has('ddonpachj')).toEqual(false);
    expect(gameNamesToRomNames.has('galagamf')).toEqual(false);
    expect(gameNamesToRomNames.has('galagamk')).toEqual(false);
    expect(gameNamesToRomNames.has('galagamw')).toEqual(false);
    expect(gameNamesToRomNames.has('galagao')).toEqual(false);
    expect(gameNamesToRomNames.has('gallag')).toEqual(false);
    expect(gameNamesToRomNames.has('gatsbee')).toEqual(false);
    expect(gameNamesToRomNames.has('nebulbee')).toEqual(false);

    // No change to BIOS or devices
    expect(result.getGames().filter((game) => game.isBios())).toHaveLength(2);
    expect(result.getGames().filter((game) => game.isDevice())).toHaveLength(65);
    expect(gameNamesToRomNames.get('aristmk6')).toHaveLength(96);
    expect(gameNamesToRomNames.get('neogeo')).toHaveLength(34);
  });
});

describe('FinalBurn Neo Neo Geo e544671', () => {
  const dat = new LogiqxDAT(new Header(), [
    new Game({
      name: '3countb',
      romOf: 'neogeo',
      description: '3 Count Bout / Fire Suplex (NGM-043 ~ NGH-043)',
      rom: [
        new ROM({ name: '043-p1.p1', size: 1048576, crc32: 'ffbdd928' }),
        new ROM({ name: '043-s1.s1', size: 131072, crc32: 'c362d484' }),
        new ROM({ name: '043-c1.c1', size: 2097152, crc32: 'bad2d67f' }),
        new ROM({ name: '043-c2.c2', size: 2097152, crc32: 'a7fbda95' }),
        new ROM({ name: '043-c3.c3', size: 2097152, crc32: 'f00be011' }),
        new ROM({ name: '043-c4.c4', size: 2097152, crc32: '1887e5c0' }),
        new ROM({ name: '043-m1.m1', size: 131072, crc32: '7eab59cb' }),
        new ROM({ name: '043-v1.v1', size: 2097152, crc32: '63688ce8' }),
        new ROM({ name: '043-v2.v2', size: 2097152, crc32: 'c69a827b' }),
        new ROM({ name: 'sp-s3.sp1', merge: 'sp-s3.sp1', size: 131072, crc32: '91b64be3' }),
        new ROM({ name: 'sp-s2.sp1', merge: 'sp-s2.sp1', size: 131072, crc32: '9036d879' }),
        new ROM({ name: 'sp-s.sp1', merge: 'sp-s.sp1', size: 131072, crc32: 'c7f2fa45' }),
        new ROM({ name: 'sp-u2.sp1', merge: 'sp-u2.sp1', size: 131072, crc32: 'e72943de' }),
        new ROM({ name: 'sp1-u2', merge: 'sp1-u2', size: 131072, crc32: '62f021f4' }),
        new ROM({ name: 'sp-e.sp1', merge: 'sp-e.sp1', size: 131072, crc32: '2723a5b5' }),
        new ROM({ name: 'sp1-u4.bin', merge: 'sp1-u4.bin', size: 131072, crc32: '1179a30f' }),
        new ROM({ name: 'sp1-u3.bin', merge: 'sp1-u3.bin', size: 131072, crc32: '2025b7a2' }),
        new ROM({ name: 'vs-bios.rom', merge: 'vs-bios.rom', size: 131072, crc32: 'f0e8f27d' }),
        new ROM({ name: 'sp-j2.sp1', merge: 'sp-j2.sp1', size: 131072, crc32: 'acede59c' }),
        new ROM({ name: 'sp1.jipan.1024', merge: 'sp1.jipan.1024', size: 131072, crc32: '9fb0abe4' }),
        new ROM({ name: 'sp-45.sp1', merge: 'sp-45.sp1', size: 524288, crc32: '03cc9f6a' }),
        new ROM({ name: 'sp-j3.sp1', merge: 'sp-j3.sp1', size: 524288, crc32: '486cb450' }),
        new ROM({ name: 'japan-j3.bin', merge: 'japan-j3.bin', size: 131072, crc32: 'dff6d41f' }),
        new ROM({ name: 'sp1-j3.bin', merge: 'sp1-j3.bin', size: 131072, crc32: 'fbc6d469' }),
        new ROM({ name: 'neo-po.bin', merge: 'neo-po.bin', size: 131072, crc32: '16d0c132' }),
        new ROM({ name: 'neo-epo.bin', merge: 'neo-epo.bin', size: 131072, crc32: 'd27a71f1' }),
        new ROM({ name: 'neodebug.bin', merge: 'neodebug.bin', size: 131072, crc32: '698ebb7d' }),
        new ROM({ name: 'sp-1v1_3db8c.bin', merge: 'sp-1v1_3db8c.bin', size: 131072, crc32: '162f0ebe' }),
        new ROM({ name: 'uni-bios_4_0.rom', merge: 'uni-bios_4_0.rom', size: 131072, crc32: 'a7aab458' }),
        new ROM({ name: 'uni-bios_3_3.rom', merge: 'uni-bios_3_3.rom', size: 131072, crc32: '24858466' }),
        new ROM({ name: 'uni-bios_3_2.rom', merge: 'uni-bios_3_2.rom', size: 131072, crc32: 'a4e8b9b3' }),
        new ROM({ name: 'uni-bios_3_1.rom', merge: 'uni-bios_3_1.rom', size: 131072, crc32: '0c58093f' }),
        new ROM({ name: 'uni-bios_3_0.rom', merge: 'uni-bios_3_0.rom', size: 131072, crc32: 'a97c89a9' }),
        new ROM({ name: 'uni-bios_2_3.rom', merge: 'uni-bios_2_3.rom', size: 131072, crc32: '27664eb5' }),
        new ROM({ name: 'uni-bios_2_3o.rom', merge: 'uni-bios_2_3o.rom', size: 131072, crc32: '601720ae' }),
        new ROM({ name: 'uni-bios_2_2.rom', merge: 'uni-bios_2_2.rom', size: 131072, crc32: '2d50996a' }),
        new ROM({ name: 'uni-bios_2_1.rom', merge: 'uni-bios_2_1.rom', size: 131072, crc32: '8dabf76b' }),
        new ROM({ name: 'uni-bios_2_0.rom', merge: 'uni-bios_2_0.rom', size: 131072, crc32: '0c12c2ad' }),
        new ROM({ name: 'uni-bios_1_3.rom', merge: 'uni-bios_1_3.rom', size: 131072, crc32: 'b24b44a0' }),
        new ROM({ name: 'uni-bios_1_2.rom', merge: 'uni-bios_1_2.rom', size: 131072, crc32: '4fa698e9' }),
        new ROM({ name: 'uni-bios_1_2o.rom', merge: 'uni-bios_1_2o.rom', size: 131072, crc32: 'e19d3ce9' }),
        new ROM({ name: 'uni-bios_1_1.rom', merge: 'uni-bios_1_1.rom', size: 131072, crc32: '5dda0d84' }),
        new ROM({ name: 'uni-bios_1_0.rom', merge: 'uni-bios_1_0.rom', size: 131072, crc32: '0ce453a0' }),
        new ROM({ name: 'neopen.sp1', merge: 'neopen.sp1', size: 131072, crc32: 'cb915e76' }),
        new ROM({ name: 'sm1.sm1', merge: 'sm1.sm1', size: 131072, crc32: '94416d67' }),
        new ROM({ name: 'sfix.sfix', merge: 'sfix.sfix', size: 131072, crc32: 'c2ea0cfd' }),
        new ROM({ name: '000-lo.lo', merge: '000-lo.lo', size: 131072, crc32: '5a86cff2' }),
      ],
    }),
    new Game({
      name: '3countba',
      cloneOf: '3countb',
      romOf: '3countb',
      description: '3 Count Bout / Fire Suplex (NGM-043)',
      rom: [
        new ROM({ name: '043-epr.ep1', size: 524288, crc32: 'eb2714c4' }),
        new ROM({ name: '043-epr.ep2', size: 524288, crc32: '5e764567' }),
        new ROM({ name: '043-s1.s1', merge: '043-s1.s1', size: 131072, crc32: 'c362d484' }),
        new ROM({ name: '043-c1.c1', merge: '043-c1.c1', size: 2097152, crc32: 'bad2d67f' }),
        new ROM({ name: '043-c2.c2', merge: '043-c2.c2', size: 2097152, crc32: 'a7fbda95' }),
        new ROM({ name: '043-c3.c3', merge: '043-c3.c3', size: 2097152, crc32: 'f00be011' }),
        new ROM({ name: '043-c4.c4', merge: '043-c4.c4', size: 2097152, crc32: '1887e5c0' }),
        new ROM({ name: '043-m1.m1', merge: '043-m1.m1', size: 131072, crc32: '7eab59cb' }),
        new ROM({ name: '043-v1.v1', merge: '043-v1.v1', size: 2097152, crc32: '63688ce8' }),
        new ROM({ name: '043-v2.v2', merge: '043-v2.v2', size: 2097152, crc32: 'c69a827b' }),
        new ROM({ name: 'sp-s3.sp1', merge: 'sp-s3.sp1', size: 131072, crc32: '91b64be3' }),
        new ROM({ name: 'sp-s2.sp1', merge: 'sp-s2.sp1', size: 131072, crc32: '9036d879' }),
        new ROM({ name: 'sp-s.sp1', merge: 'sp-s.sp1', size: 131072, crc32: 'c7f2fa45' }),
        new ROM({ name: 'sp-u2.sp1', merge: 'sp-u2.sp1', size: 131072, crc32: 'e72943de' }),
        new ROM({ name: 'sp1-u2', merge: 'sp1-u2', size: 131072, crc32: '62f021f4' }),
        new ROM({ name: 'sp-e.sp1', merge: 'sp-e.sp1', size: 131072, crc32: '2723a5b5' }),
        new ROM({ name: 'sp1-u4.bin', merge: 'sp1-u4.bin', size: 131072, crc32: '1179a30f' }),
        new ROM({ name: 'sp1-u3.bin', merge: 'sp1-u3.bin', size: 131072, crc32: '2025b7a2' }),
        new ROM({ name: 'vs-bios.rom', merge: 'vs-bios.rom', size: 131072, crc32: 'f0e8f27d' }),
        new ROM({ name: 'sp-j2.sp1', merge: 'sp-j2.sp1', size: 131072, crc32: 'acede59c' }),
        new ROM({ name: 'sp1.jipan.1024', merge: 'sp1.jipan.1024', size: 131072, crc32: '9fb0abe4' }),
        new ROM({ name: 'sp-45.sp1', merge: 'sp-45.sp1', size: 524288, crc32: '03cc9f6a' }),
        new ROM({ name: 'sp-j3.sp1', merge: 'sp-j3.sp1', size: 524288, crc32: '486cb450' }),
        new ROM({ name: 'japan-j3.bin', merge: 'japan-j3.bin', size: 131072, crc32: 'dff6d41f' }),
        new ROM({ name: 'sp1-j3.bin', merge: 'sp1-j3.bin', size: 131072, crc32: 'fbc6d469' }),
        new ROM({ name: 'neo-po.bin', merge: 'neo-po.bin', size: 131072, crc32: '16d0c132' }),
        new ROM({ name: 'neo-epo.bin', merge: 'neo-epo.bin', size: 131072, crc32: 'd27a71f1' }),
        new ROM({ name: 'neodebug.bin', merge: 'neodebug.bin', size: 131072, crc32: '698ebb7d' }),
        new ROM({ name: 'sp-1v1_3db8c.bin', merge: 'sp-1v1_3db8c.bin', size: 131072, crc32: '162f0ebe' }),
        new ROM({ name: 'uni-bios_4_0.rom', merge: 'uni-bios_4_0.rom', size: 131072, crc32: 'a7aab458' }),
        new ROM({ name: 'uni-bios_3_3.rom', merge: 'uni-bios_3_3.rom', size: 131072, crc32: '24858466' }),
        new ROM({ name: 'uni-bios_3_2.rom', merge: 'uni-bios_3_2.rom', size: 131072, crc32: 'a4e8b9b3' }),
        new ROM({ name: 'uni-bios_3_1.rom', merge: 'uni-bios_3_1.rom', size: 131072, crc32: '0c58093f' }),
        new ROM({ name: 'uni-bios_3_0.rom', merge: 'uni-bios_3_0.rom', size: 131072, crc32: 'a97c89a9' }),
        new ROM({ name: 'uni-bios_2_3.rom', merge: 'uni-bios_2_3.rom', size: 131072, crc32: '27664eb5' }),
        new ROM({ name: 'uni-bios_2_3o.rom', merge: 'uni-bios_2_3o.rom', size: 131072, crc32: '601720ae' }),
        new ROM({ name: 'uni-bios_2_2.rom', merge: 'uni-bios_2_2.rom', size: 131072, crc32: '2d50996a' }),
        new ROM({ name: 'uni-bios_2_1.rom', merge: 'uni-bios_2_1.rom', size: 131072, crc32: '8dabf76b' }),
        new ROM({ name: 'uni-bios_2_0.rom', merge: 'uni-bios_2_0.rom', size: 131072, crc32: '0c12c2ad' }),
        new ROM({ name: 'uni-bios_1_3.rom', merge: 'uni-bios_1_3.rom', size: 131072, crc32: 'b24b44a0' }),
        new ROM({ name: 'uni-bios_1_2.rom', merge: 'uni-bios_1_2.rom', size: 131072, crc32: '4fa698e9' }),
        new ROM({ name: 'uni-bios_1_2o.rom', merge: 'uni-bios_1_2o.rom', size: 131072, crc32: 'e19d3ce9' }),
        new ROM({ name: 'uni-bios_1_1.rom', merge: 'uni-bios_1_1.rom', size: 131072, crc32: '5dda0d84' }),
        new ROM({ name: 'uni-bios_1_0.rom', merge: 'uni-bios_1_0.rom', size: 131072, crc32: '0ce453a0' }),
        new ROM({ name: 'neopen.sp1', merge: 'neopen.sp1', size: 131072, crc32: 'cb915e76' }),
        new ROM({ name: 'sm1.sm1', merge: 'sm1.sm1', size: 131072, crc32: '94416d67' }),
        new ROM({ name: 'sfix.sfix', merge: 'sfix.sfix', size: 131072, crc32: 'c2ea0cfd' }),
        new ROM({ name: '000-lo.lo', merge: '000-lo.lo', size: 131072, crc32: '5a86cff2' }),
      ],
    }),
    new Game({
      bios: 'yes',
      name: 'neogeo',
      description: 'Neo Geo',
      rom: [
        new ROM({ name: 'sp-s3.sp1', size: 131072, crc32: '91b64be3' }),
        new ROM({ name: 'sp-s2.sp1', size: 131072, crc32: '9036d879' }),
        new ROM({ name: 'sp-s.sp1', size: 131072, crc32: 'c7f2fa45' }),
        new ROM({ name: 'sp-u2.sp1', size: 131072, crc32: 'e72943de' }),
        new ROM({ name: 'sp1-u2', size: 131072, crc32: '62f021f4' }),
        new ROM({ name: 'sp-e.sp1', size: 131072, crc32: '2723a5b5' }),
        new ROM({ name: 'sp1-u4.bin', size: 131072, crc32: '1179a30f' }),
        new ROM({ name: 'sp1-u3.bin', size: 131072, crc32: '2025b7a2' }),
        new ROM({ name: 'vs-bios.rom', size: 131072, crc32: 'f0e8f27d' }),
        new ROM({ name: 'sp-j2.sp1', size: 131072, crc32: 'acede59c' }),
        new ROM({ name: 'sp1.jipan.1024', size: 131072, crc32: '9fb0abe4' }),
        new ROM({ name: 'sp-45.sp1', size: 524288, crc32: '03cc9f6a' }),
        new ROM({ name: 'sp-j3.sp1', size: 524288, crc32: '486cb450' }),
        new ROM({ name: 'japan-j3.bin', size: 131072, crc32: 'dff6d41f' }),
        new ROM({ name: 'sp1-j3.bin', size: 131072, crc32: 'fbc6d469' }),
        new ROM({ name: 'neo-po.bin', size: 131072, crc32: '16d0c132' }),
        new ROM({ name: 'neo-epo.bin', size: 131072, crc32: 'd27a71f1' }),
        new ROM({ name: 'neodebug.bin', size: 131072, crc32: '698ebb7d' }),
        new ROM({ name: 'sp-1v1_3db8c.bin', size: 131072, crc32: '162f0ebe' }),
        new ROM({ name: 'uni-bios_4_0.rom', size: 131072, crc32: 'a7aab458' }),
        new ROM({ name: 'uni-bios_3_3.rom', size: 131072, crc32: '24858466' }),
        new ROM({ name: 'uni-bios_3_2.rom', size: 131072, crc32: 'a4e8b9b3' }),
        new ROM({ name: 'uni-bios_3_1.rom', size: 131072, crc32: '0c58093f' }),
        new ROM({ name: 'uni-bios_3_0.rom', size: 131072, crc32: 'a97c89a9' }),
        new ROM({ name: 'uni-bios_2_3.rom', size: 131072, crc32: '27664eb5' }),
        new ROM({ name: 'uni-bios_2_3o.rom', size: 131072, crc32: '601720ae' }),
        new ROM({ name: 'uni-bios_2_2.rom', size: 131072, crc32: '2d50996a' }),
        new ROM({ name: 'uni-bios_2_1.rom', size: 131072, crc32: '8dabf76b' }),
        new ROM({ name: 'uni-bios_2_0.rom', size: 131072, crc32: '0c12c2ad' }),
        new ROM({ name: 'uni-bios_1_3.rom', size: 131072, crc32: 'b24b44a0' }),
        new ROM({ name: 'uni-bios_1_2.rom', size: 131072, crc32: '4fa698e9' }),
        new ROM({ name: 'uni-bios_1_2o.rom', size: 131072, crc32: 'e19d3ce9' }),
        new ROM({ name: 'uni-bios_1_1.rom', size: 131072, crc32: '5dda0d84' }),
        new ROM({ name: 'uni-bios_1_0.rom', size: 131072, crc32: '0ce453a0' }),
        new ROM({ name: 'neopen.sp1', size: 131072, crc32: 'cb915e76' }),
        new ROM({ name: 'sm1.sm1', size: 131072, crc32: '94416d67' }),
        new ROM({ name: 'sfix.sfix', size: 131072, crc32: 'c2ea0cfd' }),
        new ROM({ name: '000-lo.lo', size: 131072, crc32: '5a86cff2' }),
      ],
    }),
  ]);

  it('should split', async () => {
    // Given
    const options = new Options({
      mergeRoms: MergeMode[MergeMode.SPLIT].toLowerCase(),
    });

    // When
    const result = await new DATMergerSplitter(options, new ProgressBarFake()).merge(dat);

    // Then nothing was merged
    expect(result.getParents()).toHaveLength(dat.getParents().length);
    expect(result.getGames()).toHaveLength(dat.getGames().length);

    const gameNamesToRomNames = result.getGames()
      .reduce((map, game) => {
        map.set(game.getName(), game.getRoms().map((rom) => rom.getName().replace(/[\\/]/g, '\\')));
        return map;
      }, new Map<string, string[]>());

    // No change
    expect(gameNamesToRomNames.get('neogeo')).toIncludeAllMembers([
      'sp-s3.sp1', 'sp-s2.sp1', 'sp-s.sp1', 'sp-u2.sp1', 'sp1-u2', 'sp-e.sp1', 'sp1-u4.bin',
      'sp1-u3.bin', 'vs-bios.rom', 'sp-j2.sp1', 'sp1.jipan.1024', 'sp-45.sp1', 'sp-j3.sp1',
      'japan-j3.bin', 'sp1-j3.bin', 'neo-po.bin', 'neo-epo.bin', 'neodebug.bin', 'sp-1v1_3db8c.bin',
      'uni-bios_4_0.rom', 'uni-bios_3_3.rom', 'uni-bios_3_2.rom', 'uni-bios_3_1.rom',
      'uni-bios_3_0.rom', 'uni-bios_2_3.rom', 'uni-bios_2_3o.rom', 'uni-bios_2_2.rom',
      'uni-bios_2_1.rom', 'uni-bios_2_0.rom', 'uni-bios_1_3.rom', 'uni-bios_1_2.rom',
      'uni-bios_1_2o.rom', 'uni-bios_1_1.rom', 'uni-bios_1_0.rom', 'neopen.sp1', 'sm1.sm1',
      'sfix.sfix', '000-lo.lo',
    ]);
    // Clones exclude parent ROMs
    expect(gameNamesToRomNames.get('3countb')).toIncludeAllMembers([
      '043-p1.p1', '043-s1.s1', '043-c1.c1', '043-c2.c2', '043-c3.c3', '043-c4.c4', '043-m1.m1',
      '043-v1.v1', '043-v2.v2',
    ]);
    expect(gameNamesToRomNames.get('3countba')).toIncludeAllMembers([
      '043-epr.ep1', '043-epr.ep2',
    ]);
  });
});
