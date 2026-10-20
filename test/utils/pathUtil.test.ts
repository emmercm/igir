import path from 'node:path';

import PathUtil from '../../src/utils/pathUtil.js';

describe('resolve', () => {
  test.each([
    [[]],
    [['file.rom']],
    [[path.join('dir', 'file.rom')]],
    [[path.join('dir', '..', 'file.rom')]],
    [[path.join('.', 'dir', '.', 'file.rom')]],
    [[`${path.join('dir', 'subdir')}${path.sep}`]],
    [['']],
    [['.']],
    [[path.join(process.cwd(), 'dir', '..', 'file.rom')]],
    [['dir', 'file.rom']],
    [['dir', '..', 'other', 'file.rom']],
    [[process.cwd(), 'dir', 'file.rom']],
    [['dir', path.join(process.cwd(), 'file.rom')]],
  ])('should resolve %j the same as path.resolve()', (paths) => {
    // eslint-disable-next-line local/no-path-resolve
    expect(PathUtil.resolve(...paths)).toEqual(path.resolve(...paths));
  });

  test.each([
    [[path.join(process.cwd(), 'dir', 'file.rom')]],
    [['dir', path.join(process.cwd(), 'file.rom')]],
  ])('should return an already-resolved last path %j unchanged', (paths) => {
    expect(PathUtil.resolve(...paths)).toEqual(paths.at(-1));
  });
});
