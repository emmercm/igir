import CP437Encoder from '../src/cp437Encoder.js';

describe('canEncode', () => {
  test.each(['café', '☺☻', '♦♣♠♥', 'crème brûlée'])(
    'should return true: %s',
    (input: string) => {
      expect(CP437Encoder.canEncode(input)).toEqual(true);
    },
  );

  test.each(['你好', '🌸✨🦊', 'みんな'])('should return false: %s', (input: string) => {
    expect(CP437Encoder.canEncode(input)).toEqual(false);
  });
});

describe('encode', () => {
  // TODO(cemmer): test
});
