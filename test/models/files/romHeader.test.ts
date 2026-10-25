import ROMHeader from '../../../src/models/files/romHeader.js';

describe('getDataOffsetBytes', () => {
  it('should return the data offset', () => {
    expect(new ROMHeader(16, '.nes').getDataOffsetBytes()).toEqual(16);
  });
});

describe('getHeaderlessFileExtension', () => {
  it('should return the headerless extension', () => {
    expect(new ROMHeader(512, '.sfc').getHeaderlessFileExtension()).toEqual('.sfc');
  });
});
