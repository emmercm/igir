import { PassThrough } from 'node:stream';

import stripAnsi from 'strip-ansi';

import Logger from '../../src/console/logger.js';
import { LogLevel } from '../../src/console/logLevel.js';
import MultiBar from '../../src/console/multiBar.js';
import { ProgressBarSymbol } from '../../src/console/progressBar.js';
import SingleBar from '../../src/console/singleBar.js';

const WRITABLE = new PassThrough();
const MULTIBAR = MultiBar.create({
  writable: WRITABLE,
});
const LOGGER = new Logger(LogLevel.ALWAYS, WRITABLE);

test('addChildBar', () => {
  const singleBar = new SingleBar(MULTIBAR, LOGGER);
  const childBar = singleBar.addChildBar();
  expect(childBar).toBeDefined();
});

describe('setSymbol', () => {
  test.each(Object.keys(ProgressBarSymbol))('should get after set: %s', (symbolKey) => {
    const singleBar = new SingleBar(MULTIBAR, LOGGER);
    const symbol = ProgressBarSymbol[symbolKey];
    singleBar.setSymbol(symbol);
    expect(singleBar.getSymbol()).toEqual(symbol);
  });
});

describe('setName', () => {
  test.each(['', 'test', 'test test'])('should get after set: %s', (name) => {
    const singleBar = new SingleBar(MULTIBAR, LOGGER);
    singleBar.setName(name);
    expect(singleBar.getName()).toEqual(name);
  });
});

test('resetProgress', () => {
  const singleBar = new SingleBar(MULTIBAR, LOGGER, { name: 'test', showProgressNewline: false });
  singleBar.incrementCompleted();
  singleBar.incrementInProgress();
  singleBar.incrementTotal();
  expect(stripAnsi(singleBar.format()).endsWith(' 1/1 [00:00:00] test')).toEqual(true);
  singleBar.resetProgress(10);
  expect(stripAnsi(singleBar.format()).endsWith(' 0/10 test')).toEqual(true);
});

describe('incrementCompleted', () => {
  test('should increment one by default', () => {
    const singleBar = new SingleBar(MULTIBAR, LOGGER, { name: 'test', showProgressNewline: false });
    singleBar.incrementCompleted();
    expect(stripAnsi(singleBar.format()).endsWith(' 1/0 [00:00:00] test')).toEqual(true);
  });

  test('should increment multiple', () => {
    const singleBar = new SingleBar(MULTIBAR, LOGGER, { name: 'test', showProgressNewline: false });
    singleBar.incrementCompleted(2);
    expect(stripAnsi(singleBar.format()).endsWith(' 2/0 [00:00:00] test')).toEqual(true);
  });
});

test('setCompleted', () => {
  const singleBar = new SingleBar(MULTIBAR, LOGGER, { name: 'test', showProgressNewline: false });
  singleBar.setCompleted(3);
  expect(stripAnsi(singleBar.format()).endsWith(' 3/0 [00:00:00] test')).toEqual(true);
});

describe('incrementInProgress', () => {
  test('should increment one by default', () => {
    const singleBar = new SingleBar(MULTIBAR, LOGGER, { name: 'test', showProgressNewline: false });
    singleBar.incrementInProgress();
    expect(stripAnsi(singleBar.format()).endsWith(' 0/0 test')).toEqual(true);
  });

  test('should increment multiple', () => {
    const singleBar = new SingleBar(MULTIBAR, LOGGER, { name: 'test', showProgressNewline: false });
    singleBar.incrementInProgress(2);
    expect(stripAnsi(singleBar.format()).endsWith(' 0/0 test')).toEqual(true);
  });
});

test('setInProgress', () => {
  const singleBar = new SingleBar(MULTIBAR, LOGGER, { name: 'test', showProgressNewline: false });
  singleBar.incrementInProgress(3);
  expect(stripAnsi(singleBar.format()).endsWith(' 0/0 test')).toEqual(true);
});

describe('incrementTotal', () => {
  test('should increment one by default', () => {
    const singleBar = new SingleBar(MULTIBAR, LOGGER, { name: 'test', showProgressNewline: false });
    singleBar.incrementTotal();
    expect(stripAnsi(singleBar.format()).endsWith(' 0/1 test')).toEqual(true);
  });

  test('should increment multiple', () => {
    const singleBar = new SingleBar(MULTIBAR, LOGGER, { name: 'test', showProgressNewline: false });
    singleBar.incrementTotal(2);
    expect(stripAnsi(singleBar.format()).endsWith(' 0/2 test')).toEqual(true);
  });
});

test('setTotal', () => {
  const singleBar = new SingleBar(MULTIBAR, LOGGER, { name: 'test', showProgressNewline: false });
  singleBar.setTotal(3);
  expect(stripAnsi(singleBar.format()).endsWith(' 0/3 test')).toEqual(true);
});

describe('finish', () => {
  test('should make completed equal total', () => {
    const singleBar = new SingleBar(MULTIBAR, LOGGER, { name: 'test', showProgressNewline: false });
    singleBar.setTotal(10);
    singleBar.incrementInProgress();
    expect(stripAnsi(singleBar.format()).endsWith(' 0/10 test')).toEqual(true);
    singleBar.finish();
    expect(stripAnsi(singleBar.format()).endsWith(' 10/10 [00:00:00] test')).toEqual(true);
  });

  test('should make completed one when no total', () => {
    const singleBar = new SingleBar(MULTIBAR, LOGGER, { name: 'test', showProgressNewline: false });
    expect(stripAnsi(singleBar.format()).endsWith(' 0/0 test')).toEqual(true);
    singleBar.finish();
    expect(stripAnsi(singleBar.format()).endsWith(' 1/0 [00:00:00] test')).toEqual(true);
  });

  test('should set a finished message', () => {
    const singleBar = new SingleBar(MULTIBAR, LOGGER, { name: 'test', showProgressNewline: false });
    singleBar.setTotal(10);
    singleBar.finish('finished');
    expect(stripAnsi(singleBar.format())).toEqual('test » finished');
  });
});
