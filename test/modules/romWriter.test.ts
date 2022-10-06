import { jest } from '@jest/globals';
import fs, { Stats } from 'fs';

import Constants from '../../src/constants.js';
import fsPoly from '../../src/polyfill/fsPoly.js';

jest.setTimeout(10_000);

async function copyFixturesToTemp(
  callback: (input: string, output: string) => void | Promise<void>,
  copyFixtures = true,
): Promise<void> {
  // Set up the input directory
  const inputTemp = fsPoly.mkdtempSync(Constants.GLOBAL_TEMP_DIR);
  if (copyFixtures) {
    fsPoly.copyDirSync('./test/fixtures/roms', inputTemp);
  }

  // Set up the output directory, but delete it so ROMWriter can make it
  const outputTemp = fsPoly.mkdtempSync(Constants.GLOBAL_TEMP_DIR);
  fsPoly.rmSync(outputTemp, { force: true, recursive: true });

  // Call the callback
  await callback(inputTemp, outputTemp);

  // Delete the temp files
  fsPoly.rmSync(inputTemp, { recursive: true });
  fsPoly.rmSync(outputTemp, { force: true, recursive: true });
}

function walkAndStat(dirPath: string): [string, Stats][] {
  return fsPoly.walkSync(dirPath).map((filePath) => [filePath, fs.statSync(filePath)]);
}

it('should not do anything if there are no parents', () => {});

it('should not do anything with no write commands', () => {});

describe('zip', () => {
  it('should not write anything if input matches output', () => {});

  it('should not write anything if the output exists and not overwriting', () => {});

  it('should write if the output exists and are overwriting', () => {});

  test.each([])('should copy, zip, and test: %s', () => {});

  test.each([])('should move, zip, and test: %s', () => {});
});

describe('raw', () => {
  it('should not write anything if input matches output', () => {});

  it('should not write anything if the output exists and not overwriting', () => {});

  it('should write if the output exists and are overwriting', () => {});

  test.each([])('should copy, zip, and test: %s', () => {});

  test.each([])('should move, zip, and test: %s', () => {});
});
