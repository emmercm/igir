import CandidateWriterSemaphore from '../../src/async/candidateWriterSemaphore.js';
import Game from '../../src/models/dats/game.js';
import ROM from '../../src/models/dats/rom.js';
import File from '../../src/models/files/file.js';
import ROMWithFiles from '../../src/models/romWithFiles.js';
import WriteCandidate from '../../src/models/writeCandidate.js';

async function buildCandidate(
  gameName: string,
  outputFilePaths: string[],
): Promise<WriteCandidate> {
  const romsWithFiles = await Promise.all(
    outputFilePaths.map(async (outputFilePath) => {
      const file = await File.fileOf({ filePath: outputFilePath, size: 0, crc32: '00000000' });
      return new ROMWithFiles(new ROM({ name: outputFilePath, size: 0 }), file, file);
    }),
  );
  return new WriteCandidate(new Game({ name: gameName }), romsWithFiles);
}

describe('mapCandidates', () => {
  it('should return mapped results, preferring candidates with fewer files', async () => {
    const candidates = [
      await buildCandidate('two', ['two (1).rom', 'two (2).rom']),
      await buildCandidate('one b', ['one b.rom']),
      await buildCandidate('one a', ['one a.rom']),
    ];

    const result = await new CandidateWriterSemaphore(1).mapCandidates(candidates, (candidate) =>
      candidate.getName(),
    );

    expect(result).toEqual(['one a', 'one b', 'two']);
  });

  it('should not exceed the max number of threads', async () => {
    const candidates = await Promise.all(
      Array.from(
        { length: 10 },
        async (_, idx) => await buildCandidate(`game ${idx}`, [`game ${idx}.rom`]),
      ),
    );
    const semaphore = new CandidateWriterSemaphore(2);
    let maxOpenLocks = 0;

    await semaphore.mapCandidates(candidates, async () => {
      maxOpenLocks = Math.max(maxOpenLocks, semaphore.openLocks());
      await new Promise((resolve) => {
        setTimeout(resolve, 1);
      });
    });

    expect(maxOpenLocks).toEqual(2);
  });

  it('should share threads with runExclusive', async () => {
    const candidates = await Promise.all(
      Array.from(
        { length: 5 },
        async (_, idx) => await buildCandidate(`game ${idx}`, [`game ${idx}.rom`]),
      ),
    );
    const semaphore = new CandidateWriterSemaphore(2);
    let maxOpenLocks = 0;
    const trackOpenLocks = async (): Promise<void> => {
      maxOpenLocks = Math.max(maxOpenLocks, semaphore.openLocks());
      await new Promise((resolve) => {
        setTimeout(resolve, 1);
      });
    };

    await Promise.all([
      semaphore.mapCandidates(candidates, trackOpenLocks),
      semaphore.runExclusive(trackOpenLocks),
      semaphore.runExclusive(trackOpenLocks),
    ]);

    expect(maxOpenLocks).toEqual(2);
  });

  it('should not write candidates with the same output path concurrently', async () => {
    const candidates = [
      await buildCandidate('game a', ['shared.rom']),
      await buildCandidate('game b', ['shared.rom']),
    ];
    let running = 0;
    let maxRunning = 0;

    await new CandidateWriterSemaphore(2).mapCandidates(candidates, async () => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((resolve) => {
        setTimeout(resolve, 1);
      });
      running -= 1;
    });

    expect(maxRunning).toEqual(1);
  });

  it('should handle thrown errors', async () => {
    await expect(
      new CandidateWriterSemaphore(1).mapCandidates(
        [await buildCandidate('game', ['game.rom'])],
        () => {
          throw new Error('error');
        },
      ),
    ).rejects.toThrow('error');
  });
});
