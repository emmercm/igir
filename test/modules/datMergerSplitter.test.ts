import DATMergerSplitter from '../../src/modules/datMergerSplitter.js';
import Header from '../../src/types/dats/logiqx/header.js';
import LogiqxDAT from '../../src/types/dats/logiqx/logiqxDat.js';
import DeviceRef from '../../src/types/dats/mame/deviceRef.js';
import Machine from '../../src/types/dats/mame/machine.js';
import ROM from '../../src/types/dats/rom.js';
import Options, { MergeMode } from '../../src/types/options.js';
import ProgressBarFake from '../console/progressBarFake.js';

/* eslint-disable object-curly-newline, unicorn/numeric-separators-style */
// MAME v0.257
const dat = new LogiqxDAT(new Header(), [
  // ***** Games *****
  new Machine({
    name: '100lions',
    romOf: 'aristmk6',
    description: '100 Lions (10219211, NSW/ACT)',
    rom: [
      new ROM({ name: '24013001_right.u83', merge: '24013001_right.u83', bios: 'au-nsw1', size: 2097152, crc: 'e97afedf', sha1: '10ca3b015afaff5d7812f0f5207b2535602136a5' }),
      new ROM({ name: '24013001_left.u70', merge: '24013001_left.u70', bios: 'au-nsw1', size: 2097152, crc: '06ae7e07', sha1: '39a45575b66906d73b519988d1001c99b05c5f34' }),
      new ROM({ name: '21012901_right.u83', merge: '21012901_right.u83', bios: 'au-nsw2', size: 2097152, crc: '757618f2', sha1: '43f9a3e7d544979f8c6974945914d9e099b02abd' }),
      new ROM({ name: '21012901_left.u70', merge: '21012901_left.u70', bios: 'au-nsw2', size: 2097152, crc: '0d271470', sha1: '5cd4b604bfe2fd7e9a8d08e1c7c97f17ae068479' }),
      new ROM({ name: '19012801_right.u83', merge: '19012801_right.u83', bios: 'au-nsw3', size: 2097152, crc: '5b20a96c', sha1: '5fd916b7cc2cdd51bf7dd212c1114f94dc9c7926' }),
      new ROM({ name: '19012801_left.u70', merge: '19012801_left.u70', bios: 'au-nsw3', size: 2097152, crc: 'b03bd17c', sha1: 'f281e80f6dda5b727ed71d2deebe3b0ff548773f' }),
      new ROM({ name: '13012001_right.u83', merge: '13012001_right.u83', bios: 'au-nsw4', size: 2097152, crc: 'e627dbfa', sha1: '4fedbe0975ceb7dc0ebebf18a7708d78984db9b7' }),
      new ROM({ name: '13012001_left.u70', merge: '13012001_left.u70', bios: 'au-nsw4', size: 2097152, crc: '38e8f659', sha1: '88c6acba99b0aca023c6f4d27c061c231490e9e0' }),
      new ROM({ name: '11011901_right.u83', merge: '11011901_right.u83', bios: 'au-nsw5', size: 2097152, crc: '73dcb11c', sha1: '69ae4f32a0c9141b2a82ff3935b0cd20333d2964' }),
      new ROM({ name: '11011901_left.u70', merge: '11011901_left.u70', bios: 'au-nsw5', size: 2097152, crc: 'd3dd2210', sha1: '3548f8cc39859d3f44a55f6bae48966a2d48e0eb' }),
      new ROM({ name: '11011501_right.u83', merge: '11011501_right.u83', bios: 'au-nsw6', size: 2097152, crc: 'de4c3aed', sha1: '21596a2edd20eb7de7a4ec8900a270b09c8f326f' }),
      new ROM({ name: '11011501_left.u70', merge: '11011501_left.u70', bios: 'au-nsw6', size: 2097152, crc: 'c5cc3461', sha1: '5b43c4cb6110a6ccf67cd0f3789253f6872b20c4' }),
      new ROM({ name: '09011001_right.u83', merge: '09011001_right.u83', bios: 'au-nsw7', size: 2097152, crc: '8a853f80', sha1: '9a75498f7b02c81a483b4e1c158f35f0ee4c0112' }),
      new ROM({ name: '09011001_left.u70', merge: '09011001_left.u70', bios: 'au-nsw7', size: 2097152, crc: '229c2e63', sha1: '91fd2b1acb69efe073647e93db9f11042add2feb' }),
      new ROM({ name: '07010801_right.u83', merge: '07010801_right.u83', bios: 'au-nsw8', size: 2097152, crc: '8c148c11', sha1: '5ff3be18455b4f04675fec8d5b9d881295c65e23' }),
      new ROM({ name: '07010801_left.u70', merge: '07010801_left.u70', bios: 'au-nsw8', size: 2097152, crc: '8e92af68', sha1: '00d2bb655b7964a9652896741210ec534df0b0d2' }),
      new ROM({ name: '05010601_right.u83', merge: '05010601_right.u83', bios: 'au-nsw9', size: 1048576, crc: 'c12eac11', sha1: '683b9ddc323865ace7dca37d13b55de6e42759a5' }),
      new ROM({ name: '05010601_left.u70', merge: '05010601_left.u70', bios: 'au-nsw9', size: 1048576, crc: 'b3e6b4a0', sha1: '3bf398c9257579f8e51ce716d6ebfa74fa510273' }),
      new ROM({ name: '04010501_right.u83', merge: '04010501_right.u83', bios: 'au-nsw10', size: 1048576, crc: '3daefb7a', sha1: '411471713219f4bab5ccf5fe7a12a6c138c8c550' }),
      new ROM({ name: '04010501_left.u70', merge: '04010501_left.u70', bios: 'au-nsw10', size: 1048576, crc: '21182775', sha1: '7c5b7f5aba3babc85f512a8f7d4ebc0d83eb842a' }),
      new ROM({ name: '03010301.u84', merge: '03010301.u84', bios: 'au-nsw11', size: 1048576, crc: 'a34a9f16', sha1: 'b8750e6ceb1715da8e5ac2f0183254e29a042641' }),
      new ROM({ name: '03010301.u71', merge: '03010301.u71', bios: 'au-nsw11', size: 1048576, crc: 'd793440a', sha1: 'dced4c04bde13293af77a9a1f4c5c606e3758de0' }),
      new ROM({ name: '03010301.u83', merge: '03010301.u83', bios: 'au-nsw11', size: 1048576, crc: 'c8580554', sha1: '58b8bfff2f8d298c4e3be2b01900800c45fa7ad7' }),
      new ROM({ name: '03010301.u70', merge: '03010301.u70', bios: 'au-nsw11', size: 1048576, crc: '5ae69121', sha1: '36dd3f9aaf5f7d2751d1954d67f898bc3ec71f3b' }),
      new ROM({ name: '02010201.u84', merge: '02010201.u84', bios: 'au-nsw12', size: 1048576, crc: '0920930f', sha1: '771b0f62442d1c75b1bb59ad82365b7ab8747173' }),
      new ROM({ name: '02010201.u71', merge: '02010201.u71', bios: 'au-nsw12', size: 1048576, crc: '24d5614a', sha1: 'fdcf3826dccc72b74b66379b1411cf211d5a1670' }),
      new ROM({ name: '02010201.u83', merge: '02010201.u83', bios: 'au-nsw12', size: 1048576, crc: '5f64a20c', sha1: '397404ab6d2a1aa3c1fc77bb9421fef7079b65a5' }),
      new ROM({ name: '02010201.u70', merge: '02010201.u70', bios: 'au-nsw12', size: 1048576, crc: '9b2db442', sha1: 'd512398a2d9257bd385dc50d61c63cd1a47300ba' }),
      new ROM({ name: '02010114.u84', merge: '02010114.u84', bios: 'au-nsw13', size: 1048576, crc: '183e3836', sha1: '4c802d0cd010bc007acb3a83e37aaa29b2d13d87' }),
      new ROM({ name: '02010114.u71', merge: '02010114.u71', bios: 'au-nsw13', size: 1048576, crc: '8f83c3dd', sha1: 'a5f9d80b4b515b24299d0241e1665cfd9da8bab7' }),
      new ROM({ name: '02010114.u83', merge: '02010114.u83', bios: 'au-nsw13', size: 1048576, crc: '945104d7', sha1: 'e372d0cf889c72b5d001b26fe4a925a28486537f' }),
      new ROM({ name: '02010114.u70', merge: '02010114.u70', bios: 'au-nsw13', size: 1048576, crc: '3ba4379f', sha1: '84367f12c4c9224d2ab9cae83ae8727de338408c' }),
      new ROM({ name: '25012805_right.u83', merge: '25012805_right.u83', bios: 'au-qld1', size: 2097152, crc: '2ecd8da8', sha1: '389e9668b2ba4fffed5d2721b2ce70d502fb9f67' }),
      new ROM({ name: '25012805_left.u70', merge: '25012805_left.u70', bios: 'au-qld1', size: 2097152, crc: '996f32ce', sha1: 'cf21bef745986fcbd298167453c7b8e5945ce602' }),
      new ROM({ name: '20012605_right.u83', merge: '20012605_right.u83', bios: 'au-qld2', size: 2097152, crc: '045b82ad', sha1: 'b8e4f9f826970d83ae5fd2f2898de12ad1bf2d24' }),
      new ROM({ name: '20012605_left.u70', merge: '20012605_left.u70', bios: 'au-qld2', size: 2097152, crc: '87331111', sha1: '6cdc2d81f68de23af18a975a6f27ddec246be405' }),
      new ROM({ name: '20012305_right.u83', merge: '20012305_right.u83', bios: 'au-qld3', size: 2097152, crc: 'e436c1f5', sha1: '62ee529cc971fd76aa2ccc15778e3f0c40e3e47f' }),
      new ROM({ name: '20012305_left.u70', merge: '20012305_left.u70', bios: 'au-qld3', size: 2097152, crc: 'ea8961cc', sha1: '0ebc7c3b94a6e01ee984af4711043130d9670bd3' }),
      new ROM({ name: '14011605_right.u83', merge: '14011605_right.u83', bios: 'au-qld4', size: 2097152, crc: '2bec5b74', sha1: '854733cada75e632f01f7096d4740ed4941a3d5b' }),
      new ROM({ name: '14011605_left.u70', merge: '14011605_left.u70', bios: 'au-qld4', size: 2097152, crc: 'cd26d4f0', sha1: '40822714abf08aeb08d827dbd8cd099f86803754' }),
      new ROM({ name: '04041205_right.u83', merge: '04041205_right.u83', bios: 'au-qld5', size: 1048576, crc: 'ca6bc86c', sha1: '69fe7fc35694e4cd7f861bff4ec3a6165a81df6e' }),
      new ROM({ name: '04041205_left.u70', merge: '04041205_left.u70', bios: 'au-qld5', size: 1048576, crc: 'dfb9a119', sha1: '814a5a7877392aec4e4871d7f0e19d2fbd717409' }),
      new ROM({ name: '03130334_right.u83', merge: '03130334_right.u83', bios: 'au-qld6', size: 2097152, crc: 'bce3d97f', sha1: 'da36377cc1465022a2434703adee63bf48c71a9c' }),
      new ROM({ name: '03130334_left.u70', merge: '03130334_left.u70', bios: 'au-qld6', size: 2097152, crc: '02175fde', sha1: '4e9a9e1e803a0c84b06aec99dc3147dd7a919eee' }),
      new ROM({ name: '01040505.u84', merge: '01040505.u84', bios: 'au-qld7', size: 1048576, crc: 'cf5a9d1e', sha1: '0ebba478fc883831d70b0fa95f43e5f93b07ae9e' }),
      new ROM({ name: '01040505.u71', merge: '01040505.u71', bios: 'au-qld7', size: 1048576, crc: 'f56ea77e', sha1: '319be1bee66a289e2c1f6beec07758f79aa0cf16' }),
      new ROM({ name: '01040505.u83', merge: '01040505.u83', bios: 'au-qld7', size: 1048576, crc: '90f32169', sha1: '228be8b4a9eb6b2acf7f7a7561bd194009936026' }),
      new ROM({ name: '01040505.u70', merge: '01040505.u70', bios: 'au-qld7', size: 1048576, crc: 'b9ddea66', sha1: 'f4bfdeada39a3f0094d6468b7374a34f88f5df7f' }),
      new ROM({ name: '03030708_right.u83', merge: '03030708_right.u83', bios: 'au-sa1', size: 1048576, crc: 'b4b3c6a5', sha1: '5747f98a6eaa5c24a23d1d76a28b33a3bfbbfd1f' }),
      new ROM({ name: '03030708_left.u70', merge: '03030708_left.u70', bios: 'au-sa1', size: 1048576, crc: '4e5ad823', sha1: '77ab1c29c6172cfdcef776222a72b2b44114d4da' }),
      new ROM({ name: '14011913_right.u83', merge: '14011913_right.u83', bios: 'nz1', size: 2097152, crc: '01d13b89', sha1: 'b1013366d0803dfbec5a5f90f6a5cea862de0513' }),
      new ROM({ name: '14011913_left.u70', merge: '14011913_left.u70', bios: 'nz1', size: 2097152, crc: '9a4cefdf', sha1: '6c15bc565ede8af19361d60ee1e6657a8055c92c' }),
      new ROM({ name: '14010152_right.u83', merge: '14010152_right.u83', bios: 'nz2', size: 2097152, crc: '7e3f61f6', sha1: '1e27d72c35b0c633187159ef434f22398df28882' }),
      new ROM({ name: '14010152_left.u70', merge: '14010152_left.u70', bios: 'nz2', size: 2097152, crc: '2716e1ef', sha1: '81fe1ae4f9cd1bcb24795ce85913ee22ed0fabcd' }),
      new ROM({ name: '02061013_right.u83', merge: '02061013_right.u83', bios: 'nz3', size: 1048576, crc: '7a8619a5', sha1: 'bd03ddb68817c1660b009e102ccf69e5b603b875' }),
      new ROM({ name: '02061013_left.u70', merge: '02061013_left.u70', bios: 'nz3', size: 1048576, crc: 'e70a7007', sha1: '0935f924866162d9c0fbdbb99391cbf730a04b76' }),
      new ROM({ name: '02060913_right.u83', merge: '02060913_right.u83', bios: 'nz4', size: 1048576, crc: '31068c41', sha1: '962da0079495a64f7ffb34be643892c272017cc9' }),
      new ROM({ name: '02060913_left.u70', merge: '02060913_left.u70', bios: 'nz4', size: 1048576, crc: 'd6a6713c', sha1: '0f3bb2746f1a6fa6a587fd50827299408a3b28d2' }),
      new ROM({ name: '15011025_right.u83', merge: '15011025_right.u83', bios: 'my', size: 2097152, crc: 'bf21a975', sha1: 'a251b1a7342387300689cd50fe4ce7975b903ac5' }),
      new ROM({ name: '15011025_left.u70', merge: '15011025_left.u70', bios: 'my', size: 2097152, crc: 'c02e14b0', sha1: '6bf98927813519dfe60e582dbe5be3ccd87f7c91' }),
      new ROM({ name: '24010467_right.u83', merge: '24010467_right.u83', bios: 'afr', size: 2097152, crc: 'eddeff13', sha1: '77ccbcf40aeb7305eb13d6d24efafd09955f1eac' }),
      new ROM({ name: '24010467_left.u70', merge: '24010467_left.u70', bios: 'afr', size: 2097152, crc: '9093d820', sha1: '05bb14895e3077d277a1d0822036d08f359c0307' }),
      new ROM({ name: '01.04.11_right.u83', merge: '01.04.11_right.u83', bios: 'us1', size: 2097152, crc: '2dae8ca0', sha1: '7a0fb38b4c1ac7195d15bdab6f0cfb16c78430f0' }),
      new ROM({ name: '01.04.11_left.u70', merge: '01.04.11_left.u70', bios: 'us1', size: 2097152, crc: '787f2b07', sha1: '2548289e44f4b935346b759afb5383bdbac04c3e' }),
      new ROM({ name: '01.04.10_right.u83', merge: '01.04.10_right.u83', bios: 'us2', size: 2097152, crc: '82ce2fcc', sha1: '4c8fb3db084a67e99d1420b3f895a06ce9ef5ec2' }),
      new ROM({ name: '01.04.10_left.u70', merge: '01.04.10_left.u70', bios: 'us2', size: 2097152, crc: '9d9d52c1', sha1: 'b957220cdbedd516c219d1bfc28807ce466df93f' }),
      new ROM({ name: '01.04.08_right.u83', merge: '01.04.08_right.u83', bios: 'us3', size: 2097152, crc: '95333304', sha1: '7afe49d6c5e4d6820f349778557daa88c5366a51' }),
      new ROM({ name: '01.04.08_left.u70', merge: '01.04.08_left.u70', bios: 'us3', size: 2097152, crc: '0dfcad10', sha1: '53798be000304aed38909f5fd8470a68bedd8229' }),
      new ROM({ name: '01.04.07_right.u83', merge: '01.04.07_right.u83', bios: 'us4', size: 2097152, crc: '23c28e22', sha1: '98f24a1f86232b6c2c288a61ec7d60c867f192e5' }),
      new ROM({ name: '01.04.07_left.u70', merge: '01.04.07_left.u70', bios: 'us4', size: 2097152, crc: 'acfb0fe0', sha1: 'b1a772d7978e6ff4406a5bb39a71cb3f89608e72' }),
      new ROM({ name: '01.04.04_right.u83', merge: '01.04.04_right.u83', bios: 'us5', size: 2097152, crc: 'e57ba02d', sha1: '8e29403e6b619eeab41dc171221720bc7820ccdc' }),
      new ROM({ name: '01.04.04_left.u70', merge: '01.04.04_left.u70', bios: 'us5', size: 2097152, crc: 'b984a92c', sha1: '90f7a61302caee40195c08565bdac856a3234c1d' }),
      new ROM({ name: '01.03.17_right.u83', merge: '01.03.17_right.u83', bios: 'us6', size: 2097152, crc: '1582714b', sha1: '92d0a15314ffe526159bef9a364898dd1ebdfde7' }),
      new ROM({ name: '01.03.17_left.u70', merge: '01.03.17_left.u70', bios: 'us6', size: 2097152, crc: 'a88193dc', sha1: 'c9e1d483edaecd318d2e5fc8a54e84516c93e0ca' }),
      new ROM({ name: '01.03.14_right.u83', merge: '01.03.14_right.u83', bios: 'us7', size: 2097152, crc: '889ffd82', sha1: '9c98c9cdcf5f7d05095f11006418133029e9f0f8' }),
      new ROM({ name: '01.03.14_left.u70', merge: '01.03.14_left.u70', bios: 'us7', size: 2097152, crc: '7138fec4', sha1: 'f81331d1875ac574d3e6c98be218ff25c6c7be5a' }),
      new ROM({ name: '01.03.07_right.u83', merge: '01.03.07_right.u83', bios: 'us8', size: 2097152, crc: '2ebccc4e', sha1: '9342724e4451e9ab24ceae208284b50abd4f0be3' }),
      new ROM({ name: '01.03.07_left.u70', merge: '01.03.07_left.u70', bios: 'us8', size: 2097152, crc: 'a3632da4', sha1: '1c96a88e86095b81801ab88e36a4cdfa4b893265' }),
      new ROM({ name: '01.03.06_right.u83', merge: '01.03.06_right.u83', bios: 'us9', size: 2097152, crc: 'bd48ca55', sha1: '8fb1576cbeb1c64c358880714740195d2e73e03e' }),
      new ROM({ name: '01.03.06_left.u70', merge: '01.03.06_left.u70', bios: 'us9', size: 2097152, crc: '2f9d9a29', sha1: 'fdebfaca9a579d7249379f19aef22fbfd66bf943' }),
      new ROM({ name: '01.03.05_right.u83', merge: '01.03.05_right.u83', bios: 'us10', size: 2097152, crc: '2c7f1ec3', sha1: 'd03167f43ed6f9596080d91472695829378cef0a' }),
      new ROM({ name: '01.03.05_left.u70', merge: '01.03.05_left.u70', bios: 'us10', size: 2097152, crc: '0095e3f9', sha1: 'd2e8786158b1ab0a614aab21cf1d14cbc04754af' }),
      new ROM({ name: '01.03.03e_right.u83', merge: '01.03.03e_right.u83', bios: 'us11', size: 2097152, crc: '2255e263', sha1: '5e9e093aaa17172f47a14c3baf7f6f0f73b19398' }),
      new ROM({ name: '01.03.03e_left.u70', merge: '01.03.03e_left.u70', bios: 'us11', size: 2097152, crc: 'ea50729a', sha1: '14b5a71bfb91ac366ddcb5f77fb54127808f8163' }),
      new ROM({ name: '01.03.03a_right.u83', merge: '01.03.03a_right.u83', bios: 'us12', size: 2097152, crc: '253415f4', sha1: '50dc77ad87bc6be1932dda2fd4865602c8c49729' }),
      new ROM({ name: '01.03.03a_left.u70', merge: '01.03.03a_left.u70', bios: 'us12', size: 2097152, crc: '4ab5dd40', sha1: 'a6812cc624e6a98ea7b0697e2797fe10ba8e303e' }),
      new ROM({ name: '01.02.08_right.u2', merge: '01.02.08_right.u2', bios: 'us13', size: 1048576, crc: 'aaaeac8c', sha1: 'a565e5fcb4f55f31e7d36be40eec234248a66efd' }),
      new ROM({ name: '01.02.08_left.u3', merge: '01.02.08_left.u3', bios: 'us13', size: 1048576, crc: 'f29fd1bf', sha1: '33e043d2616e10a1c7a0936c3d208f9bcc2ca6f3' }),
      new ROM({ name: '06.03.04_right.u2', merge: '06.03.04_right.u2', bios: 'set-us1', size: 1048576, crc: '6f5f5ef1', sha1: '70a43fba4de47ed8dcf38b25eafd5873f3428e72' }),
      new ROM({ name: '06.03.04_left.u3', merge: '06.03.04_left.u3', bios: 'set-us1', size: 1048576, crc: '7034f26b', sha1: '7be78f23bec38d05240cdfe1186ec0c8291f5a1c' }),
      new ROM({ name: '06.03.03_right.u2', merge: '06.03.03_right.u2', bios: 'set-us2', size: 1048576, crc: '98763498', sha1: '246e95cc12eb34f946b2f4938c59217718f6d841' }),
      new ROM({ name: '06.03.03_left.u3', merge: '06.03.03_left.u3', bios: 'set-us2', size: 1048576, crc: 'a6924238', sha1: 'b71ab39bf9c1fdbab556028138749e8c040ec83c' }),
      new ROM({ name: '06.02.20_right.u83', merge: '06.02.20_right.u83', bios: 'set-us3', size: 1048576, crc: 'e4001f60', sha1: '5da34efb1ac0f7c84a48e09363d20cfecda4bcf1' }),
      new ROM({ name: '06.02.20_left.u70', merge: '06.02.20_left.u70', bios: 'set-us3', size: 1048576, crc: '199ed3b9', sha1: 'e3ee81ffd713f09e35a10c38e4f59282e2c5cd30' }),
      new ROM({ name: '06.02.04_right.u2', merge: '06.02.04_right.u2', bios: 'set-us4', size: 1048576, crc: '1cf5a853', sha1: '64d17efcce702df7a0b0e151293199478e25226d' }),
      new ROM({ name: '06.02.04_left.u3', merge: '06.02.04_left.u3', bios: 'set-us4', size: 1048576, crc: '117b75f2', sha1: '2129286853d3c50b8a943b71334d4ef6b98adc05' }),
      new ROM({ name: '10219211.u86', size: 4194304, crc: 'a1c71dd2', sha1: '9a859df876cf6a2fadcc5ae7183021881dc08887' }),
      new ROM({ name: '10219211.u73', size: 4194304, crc: 'da7d2ed7', sha1: '1f81cad150c013848988e6f995a45f7ea5c6d95c' }),
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
      new ROM({ name: '24013001_right.u83', merge: '24013001_right.u83', bios: 'au-nsw1', size: 2097152, crc: 'e97afedf', sha1: '10ca3b015afaff5d7812f0f5207b2535602136a5' }),
      new ROM({ name: '24013001_left.u70', merge: '24013001_left.u70', bios: 'au-nsw1', size: 2097152, crc: '06ae7e07', sha1: '39a45575b66906d73b519988d1001c99b05c5f34' }),
      new ROM({ name: '21012901_right.u83', merge: '21012901_right.u83', bios: 'au-nsw2', size: 2097152, crc: '757618f2', sha1: '43f9a3e7d544979f8c6974945914d9e099b02abd' }),
      new ROM({ name: '21012901_left.u70', merge: '21012901_left.u70', bios: 'au-nsw2', size: 2097152, crc: '0d271470', sha1: '5cd4b604bfe2fd7e9a8d08e1c7c97f17ae068479' }),
      new ROM({ name: '19012801_right.u83', merge: '19012801_right.u83', bios: 'au-nsw3', size: 2097152, crc: '5b20a96c', sha1: '5fd916b7cc2cdd51bf7dd212c1114f94dc9c7926' }),
      new ROM({ name: '19012801_left.u70', merge: '19012801_left.u70', bios: 'au-nsw3', size: 2097152, crc: 'b03bd17c', sha1: 'f281e80f6dda5b727ed71d2deebe3b0ff548773f' }),
      new ROM({ name: '13012001_right.u83', merge: '13012001_right.u83', bios: 'au-nsw4', size: 2097152, crc: 'e627dbfa', sha1: '4fedbe0975ceb7dc0ebebf18a7708d78984db9b7' }),
      new ROM({ name: '13012001_left.u70', merge: '13012001_left.u70', bios: 'au-nsw4', size: 2097152, crc: '38e8f659', sha1: '88c6acba99b0aca023c6f4d27c061c231490e9e0' }),
      new ROM({ name: '11011901_right.u83', merge: '11011901_right.u83', bios: 'au-nsw5', size: 2097152, crc: '73dcb11c', sha1: '69ae4f32a0c9141b2a82ff3935b0cd20333d2964' }),
      new ROM({ name: '11011901_left.u70', merge: '11011901_left.u70', bios: 'au-nsw5', size: 2097152, crc: 'd3dd2210', sha1: '3548f8cc39859d3f44a55f6bae48966a2d48e0eb' }),
      new ROM({ name: '11011501_right.u83', merge: '11011501_right.u83', bios: 'au-nsw6', size: 2097152, crc: 'de4c3aed', sha1: '21596a2edd20eb7de7a4ec8900a270b09c8f326f' }),
      new ROM({ name: '11011501_left.u70', merge: '11011501_left.u70', bios: 'au-nsw6', size: 2097152, crc: 'c5cc3461', sha1: '5b43c4cb6110a6ccf67cd0f3789253f6872b20c4' }),
      new ROM({ name: '09011001_right.u83', merge: '09011001_right.u83', bios: 'au-nsw7', size: 2097152, crc: '8a853f80', sha1: '9a75498f7b02c81a483b4e1c158f35f0ee4c0112' }),
      new ROM({ name: '09011001_left.u70', merge: '09011001_left.u70', bios: 'au-nsw7', size: 2097152, crc: '229c2e63', sha1: '91fd2b1acb69efe073647e93db9f11042add2feb' }),
      new ROM({ name: '07010801_right.u83', merge: '07010801_right.u83', bios: 'au-nsw8', size: 2097152, crc: '8c148c11', sha1: '5ff3be18455b4f04675fec8d5b9d881295c65e23' }),
      new ROM({ name: '07010801_left.u70', merge: '07010801_left.u70', bios: 'au-nsw8', size: 2097152, crc: '8e92af68', sha1: '00d2bb655b7964a9652896741210ec534df0b0d2' }),
      new ROM({ name: '05010601_right.u83', merge: '05010601_right.u83', bios: 'au-nsw9', size: 1048576, crc: 'c12eac11', sha1: '683b9ddc323865ace7dca37d13b55de6e42759a5' }),
      new ROM({ name: '05010601_left.u70', merge: '05010601_left.u70', bios: 'au-nsw9', size: 1048576, crc: 'b3e6b4a0', sha1: '3bf398c9257579f8e51ce716d6ebfa74fa510273' }),
      new ROM({ name: '04010501_right.u83', merge: '04010501_right.u83', bios: 'au-nsw10', size: 1048576, crc: '3daefb7a', sha1: '411471713219f4bab5ccf5fe7a12a6c138c8c550' }),
      new ROM({ name: '04010501_left.u70', merge: '04010501_left.u70', bios: 'au-nsw10', size: 1048576, crc: '21182775', sha1: '7c5b7f5aba3babc85f512a8f7d4ebc0d83eb842a' }),
      new ROM({ name: '03010301.u84', merge: '03010301.u84', bios: 'au-nsw11', size: 1048576, crc: 'a34a9f16', sha1: 'b8750e6ceb1715da8e5ac2f0183254e29a042641' }),
      new ROM({ name: '03010301.u71', merge: '03010301.u71', bios: 'au-nsw11', size: 1048576, crc: 'd793440a', sha1: 'dced4c04bde13293af77a9a1f4c5c606e3758de0' }),
      new ROM({ name: '03010301.u83', merge: '03010301.u83', bios: 'au-nsw11', size: 1048576, crc: 'c8580554', sha1: '58b8bfff2f8d298c4e3be2b01900800c45fa7ad7' }),
      new ROM({ name: '03010301.u70', merge: '03010301.u70', bios: 'au-nsw11', size: 1048576, crc: '5ae69121', sha1: '36dd3f9aaf5f7d2751d1954d67f898bc3ec71f3b' }),
      new ROM({ name: '02010201.u84', merge: '02010201.u84', bios: 'au-nsw12', size: 1048576, crc: '0920930f', sha1: '771b0f62442d1c75b1bb59ad82365b7ab8747173' }),
      new ROM({ name: '02010201.u71', merge: '02010201.u71', bios: 'au-nsw12', size: 1048576, crc: '24d5614a', sha1: 'fdcf3826dccc72b74b66379b1411cf211d5a1670' }),
      new ROM({ name: '02010201.u83', merge: '02010201.u83', bios: 'au-nsw12', size: 1048576, crc: '5f64a20c', sha1: '397404ab6d2a1aa3c1fc77bb9421fef7079b65a5' }),
      new ROM({ name: '02010201.u70', merge: '02010201.u70', bios: 'au-nsw12', size: 1048576, crc: '9b2db442', sha1: 'd512398a2d9257bd385dc50d61c63cd1a47300ba' }),
      new ROM({ name: '02010114.u84', merge: '02010114.u84', bios: 'au-nsw13', size: 1048576, crc: '183e3836', sha1: '4c802d0cd010bc007acb3a83e37aaa29b2d13d87' }),
      new ROM({ name: '02010114.u71', merge: '02010114.u71', bios: 'au-nsw13', size: 1048576, crc: '8f83c3dd', sha1: 'a5f9d80b4b515b24299d0241e1665cfd9da8bab7' }),
      new ROM({ name: '02010114.u83', merge: '02010114.u83', bios: 'au-nsw13', size: 1048576, crc: '945104d7', sha1: 'e372d0cf889c72b5d001b26fe4a925a28486537f' }),
      new ROM({ name: '02010114.u70', merge: '02010114.u70', bios: 'au-nsw13', size: 1048576, crc: '3ba4379f', sha1: '84367f12c4c9224d2ab9cae83ae8727de338408c' }),
      new ROM({ name: '25012805_right.u83', merge: '25012805_right.u83', bios: 'au-qld1', size: 2097152, crc: '2ecd8da8', sha1: '389e9668b2ba4fffed5d2721b2ce70d502fb9f67' }),
      new ROM({ name: '25012805_left.u70', merge: '25012805_left.u70', bios: 'au-qld1', size: 2097152, crc: '996f32ce', sha1: 'cf21bef745986fcbd298167453c7b8e5945ce602' }),
      new ROM({ name: '20012605_right.u83', merge: '20012605_right.u83', bios: 'au-qld2', size: 2097152, crc: '045b82ad', sha1: 'b8e4f9f826970d83ae5fd2f2898de12ad1bf2d24' }),
      new ROM({ name: '20012605_left.u70', merge: '20012605_left.u70', bios: 'au-qld2', size: 2097152, crc: '87331111', sha1: '6cdc2d81f68de23af18a975a6f27ddec246be405' }),
      new ROM({ name: '20012305_right.u83', merge: '20012305_right.u83', bios: 'au-qld3', size: 2097152, crc: 'e436c1f5', sha1: '62ee529cc971fd76aa2ccc15778e3f0c40e3e47f' }),
      new ROM({ name: '20012305_left.u70', merge: '20012305_left.u70', bios: 'au-qld3', size: 2097152, crc: 'ea8961cc', sha1: '0ebc7c3b94a6e01ee984af4711043130d9670bd3' }),
      new ROM({ name: '14011605_right.u83', merge: '14011605_right.u83', bios: 'au-qld4', size: 2097152, crc: '2bec5b74', sha1: '854733cada75e632f01f7096d4740ed4941a3d5b' }),
      new ROM({ name: '14011605_left.u70', merge: '14011605_left.u70', bios: 'au-qld4', size: 2097152, crc: 'cd26d4f0', sha1: '40822714abf08aeb08d827dbd8cd099f86803754' }),
      new ROM({ name: '04041205_right.u83', merge: '04041205_right.u83', bios: 'au-qld5', size: 1048576, crc: 'ca6bc86c', sha1: '69fe7fc35694e4cd7f861bff4ec3a6165a81df6e' }),
      new ROM({ name: '04041205_left.u70', merge: '04041205_left.u70', bios: 'au-qld5', size: 1048576, crc: 'dfb9a119', sha1: '814a5a7877392aec4e4871d7f0e19d2fbd717409' }),
      new ROM({ name: '03130334_right.u83', merge: '03130334_right.u83', bios: 'au-qld6', size: 2097152, crc: 'bce3d97f', sha1: 'da36377cc1465022a2434703adee63bf48c71a9c' }),
      new ROM({ name: '03130334_left.u70', merge: '03130334_left.u70', bios: 'au-qld6', size: 2097152, crc: '02175fde', sha1: '4e9a9e1e803a0c84b06aec99dc3147dd7a919eee' }),
      new ROM({ name: '01040505.u84', merge: '01040505.u84', bios: 'au-qld7', size: 1048576, crc: 'cf5a9d1e', sha1: '0ebba478fc883831d70b0fa95f43e5f93b07ae9e' }),
      new ROM({ name: '01040505.u71', merge: '01040505.u71', bios: 'au-qld7', size: 1048576, crc: 'f56ea77e', sha1: '319be1bee66a289e2c1f6beec07758f79aa0cf16' }),
      new ROM({ name: '01040505.u83', merge: '01040505.u83', bios: 'au-qld7', size: 1048576, crc: '90f32169', sha1: '228be8b4a9eb6b2acf7f7a7561bd194009936026' }),
      new ROM({ name: '01040505.u70', merge: '01040505.u70', bios: 'au-qld7', size: 1048576, crc: 'b9ddea66', sha1: 'f4bfdeada39a3f0094d6468b7374a34f88f5df7f' }),
      new ROM({ name: '03030708_right.u83', merge: '03030708_right.u83', bios: 'au-sa1', size: 1048576, crc: 'b4b3c6a5', sha1: '5747f98a6eaa5c24a23d1d76a28b33a3bfbbfd1f' }),
      new ROM({ name: '03030708_left.u70', merge: '03030708_left.u70', bios: 'au-sa1', size: 1048576, crc: '4e5ad823', sha1: '77ab1c29c6172cfdcef776222a72b2b44114d4da' }),
      new ROM({ name: '14011913_right.u83', merge: '14011913_right.u83', bios: 'nz1', size: 2097152, crc: '01d13b89', sha1: 'b1013366d0803dfbec5a5f90f6a5cea862de0513' }),
      new ROM({ name: '14011913_left.u70', merge: '14011913_left.u70', bios: 'nz1', size: 2097152, crc: '9a4cefdf', sha1: '6c15bc565ede8af19361d60ee1e6657a8055c92c' }),
      new ROM({ name: '14010152_right.u83', merge: '14010152_right.u83', bios: 'nz2', size: 2097152, crc: '7e3f61f6', sha1: '1e27d72c35b0c633187159ef434f22398df28882' }),
      new ROM({ name: '14010152_left.u70', merge: '14010152_left.u70', bios: 'nz2', size: 2097152, crc: '2716e1ef', sha1: '81fe1ae4f9cd1bcb24795ce85913ee22ed0fabcd' }),
      new ROM({ name: '02061013_right.u83', merge: '02061013_right.u83', bios: 'nz3', size: 1048576, crc: '7a8619a5', sha1: 'bd03ddb68817c1660b009e102ccf69e5b603b875' }),
      new ROM({ name: '02061013_left.u70', merge: '02061013_left.u70', bios: 'nz3', size: 1048576, crc: 'e70a7007', sha1: '0935f924866162d9c0fbdbb99391cbf730a04b76' }),
      new ROM({ name: '02060913_right.u83', merge: '02060913_right.u83', bios: 'nz4', size: 1048576, crc: '31068c41', sha1: '962da0079495a64f7ffb34be643892c272017cc9' }),
      new ROM({ name: '02060913_left.u70', merge: '02060913_left.u70', bios: 'nz4', size: 1048576, crc: 'd6a6713c', sha1: '0f3bb2746f1a6fa6a587fd50827299408a3b28d2' }),
      new ROM({ name: '15011025_right.u83', merge: '15011025_right.u83', bios: 'my', size: 2097152, crc: 'bf21a975', sha1: 'a251b1a7342387300689cd50fe4ce7975b903ac5' }),
      new ROM({ name: '15011025_left.u70', merge: '15011025_left.u70', bios: 'my', size: 2097152, crc: 'c02e14b0', sha1: '6bf98927813519dfe60e582dbe5be3ccd87f7c91' }),
      new ROM({ name: '24010467_right.u83', merge: '24010467_right.u83', bios: 'afr', size: 2097152, crc: 'eddeff13', sha1: '77ccbcf40aeb7305eb13d6d24efafd09955f1eac' }),
      new ROM({ name: '24010467_left.u70', merge: '24010467_left.u70', bios: 'afr', size: 2097152, crc: '9093d820', sha1: '05bb14895e3077d277a1d0822036d08f359c0307' }),
      new ROM({ name: '01.04.11_right.u83', merge: '01.04.11_right.u83', bios: 'us1', size: 2097152, crc: '2dae8ca0', sha1: '7a0fb38b4c1ac7195d15bdab6f0cfb16c78430f0' }),
      new ROM({ name: '01.04.11_left.u70', merge: '01.04.11_left.u70', bios: 'us1', size: 2097152, crc: '787f2b07', sha1: '2548289e44f4b935346b759afb5383bdbac04c3e' }),
      new ROM({ name: '01.04.10_right.u83', merge: '01.04.10_right.u83', bios: 'us2', size: 2097152, crc: '82ce2fcc', sha1: '4c8fb3db084a67e99d1420b3f895a06ce9ef5ec2' }),
      new ROM({ name: '01.04.10_left.u70', merge: '01.04.10_left.u70', bios: 'us2', size: 2097152, crc: '9d9d52c1', sha1: 'b957220cdbedd516c219d1bfc28807ce466df93f' }),
      new ROM({ name: '01.04.08_right.u83', merge: '01.04.08_right.u83', bios: 'us3', size: 2097152, crc: '95333304', sha1: '7afe49d6c5e4d6820f349778557daa88c5366a51' }),
      new ROM({ name: '01.04.08_left.u70', merge: '01.04.08_left.u70', bios: 'us3', size: 2097152, crc: '0dfcad10', sha1: '53798be000304aed38909f5fd8470a68bedd8229' }),
      new ROM({ name: '01.04.07_right.u83', merge: '01.04.07_right.u83', bios: 'us4', size: 2097152, crc: '23c28e22', sha1: '98f24a1f86232b6c2c288a61ec7d60c867f192e5' }),
      new ROM({ name: '01.04.07_left.u70', merge: '01.04.07_left.u70', bios: 'us4', size: 2097152, crc: 'acfb0fe0', sha1: 'b1a772d7978e6ff4406a5bb39a71cb3f89608e72' }),
      new ROM({ name: '01.04.04_right.u83', merge: '01.04.04_right.u83', bios: 'us5', size: 2097152, crc: 'e57ba02d', sha1: '8e29403e6b619eeab41dc171221720bc7820ccdc' }),
      new ROM({ name: '01.04.04_left.u70', merge: '01.04.04_left.u70', bios: 'us5', size: 2097152, crc: 'b984a92c', sha1: '90f7a61302caee40195c08565bdac856a3234c1d' }),
      new ROM({ name: '01.03.17_right.u83', merge: '01.03.17_right.u83', bios: 'us6', size: 2097152, crc: '1582714b', sha1: '92d0a15314ffe526159bef9a364898dd1ebdfde7' }),
      new ROM({ name: '01.03.17_left.u70', merge: '01.03.17_left.u70', bios: 'us6', size: 2097152, crc: 'a88193dc', sha1: 'c9e1d483edaecd318d2e5fc8a54e84516c93e0ca' }),
      new ROM({ name: '01.03.14_right.u83', merge: '01.03.14_right.u83', bios: 'us7', size: 2097152, crc: '889ffd82', sha1: '9c98c9cdcf5f7d05095f11006418133029e9f0f8' }),
      new ROM({ name: '01.03.14_left.u70', merge: '01.03.14_left.u70', bios: 'us7', size: 2097152, crc: '7138fec4', sha1: 'f81331d1875ac574d3e6c98be218ff25c6c7be5a' }),
      new ROM({ name: '01.03.07_right.u83', merge: '01.03.07_right.u83', bios: 'us8', size: 2097152, crc: '2ebccc4e', sha1: '9342724e4451e9ab24ceae208284b50abd4f0be3' }),
      new ROM({ name: '01.03.07_left.u70', merge: '01.03.07_left.u70', bios: 'us8', size: 2097152, crc: 'a3632da4', sha1: '1c96a88e86095b81801ab88e36a4cdfa4b893265' }),
      new ROM({ name: '01.03.06_right.u83', merge: '01.03.06_right.u83', bios: 'us9', size: 2097152, crc: 'bd48ca55', sha1: '8fb1576cbeb1c64c358880714740195d2e73e03e' }),
      new ROM({ name: '01.03.06_left.u70', merge: '01.03.06_left.u70', bios: 'us9', size: 2097152, crc: '2f9d9a29', sha1: 'fdebfaca9a579d7249379f19aef22fbfd66bf943' }),
      new ROM({ name: '01.03.05_right.u83', merge: '01.03.05_right.u83', bios: 'us10', size: 2097152, crc: '2c7f1ec3', sha1: 'd03167f43ed6f9596080d91472695829378cef0a' }),
      new ROM({ name: '01.03.05_left.u70', merge: '01.03.05_left.u70', bios: 'us10', size: 2097152, crc: '0095e3f9', sha1: 'd2e8786158b1ab0a614aab21cf1d14cbc04754af' }),
      new ROM({ name: '01.03.03e_right.u83', merge: '01.03.03e_right.u83', bios: 'us11', size: 2097152, crc: '2255e263', sha1: '5e9e093aaa17172f47a14c3baf7f6f0f73b19398' }),
      new ROM({ name: '01.03.03e_left.u70', merge: '01.03.03e_left.u70', bios: 'us11', size: 2097152, crc: 'ea50729a', sha1: '14b5a71bfb91ac366ddcb5f77fb54127808f8163' }),
      new ROM({ name: '01.03.03a_right.u83', merge: '01.03.03a_right.u83', bios: 'us12', size: 2097152, crc: '253415f4', sha1: '50dc77ad87bc6be1932dda2fd4865602c8c49729' }),
      new ROM({ name: '01.03.03a_left.u70', merge: '01.03.03a_left.u70', bios: 'us12', size: 2097152, crc: '4ab5dd40', sha1: 'a6812cc624e6a98ea7b0697e2797fe10ba8e303e' }),
      new ROM({ name: '01.02.08_right.u2', merge: '01.02.08_right.u2', bios: 'us13', size: 1048576, crc: 'aaaeac8c', sha1: 'a565e5fcb4f55f31e7d36be40eec234248a66efd' }),
      new ROM({ name: '01.02.08_left.u3', merge: '01.02.08_left.u3', bios: 'us13', size: 1048576, crc: 'f29fd1bf', sha1: '33e043d2616e10a1c7a0936c3d208f9bcc2ca6f3' }),
      new ROM({ name: '06.03.04_right.u2', merge: '06.03.04_right.u2', bios: 'set-us1', size: 1048576, crc: '6f5f5ef1', sha1: '70a43fba4de47ed8dcf38b25eafd5873f3428e72' }),
      new ROM({ name: '06.03.04_left.u3', merge: '06.03.04_left.u3', bios: 'set-us1', size: 1048576, crc: '7034f26b', sha1: '7be78f23bec38d05240cdfe1186ec0c8291f5a1c' }),
      new ROM({ name: '06.03.03_right.u2', merge: '06.03.03_right.u2', bios: 'set-us2', size: 1048576, crc: '98763498', sha1: '246e95cc12eb34f946b2f4938c59217718f6d841' }),
      new ROM({ name: '06.03.03_left.u3', merge: '06.03.03_left.u3', bios: 'set-us2', size: 1048576, crc: 'a6924238', sha1: 'b71ab39bf9c1fdbab556028138749e8c040ec83c' }),
      new ROM({ name: '06.02.20_right.u83', merge: '06.02.20_right.u83', bios: 'set-us3', size: 1048576, crc: 'e4001f60', sha1: '5da34efb1ac0f7c84a48e09363d20cfecda4bcf1' }),
      new ROM({ name: '06.02.20_left.u70', merge: '06.02.20_left.u70', bios: 'set-us3', size: 1048576, crc: '199ed3b9', sha1: 'e3ee81ffd713f09e35a10c38e4f59282e2c5cd30' }),
      new ROM({ name: '06.02.04_right.u2', merge: '06.02.04_right.u2', bios: 'set-us4', size: 1048576, crc: '1cf5a853', sha1: '64d17efcce702df7a0b0e151293199478e25226d' }),
      new ROM({ name: '06.02.04_left.u3', merge: '06.02.04_left.u3', bios: 'set-us4', size: 1048576, crc: '117b75f2', sha1: '2129286853d3c50b8a943b71334d4ef6b98adc05' }),
      new ROM({ name: '30223811.u86', size: 4194304, crc: '735285e1', sha1: '964dd5ceeb6604620bc1293559d51b2abd9afd87' }),
      new ROM({ name: '30223811.u73', size: 4194304, crc: '8e34e360', sha1: '84c287973a61f4ca39b9c367a6b547d4e8210e4e' }),
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
    name: 'bbtime',
    description: 'Burger Time (Bandai)',
    rom: [
      new ROM({ name: 'hd38820a65', size: 4352, crc: '33611faf', sha1: '29b6a30ed543688d31ec2aa18f7938fa4eef30b0' }),
      new ROM({ name: 'bbtime.svg', size: 461598, crc: '297f30de', sha1: 'a5f38cd9c5d5ba9392c5d57ac85ecc2782b6ae7a', status: 'baddump' }),
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
    name: 'galaga',
    description: 'Galaga (Namco rev. B)',
    rom: [
      new ROM({ name: 'gg1_1b.3p', size: 4096, crc: 'ab036c9f', sha1: 'ca7f5da42d4e76fd89bb0b35198a23c01462fbfe' }),
      new ROM({ name: 'gg1_2b.3m', size: 4096, crc: 'd9232240', sha1: 'ab202aa259c3d332ef13dfb8fc8580ce2a5a253d' }),
      new ROM({ name: 'gg1_3.2m', size: 4096, crc: '753ce503', sha1: '481f443aea3ed3504ec2f3a6bfcf3cd47e2f8f81' }),
      new ROM({ name: 'gg1_4b.2l', size: 4096, crc: '499fcc76', sha1: 'ddb8b121903646c320939c7d13f4aa4ebb130378' }),
      new ROM({ name: 'gg1_5b.3f', size: 4096, crc: 'bb5caae3', sha1: 'e957a581463caac27bc37ca2e2a90f27e4f62b6f' }),
      new ROM({ name: 'gg1_7b.2c', size: 4096, crc: 'd016686b', sha1: '44c1a04fba3c7c826ff484185cb881b4b22e6657' }),
      new ROM({ name: 'gg1_9.4l', size: 4096, crc: '58b2f47c', sha1: '62f1279a784ab2f8218c4137c7accda00e6a3490' }),
      new ROM({ name: 'gg1_11.4d', size: 4096, crc: 'ad447c80', sha1: 'e697c180178cabd1d32483c5d8889a40633f7857' }),
      new ROM({ name: 'gg1_10.4f', size: 4096, crc: 'dd6f1afc', sha1: 'c340ed8c25e0979629a9a1730edc762bd72d0cff' }),
      new ROM({ name: 'prom-5.5n', size: 32, crc: '54603c6b', sha1: '1a6dea13b4af155d9cb5b999a75d4f1eb9c71346' }),
      new ROM({ name: 'prom-4.2n', size: 256, crc: '59b6edab', sha1: '0281de86c236c88739297ff712e0a4f5c8bf8ab9' }),
      new ROM({ name: 'prom-3.1c', size: 256, crc: '4a04bb6b', sha1: 'cdd4bc1013f5c11984fdc4fd10e2d2e27120c1e5' }),
      new ROM({ name: 'prom-1.1d', size: 256, crc: '7a2815b4', sha1: '085ada18c498fdb18ecedef0ea8fe9217edb7b46' }),
      new ROM({ name: 'prom-2.5c', size: 256, crc: '77245b66', sha1: '0c4d0bee858b97632411c440bea6948a74759746' }),
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
      new ROM({ name: '3200a.bin', size: 4096, crc: '3ef0b053', sha1: '0c04a362b737998c0952a753fb3fd8c8a17e9b46' }),
      new ROM({ name: '3300b.bin', size: 4096, crc: '1b280831', sha1: 'f7ea12e61929717ebe43a4198a97f109845a2c62' }),
      new ROM({ name: '3400c.bin', size: 4096, crc: '16233d33', sha1: 'a7eb799be5e23058754a92b15e6527bfbb47a354' }),
      new ROM({ name: '3500d.bin', size: 4096, crc: '0aaf5c23', sha1: '3f4b0bb960bf002261e9c1278c88f594c6aa8ab6' }),
      new ROM({ name: '3600fast.bin', size: 4096, crc: '23d586e5', sha1: '43346c69385e9091e64cff6c027ac2689cafcbb9' }),
      new ROM({ name: '3700g.bin', size: 4096, crc: 'b07f0aa4', sha1: '7528644a8480d0be2d0d37069515ed319e94778f' }),
      new ROM({ name: '2600j.bin', merge: 'gg1_9.4l', size: 4096, crc: '58b2f47c', sha1: '62f1279a784ab2f8218c4137c7accda00e6a3490' }),
      new ROM({ name: '2800l.bin', merge: 'gg1_11.4d', size: 4096, crc: 'ad447c80', sha1: 'e697c180178cabd1d32483c5d8889a40633f7857' }),
      new ROM({ name: '2700k.bin', merge: 'gg1_10.4f', size: 4096, crc: 'dd6f1afc', sha1: 'c340ed8c25e0979629a9a1730edc762bd72d0cff' }),
      new ROM({ name: 'prom-5.5n', merge: 'prom-5.5n', size: 32, crc: '54603c6b', sha1: '1a6dea13b4af155d9cb5b999a75d4f1eb9c71346' }),
      new ROM({ name: 'prom-4.2n', merge: 'prom-4.2n', size: 256, crc: '59b6edab', sha1: '0281de86c236c88739297ff712e0a4f5c8bf8ab9' }),
      new ROM({ name: 'prom-3.1c', merge: 'prom-3.1c', size: 256, crc: '4a04bb6b', sha1: 'cdd4bc1013f5c11984fdc4fd10e2d2e27120c1e5' }),
      new ROM({ name: 'prom-1.1d', merge: 'prom-1.1d', size: 256, crc: '7a2815b4', sha1: '085ada18c498fdb18ecedef0ea8fe9217edb7b46' }),
      new ROM({ name: 'prom-2.5c', merge: 'prom-2.5c', size: 256, crc: '77245b66', sha1: '0c4d0bee858b97632411c440bea6948a74759746' }),
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
      new ROM({ name: 'mk2-1', size: 4096, crc: '23cea1e2', sha1: '18db33ade0ca6e47cc48aa151d2ccbb4646e3ae3' }),
      new ROM({ name: 'mk2-2', size: 4096, crc: '89695b1a', sha1: 'fda5557018884e903f855bf3b69a25d75ed8a767' }),
      new ROM({ name: '3400c.bin', size: 4096, crc: '16233d33', sha1: 'a7eb799be5e23058754a92b15e6527bfbb47a354' }),
      new ROM({ name: 'mk2-4', size: 4096, crc: '24b767f5', sha1: 'd4c03e2ed582cfa7f8168ac352f790ef7af54cb8' }),
      new ROM({ name: 'gg1-5.3f', size: 4096, crc: '3102fccd', sha1: 'd29b68d6aab3217fa2106b3507b9273ff3f927bf' }),
      new ROM({ name: 'gg1-7b.2c', merge: 'gg1_7b.2c', size: 4096, crc: 'd016686b', sha1: '44c1a04fba3c7c826ff484185cb881b4b22e6657' }),
      new ROM({ name: 'gg1-9.4l', merge: 'gg1_9.4l', size: 4096, crc: '58b2f47c', sha1: '62f1279a784ab2f8218c4137c7accda00e6a3490' }),
      new ROM({ name: 'gg1-11.4d', merge: 'gg1_11.4d', size: 4096, crc: 'ad447c80', sha1: 'e697c180178cabd1d32483c5d8889a40633f7857' }),
      new ROM({ name: 'gg1-10.4f', merge: 'gg1_10.4f', size: 4096, crc: 'dd6f1afc', sha1: 'c340ed8c25e0979629a9a1730edc762bd72d0cff' }),
      new ROM({ name: 'prom-5.5n', merge: 'prom-5.5n', size: 32, crc: '54603c6b', sha1: '1a6dea13b4af155d9cb5b999a75d4f1eb9c71346' }),
      new ROM({ name: 'prom-4.2n', merge: 'prom-4.2n', size: 256, crc: '59b6edab', sha1: '0281de86c236c88739297ff712e0a4f5c8bf8ab9' }),
      new ROM({ name: 'prom-3.1c', merge: 'prom-3.1c', size: 256, crc: '4a04bb6b', sha1: 'cdd4bc1013f5c11984fdc4fd10e2d2e27120c1e5' }),
      new ROM({ name: 'prom-1.1d', merge: 'prom-1.1d', size: 256, crc: '7a2815b4', sha1: '085ada18c498fdb18ecedef0ea8fe9217edb7b46' }),
      new ROM({ name: 'prom-2.5c', merge: 'prom-2.5c', size: 256, crc: '77245b66', sha1: '0c4d0bee858b97632411c440bea6948a74759746' }),
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
  // ***** BIOSes *****
  new Machine({
    name: 'aristmk6',
    bios: 'yes',
    description: 'MK6 System Software/Setchips',
    rom: [
      new ROM({ name: '24013001_right.u83', bios: 'au-nsw1', size: 2097152, crc: 'e97afedf', sha1: '10ca3b015afaff5d7812f0f5207b2535602136a5' }),
      new ROM({ name: '24013001_left.u70', bios: 'au-nsw1', size: 2097152, crc: '06ae7e07', sha1: '39a45575b66906d73b519988d1001c99b05c5f34' }),
      new ROM({ name: '21012901_right.u83', bios: 'au-nsw2', size: 2097152, crc: '757618f2', sha1: '43f9a3e7d544979f8c6974945914d9e099b02abd' }),
      new ROM({ name: '21012901_left.u70', bios: 'au-nsw2', size: 2097152, crc: '0d271470', sha1: '5cd4b604bfe2fd7e9a8d08e1c7c97f17ae068479' }),
      new ROM({ name: '19012801_right.u83', bios: 'au-nsw3', size: 2097152, crc: '5b20a96c', sha1: '5fd916b7cc2cdd51bf7dd212c1114f94dc9c7926' }),
      new ROM({ name: '19012801_left.u70', bios: 'au-nsw3', size: 2097152, crc: 'b03bd17c', sha1: 'f281e80f6dda5b727ed71d2deebe3b0ff548773f' }),
      new ROM({ name: '13012001_right.u83', bios: 'au-nsw4', size: 2097152, crc: 'e627dbfa', sha1: '4fedbe0975ceb7dc0ebebf18a7708d78984db9b7' }),
      new ROM({ name: '13012001_left.u70', bios: 'au-nsw4', size: 2097152, crc: '38e8f659', sha1: '88c6acba99b0aca023c6f4d27c061c231490e9e0' }),
      new ROM({ name: '11011901_right.u83', bios: 'au-nsw5', size: 2097152, crc: '73dcb11c', sha1: '69ae4f32a0c9141b2a82ff3935b0cd20333d2964' }),
      new ROM({ name: '11011901_left.u70', bios: 'au-nsw5', size: 2097152, crc: 'd3dd2210', sha1: '3548f8cc39859d3f44a55f6bae48966a2d48e0eb' }),
      new ROM({ name: '11011501_right.u83', bios: 'au-nsw6', size: 2097152, crc: 'de4c3aed', sha1: '21596a2edd20eb7de7a4ec8900a270b09c8f326f' }),
      new ROM({ name: '11011501_left.u70', bios: 'au-nsw6', size: 2097152, crc: 'c5cc3461', sha1: '5b43c4cb6110a6ccf67cd0f3789253f6872b20c4' }),
      new ROM({ name: '09011001_right.u83', bios: 'au-nsw7', size: 2097152, crc: '8a853f80', sha1: '9a75498f7b02c81a483b4e1c158f35f0ee4c0112' }),
      new ROM({ name: '09011001_left.u70', bios: 'au-nsw7', size: 2097152, crc: '229c2e63', sha1: '91fd2b1acb69efe073647e93db9f11042add2feb' }),
      new ROM({ name: '07010801_right.u83', bios: 'au-nsw8', size: 2097152, crc: '8c148c11', sha1: '5ff3be18455b4f04675fec8d5b9d881295c65e23' }),
      new ROM({ name: '07010801_left.u70', bios: 'au-nsw8', size: 2097152, crc: '8e92af68', sha1: '00d2bb655b7964a9652896741210ec534df0b0d2' }),
      new ROM({ name: '05010601_right.u83', bios: 'au-nsw9', size: 1048576, crc: 'c12eac11', sha1: '683b9ddc323865ace7dca37d13b55de6e42759a5' }),
      new ROM({ name: '05010601_left.u70', bios: 'au-nsw9', size: 1048576, crc: 'b3e6b4a0', sha1: '3bf398c9257579f8e51ce716d6ebfa74fa510273' }),
      new ROM({ name: '04010501_right.u83', bios: 'au-nsw10', size: 1048576, crc: '3daefb7a', sha1: '411471713219f4bab5ccf5fe7a12a6c138c8c550' }),
      new ROM({ name: '04010501_left.u70', bios: 'au-nsw10', size: 1048576, crc: '21182775', sha1: '7c5b7f5aba3babc85f512a8f7d4ebc0d83eb842a' }),
      new ROM({ name: '03010301.u84', bios: 'au-nsw11', size: 1048576, crc: 'a34a9f16', sha1: 'b8750e6ceb1715da8e5ac2f0183254e29a042641' }),
      new ROM({ name: '03010301.u71', bios: 'au-nsw11', size: 1048576, crc: 'd793440a', sha1: 'dced4c04bde13293af77a9a1f4c5c606e3758de0' }),
      new ROM({ name: '03010301.u83', bios: 'au-nsw11', size: 1048576, crc: 'c8580554', sha1: '58b8bfff2f8d298c4e3be2b01900800c45fa7ad7' }),
      new ROM({ name: '03010301.u70', bios: 'au-nsw11', size: 1048576, crc: '5ae69121', sha1: '36dd3f9aaf5f7d2751d1954d67f898bc3ec71f3b' }),
      new ROM({ name: '02010201.u84', bios: 'au-nsw12', size: 1048576, crc: '0920930f', sha1: '771b0f62442d1c75b1bb59ad82365b7ab8747173' }),
      new ROM({ name: '02010201.u71', bios: 'au-nsw12', size: 1048576, crc: '24d5614a', sha1: 'fdcf3826dccc72b74b66379b1411cf211d5a1670' }),
      new ROM({ name: '02010201.u83', bios: 'au-nsw12', size: 1048576, crc: '5f64a20c', sha1: '397404ab6d2a1aa3c1fc77bb9421fef7079b65a5' }),
      new ROM({ name: '02010201.u70', bios: 'au-nsw12', size: 1048576, crc: '9b2db442', sha1: 'd512398a2d9257bd385dc50d61c63cd1a47300ba' }),
      new ROM({ name: '02010114.u84', bios: 'au-nsw13', size: 1048576, crc: '183e3836', sha1: '4c802d0cd010bc007acb3a83e37aaa29b2d13d87' }),
      new ROM({ name: '02010114.u71', bios: 'au-nsw13', size: 1048576, crc: '8f83c3dd', sha1: 'a5f9d80b4b515b24299d0241e1665cfd9da8bab7' }),
      new ROM({ name: '02010114.u83', bios: 'au-nsw13', size: 1048576, crc: '945104d7', sha1: 'e372d0cf889c72b5d001b26fe4a925a28486537f' }),
      new ROM({ name: '02010114.u70', bios: 'au-nsw13', size: 1048576, crc: '3ba4379f', sha1: '84367f12c4c9224d2ab9cae83ae8727de338408c' }),
      new ROM({ name: '25012805_right.u83', bios: 'au-qld1', size: 2097152, crc: '2ecd8da8', sha1: '389e9668b2ba4fffed5d2721b2ce70d502fb9f67' }),
      new ROM({ name: '25012805_left.u70', bios: 'au-qld1', size: 2097152, crc: '996f32ce', sha1: 'cf21bef745986fcbd298167453c7b8e5945ce602' }),
      new ROM({ name: '20012605_right.u83', bios: 'au-qld2', size: 2097152, crc: '045b82ad', sha1: 'b8e4f9f826970d83ae5fd2f2898de12ad1bf2d24' }),
      new ROM({ name: '20012605_left.u70', bios: 'au-qld2', size: 2097152, crc: '87331111', sha1: '6cdc2d81f68de23af18a975a6f27ddec246be405' }),
      new ROM({ name: '20012305_right.u83', bios: 'au-qld3', size: 2097152, crc: 'e436c1f5', sha1: '62ee529cc971fd76aa2ccc15778e3f0c40e3e47f' }),
      new ROM({ name: '20012305_left.u70', bios: 'au-qld3', size: 2097152, crc: 'ea8961cc', sha1: '0ebc7c3b94a6e01ee984af4711043130d9670bd3' }),
      new ROM({ name: '14011605_right.u83', bios: 'au-qld4', size: 2097152, crc: '2bec5b74', sha1: '854733cada75e632f01f7096d4740ed4941a3d5b' }),
      new ROM({ name: '14011605_left.u70', bios: 'au-qld4', size: 2097152, crc: 'cd26d4f0', sha1: '40822714abf08aeb08d827dbd8cd099f86803754' }),
      new ROM({ name: '04041205_right.u83', bios: 'au-qld5', size: 1048576, crc: 'ca6bc86c', sha1: '69fe7fc35694e4cd7f861bff4ec3a6165a81df6e' }),
      new ROM({ name: '04041205_left.u70', bios: 'au-qld5', size: 1048576, crc: 'dfb9a119', sha1: '814a5a7877392aec4e4871d7f0e19d2fbd717409' }),
      new ROM({ name: '03130334_right.u83', bios: 'au-qld6', size: 2097152, crc: 'bce3d97f', sha1: 'da36377cc1465022a2434703adee63bf48c71a9c' }),
      new ROM({ name: '03130334_left.u70', bios: 'au-qld6', size: 2097152, crc: '02175fde', sha1: '4e9a9e1e803a0c84b06aec99dc3147dd7a919eee' }),
      new ROM({ name: '01040505.u84', bios: 'au-qld7', size: 1048576, crc: 'cf5a9d1e', sha1: '0ebba478fc883831d70b0fa95f43e5f93b07ae9e' }),
      new ROM({ name: '01040505.u71', bios: 'au-qld7', size: 1048576, crc: 'f56ea77e', sha1: '319be1bee66a289e2c1f6beec07758f79aa0cf16' }),
      new ROM({ name: '01040505.u83', bios: 'au-qld7', size: 1048576, crc: '90f32169', sha1: '228be8b4a9eb6b2acf7f7a7561bd194009936026' }),
      new ROM({ name: '01040505.u70', bios: 'au-qld7', size: 1048576, crc: 'b9ddea66', sha1: 'f4bfdeada39a3f0094d6468b7374a34f88f5df7f' }),
      new ROM({ name: '03030708_right.u83', bios: 'au-sa1', size: 1048576, crc: 'b4b3c6a5', sha1: '5747f98a6eaa5c24a23d1d76a28b33a3bfbbfd1f' }),
      new ROM({ name: '03030708_left.u70', bios: 'au-sa1', size: 1048576, crc: '4e5ad823', sha1: '77ab1c29c6172cfdcef776222a72b2b44114d4da' }),
      new ROM({ name: '14011913_right.u83', bios: 'nz1', size: 2097152, crc: '01d13b89', sha1: 'b1013366d0803dfbec5a5f90f6a5cea862de0513' }),
      new ROM({ name: '14011913_left.u70', bios: 'nz1', size: 2097152, crc: '9a4cefdf', sha1: '6c15bc565ede8af19361d60ee1e6657a8055c92c' }),
      new ROM({ name: '14010152_right.u83', bios: 'nz2', size: 2097152, crc: '7e3f61f6', sha1: '1e27d72c35b0c633187159ef434f22398df28882' }),
      new ROM({ name: '14010152_left.u70', bios: 'nz2', size: 2097152, crc: '2716e1ef', sha1: '81fe1ae4f9cd1bcb24795ce85913ee22ed0fabcd' }),
      new ROM({ name: '02061013_right.u83', bios: 'nz3', size: 1048576, crc: '7a8619a5', sha1: 'bd03ddb68817c1660b009e102ccf69e5b603b875' }),
      new ROM({ name: '02061013_left.u70', bios: 'nz3', size: 1048576, crc: 'e70a7007', sha1: '0935f924866162d9c0fbdbb99391cbf730a04b76' }),
      new ROM({ name: '02060913_right.u83', bios: 'nz4', size: 1048576, crc: '31068c41', sha1: '962da0079495a64f7ffb34be643892c272017cc9' }),
      new ROM({ name: '02060913_left.u70', bios: 'nz4', size: 1048576, crc: 'd6a6713c', sha1: '0f3bb2746f1a6fa6a587fd50827299408a3b28d2' }),
      new ROM({ name: '15011025_right.u83', bios: 'my', size: 2097152, crc: 'bf21a975', sha1: 'a251b1a7342387300689cd50fe4ce7975b903ac5' }),
      new ROM({ name: '15011025_left.u70', bios: 'my', size: 2097152, crc: 'c02e14b0', sha1: '6bf98927813519dfe60e582dbe5be3ccd87f7c91' }),
      new ROM({ name: '24010467_right.u83', bios: 'afr', size: 2097152, crc: 'eddeff13', sha1: '77ccbcf40aeb7305eb13d6d24efafd09955f1eac' }),
      new ROM({ name: '24010467_left.u70', bios: 'afr', size: 2097152, crc: '9093d820', sha1: '05bb14895e3077d277a1d0822036d08f359c0307' }),
      new ROM({ name: '01.04.11_right.u83', bios: 'us1', size: 2097152, crc: '2dae8ca0', sha1: '7a0fb38b4c1ac7195d15bdab6f0cfb16c78430f0' }),
      new ROM({ name: '01.04.11_left.u70', bios: 'us1', size: 2097152, crc: '787f2b07', sha1: '2548289e44f4b935346b759afb5383bdbac04c3e' }),
      new ROM({ name: '01.04.10_right.u83', bios: 'us2', size: 2097152, crc: '82ce2fcc', sha1: '4c8fb3db084a67e99d1420b3f895a06ce9ef5ec2' }),
      new ROM({ name: '01.04.10_left.u70', bios: 'us2', size: 2097152, crc: '9d9d52c1', sha1: 'b957220cdbedd516c219d1bfc28807ce466df93f' }),
      new ROM({ name: '01.04.08_right.u83', bios: 'us3', size: 2097152, crc: '95333304', sha1: '7afe49d6c5e4d6820f349778557daa88c5366a51' }),
      new ROM({ name: '01.04.08_left.u70', bios: 'us3', size: 2097152, crc: '0dfcad10', sha1: '53798be000304aed38909f5fd8470a68bedd8229' }),
      new ROM({ name: '01.04.07_right.u83', bios: 'us4', size: 2097152, crc: '23c28e22', sha1: '98f24a1f86232b6c2c288a61ec7d60c867f192e5' }),
      new ROM({ name: '01.04.07_left.u70', bios: 'us4', size: 2097152, crc: 'acfb0fe0', sha1: 'b1a772d7978e6ff4406a5bb39a71cb3f89608e72' }),
      new ROM({ name: '01.04.04_right.u83', bios: 'us5', size: 2097152, crc: 'e57ba02d', sha1: '8e29403e6b619eeab41dc171221720bc7820ccdc' }),
      new ROM({ name: '01.04.04_left.u70', bios: 'us5', size: 2097152, crc: 'b984a92c', sha1: '90f7a61302caee40195c08565bdac856a3234c1d' }),
      new ROM({ name: '01.03.17_right.u83', bios: 'us6', size: 2097152, crc: '1582714b', sha1: '92d0a15314ffe526159bef9a364898dd1ebdfde7' }),
      new ROM({ name: '01.03.17_left.u70', bios: 'us6', size: 2097152, crc: 'a88193dc', sha1: 'c9e1d483edaecd318d2e5fc8a54e84516c93e0ca' }),
      new ROM({ name: '01.03.14_right.u83', bios: 'us7', size: 2097152, crc: '889ffd82', sha1: '9c98c9cdcf5f7d05095f11006418133029e9f0f8' }),
      new ROM({ name: '01.03.14_left.u70', bios: 'us7', size: 2097152, crc: '7138fec4', sha1: 'f81331d1875ac574d3e6c98be218ff25c6c7be5a' }),
      new ROM({ name: '01.03.07_right.u83', bios: 'us8', size: 2097152, crc: '2ebccc4e', sha1: '9342724e4451e9ab24ceae208284b50abd4f0be3' }),
      new ROM({ name: '01.03.07_left.u70', bios: 'us8', size: 2097152, crc: 'a3632da4', sha1: '1c96a88e86095b81801ab88e36a4cdfa4b893265' }),
      new ROM({ name: '01.03.06_right.u83', bios: 'us9', size: 2097152, crc: 'bd48ca55', sha1: '8fb1576cbeb1c64c358880714740195d2e73e03e' }),
      new ROM({ name: '01.03.06_left.u70', bios: 'us9', size: 2097152, crc: '2f9d9a29', sha1: 'fdebfaca9a579d7249379f19aef22fbfd66bf943' }),
      new ROM({ name: '01.03.05_right.u83', bios: 'us10', size: 2097152, crc: '2c7f1ec3', sha1: 'd03167f43ed6f9596080d91472695829378cef0a' }),
      new ROM({ name: '01.03.05_left.u70', bios: 'us10', size: 2097152, crc: '0095e3f9', sha1: 'd2e8786158b1ab0a614aab21cf1d14cbc04754af' }),
      new ROM({ name: '01.03.03e_right.u83', bios: 'us11', size: 2097152, crc: '2255e263', sha1: '5e9e093aaa17172f47a14c3baf7f6f0f73b19398' }),
      new ROM({ name: '01.03.03e_left.u70', bios: 'us11', size: 2097152, crc: 'ea50729a', sha1: '14b5a71bfb91ac366ddcb5f77fb54127808f8163' }),
      new ROM({ name: '01.03.03a_right.u83', bios: 'us12', size: 2097152, crc: '253415f4', sha1: '50dc77ad87bc6be1932dda2fd4865602c8c49729' }),
      new ROM({ name: '01.03.03a_left.u70', bios: 'us12', size: 2097152, crc: '4ab5dd40', sha1: 'a6812cc624e6a98ea7b0697e2797fe10ba8e303e' }),
      new ROM({ name: '01.02.08_right.u2', bios: 'us13', size: 1048576, crc: 'aaaeac8c', sha1: 'a565e5fcb4f55f31e7d36be40eec234248a66efd' }),
      new ROM({ name: '01.02.08_left.u3', bios: 'us13', size: 1048576, crc: 'f29fd1bf', sha1: '33e043d2616e10a1c7a0936c3d208f9bcc2ca6f3' }),
      new ROM({ name: '06.03.04_right.u2', bios: 'set-us1', size: 1048576, crc: '6f5f5ef1', sha1: '70a43fba4de47ed8dcf38b25eafd5873f3428e72' }),
      new ROM({ name: '06.03.04_left.u3', bios: 'set-us1', size: 1048576, crc: '7034f26b', sha1: '7be78f23bec38d05240cdfe1186ec0c8291f5a1c' }),
      new ROM({ name: '06.03.03_right.u2', bios: 'set-us2', size: 1048576, crc: '98763498', sha1: '246e95cc12eb34f946b2f4938c59217718f6d841' }),
      new ROM({ name: '06.03.03_left.u3', bios: 'set-us2', size: 1048576, crc: 'a6924238', sha1: 'b71ab39bf9c1fdbab556028138749e8c040ec83c' }),
      new ROM({ name: '06.02.20_right.u83', bios: 'set-us3', size: 1048576, crc: 'e4001f60', sha1: '5da34efb1ac0f7c84a48e09363d20cfecda4bcf1' }),
      new ROM({ name: '06.02.20_left.u70', bios: 'set-us3', size: 1048576, crc: '199ed3b9', sha1: 'e3ee81ffd713f09e35a10c38e4f59282e2c5cd30' }),
      new ROM({ name: '06.02.04_right.u2', bios: 'set-us4', size: 1048576, crc: '1cf5a853', sha1: '64d17efcce702df7a0b0e151293199478e25226d' }),
      new ROM({ name: '06.02.04_left.u3', bios: 'set-us4', size: 1048576, crc: '117b75f2', sha1: '2129286853d3c50b8a943b71334d4ef6b98adc05' }),
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
  new Machine({ name: '93c56_16', device: 'yes' }),
  new Machine({ name: 'discrete', device: 'yes' }),
  new Machine({ name: 'gfxdecode', device: 'yes' }),
  new Machine({ name: 'hd38820', device: 'yes' }),
  new Machine({ name: 'ls259', device: 'yes' }),
  new Machine({ name: 'mb8843', device: 'yes' }),
  new Machine({ name: 'mb8844', device: 'yes' }),
  new Machine({ name: 'namco', device: 'yes' }),
  new Machine({ name: 'namco_05xx_starfield', device: 'yes' }),
  new Machine({ name: 'namco06', device: 'yes' }),
  new Machine({
    name: 'namco51',
    device: 'yes',
    description: 'Namco 51xx',
    rom: new ROM({ name: '51xx.bin', size: 1024, crc: 'c2f57ef8', sha1: '50de79e0d6a76bda95ffb02fcce369a79e6abfec' }),
    deviceRef: new DeviceRef('mb8843'),
  }),
  new Machine({
    name: 'namco54',
    device: 'yes',
    description: 'Namco 54xx',
    rom: new ROM({ name: '54xx.bin', size: 1024, crc: 'ee7357e0', sha1: '01bdf984a49e8d0cc8761b2cc162fd6434d5afbe' }),
    deviceRef: new DeviceRef('mb8844'),
  }),
  new Machine({ name: 'ns16550', device: 'yes' }),
  new Machine({ name: 'palette', device: 'yes' }),
  new Machine({ name: 'pwm_display', device: 'yes' }),
  new Machine({ name: 'screen', device: 'yes' }),
  new Machine({ name: 'sh4le', device: 'yes' }),
  new Machine({ name: 'speaker', device: 'yes' }),
  new Machine({ name: 'speaker_sound_device', device: 'yes' }),
  new Machine({ name: 'watchdog', device: 'yes' }),
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

  const gameNamesToRomCount = result.getGames()
    .reduce((map, game) => {
      map.set(game.getName(), game.getRoms().length);
      return map;
    }, new Map<string, number>());

  // No change
  expect(gameNamesToRomCount.get('100lions')).toEqual(98);
  expect(gameNamesToRomCount.get('100lionsa')).toEqual(98);
  expect(gameNamesToRomCount.get('bbtime')).toEqual(2);
  // Includes device ROMs
  expect(gameNamesToRomCount.get('galaga')).toEqual(16);
  expect(gameNamesToRomCount.get('galagamf')).toEqual(16);
  expect(gameNamesToRomCount.get('galagamk')).toEqual(16);

  // No change to BIOS or devices
  expect(result.getGames().filter((game) => game.isBios())).toHaveLength(1);
  expect(result.getGames().filter((game) => game.isDevice())).toHaveLength(21);
  expect(gameNamesToRomCount.get('aristmk6')).toEqual(96);
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

  const gameNamesToRomCount = result.getGames()
    .reduce((map, game) => {
      map.set(game.getName(), game.getRoms().length);
      return map;
    }, new Map<string, number>());

  // No change
  expect(gameNamesToRomCount.get('100lions')).toEqual(2);
  expect(gameNamesToRomCount.get('100lionsa')).toEqual(2);
  expect(gameNamesToRomCount.get('bbtime')).toEqual(2);
  expect(gameNamesToRomCount.get('galaga')).toEqual(14);
  expect(gameNamesToRomCount.get('galagamf')).toEqual(14);
  expect(gameNamesToRomCount.get('galagamk')).toEqual(14);

  // No change to BIOS or devices
  expect(result.getGames().filter((game) => game.isBios())).toHaveLength(1);
  expect(result.getGames().filter((game) => game.isDevice())).toHaveLength(21);
  expect(gameNamesToRomCount.get('aristmk6')).toEqual(96);
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

  const gameNamesToRomCount = result.getGames()
    .reduce((map, game) => {
      map.set(game.getName(), game.getRoms().length);
      return map;
    }, new Map<string, number>());

  // No change
  expect(gameNamesToRomCount.get('bbtime')).toEqual(2);
  // Clones exclude parent ROMs
  expect(gameNamesToRomCount.get('100lions')).toEqual(2);
  expect(gameNamesToRomCount.get('100lionsa')).toEqual(2);
  expect(gameNamesToRomCount.get('galaga')).toEqual(14);
  expect(gameNamesToRomCount.get('galagamf')).toEqual(6);
  expect(gameNamesToRomCount.get('galagamk')).toEqual(5);

  // No change to BIOS or devices
  expect(result.getGames().filter((game) => game.isBios())).toHaveLength(1);
  expect(result.getGames().filter((game) => game.isDevice())).toHaveLength(21);
  expect(gameNamesToRomCount.get('aristmk6')).toEqual(96);
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

  const gameNamesToRomCount = result.getGames()
    .reduce((map, game) => {
      map.set(game.getName(), game.getRoms().length);
      return map;
    }, new Map<string, number>());

  // No change
  expect(gameNamesToRomCount.get('bbtime')).toEqual(2);
  // Clones are merged in
  expect(gameNamesToRomCount.get('100lions')).toEqual(4);
  expect(gameNamesToRomCount.get('galaga')).toEqual(24);

  // No change to BIOS or devices
  expect(result.getGames().filter((game) => game.isBios())).toHaveLength(1);
  expect(result.getGames().filter((game) => game.isDevice())).toHaveLength(21);
  expect(gameNamesToRomCount.get('aristmk6')).toEqual(96);
});
