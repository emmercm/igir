import ClrMamePro from '../../../../src/types/dats/logiqx/clrMamePro.js';

it('should have expected defaults', () => {
  const clrMamePro = new ClrMamePro();
  expect(clrMamePro.getHeader()).toEqual('');
});
