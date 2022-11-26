import ClrMamePro from '../../../src/types/logiqx/clrMamePro.js';

it('should have expected defaults', () => {
  const clrMamePro = new ClrMamePro();
  expect(clrMamePro.getHeader()).toEqual('');
});
