import child_process from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';

import IgirException from '../../src/exceptions/igirException.js';

/**
 * Whether this process holds any handle or descriptor open on the existing file at
 * {@link filePath}. On Windows, the check also sees other processes' handles.
 * @returns true if the file is open
 */
export default async function isFileOpen(filePath: string): Promise<boolean> {
  if (process.platform === 'win32') {
    // Opening with no sharing at all fails while any other handle to the file is open, whatever
    // that handle shares. 0x10000000 is libuv's UV_FS_O_EXLOCK, which Node passes through to
    // uv_fs_open() on Windows but doesn't export in fs.constants there.
    let handle: fs.promises.FileHandle;
    try {
      handle = await fs.promises.open(filePath, fs.constants.O_RDONLY | 0x10_00_00_00);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'EBUSY') {
        return true;
      }
      throw error;
    }
    await handle.close();
    return false;
  }

  // Descriptors are listed by the file's real path, with every symbolic link resolved
  const realPath = await fs.promises.realpath(filePath);

  if (process.platform === 'linux') {
    // Each of this process's descriptors is a link to the file it has open
    const descriptorDirectory = path.join('/proc', 'self', 'fd');
    const descriptors = await fs.promises.readdir(descriptorDirectory);
    const targets = await Promise.all(
      descriptors.map(async (descriptor) => {
        try {
          return await fs.promises.readlink(path.join(descriptorDirectory, descriptor));
        } catch {
          // The descriptor that listed the directory is closed by the time it's read
          return undefined;
        }
      }),
    );
    return targets.includes(realPath);
  }

  if (process.platform === 'darwin') {
    // macOS has no /proc, so lsof lists this process's descriptors instead. -n and -P skip
    // resolving the hosts and ports of any sockets, since only file names are compared.
    const { stdout } = await util.promisify(child_process.execFile)(
      'lsof',
      ['-a', '-n', '-P', '-p', String(process.pid), '-F', 'n'],
      { maxBuffer: 64 * 1024 * 1024 },
    );
    // Each name field is its own line, prefixed with "n"
    return stdout.split('\n').includes(`n${realPath}`);
  }

  throw new IgirException(`can't list open files on ${process.platform}`);
}
