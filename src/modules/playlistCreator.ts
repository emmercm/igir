import path from 'node:path';

import async from 'async';

import ProgressBar, { ProgressBarSymbol } from '../console/progressBar.js';
import GameGrouper from '../gameGrouper.js';
import ArrayPoly from '../polyfill/arrayPoly.js';
import FsPoly from '../polyfill/fsPoly.js';
import DAT from '../types/dats/dat.js';
import Parent from '../types/dats/parent.js';
import File from '../types/files/file.js';
import Options from '../types/options.js';
import ReleaseCandidate from '../types/releaseCandidate.js';
import Module from './module.js';

/**
 * Create .m3u playlists for multi-disc {@link Game}s.
 */
export default class PlaylistCreator extends Module {
  private readonly options: Options;

  constructor(options: Options, progressBar: ProgressBar) {
    super(progressBar, PlaylistCreator.name);
    this.options = options;
  }

  /**
   * Creates playlists.
   */
  async create(dat: DAT, parentsToCandidates: Map<Parent, ReleaseCandidate[]>): Promise<string[]> {
    if (!this.options.shouldPlaylist()) {
      return [];
    }

    if (this.options.getPlaylistExtensions().length === 0) {
      // Should not happen, ArgumentsParser checks this
      return [];
    }

    this.progressBar.logTrace(`${dat.getName()}: writing playlists`);
    this.progressBar.setSymbol(ProgressBarSymbol.WRITING);
    this.progressBar.reset(parentsToCandidates.size);

    const writtenPlaylistPaths: string[] = [];

    let remainingCandidates: ReleaseCandidate[] = [...parentsToCandidates.values()].flat();

    // Write playlists for games that have multiple playlist-able files, i.e. from disc merging
    remainingCandidates = (
      await async.mapLimit(
        remainingCandidates,
        this.options.getWriterThreads(),
        async (candidate: ReleaseCandidate) => {
          const writtenFile = await this.maybeWritePlaylist(
            dat,
            candidate,
            candidate.getGame().getName(),
          );
          if (writtenFile === undefined) {
            // We didn't write a playlist file, keep this candidate for more processing
            return candidate;
          }
          writtenPlaylistPaths.push(writtenFile);
        },
      )
    ).filter((candidate) => candidate !== undefined);

    // Write playlists for games that could have been disc merged together but weren't
    const gameNamesToCandidates = GameGrouper.groupMultiDiscGames(
      remainingCandidates,
      (candidate) => candidate.getGame().getName(),
    );
    remainingCandidates = (
      await async.mapLimit(
        [...gameNamesToCandidates.entries()],
        this.options.getWriterThreads(),
        async ([gameName, candidates]: [string, ReleaseCandidate[]]) => {
          const writtenFile = await this.maybeWritePlaylist(dat, candidates, gameName);
          if (writtenFile === undefined) {
            // We didn't write a playlist file, keep this candidate for more processing
            return candidates;
          }
          writtenPlaylistPaths.push(writtenFile);
        },
      )
    )
      .flat()
      .filter((candidate) => candidate !== undefined);

    // TODO(cemmer): something with the remaining candidates?

    this.progressBar.logTrace(`${dat.getName()}: done writing playlists`);
    return writtenPlaylistPaths;
  }

  private async maybeWritePlaylist(
    dat: DAT,
    candidates: ReleaseCandidate | ReleaseCandidate[],
    playlistBasename: string,
  ): Promise<string | undefined> {
    const playlistFiles = (Array.isArray(candidates) ? candidates : [candidates])
      .flatMap((candidate) => candidate.getRomsWithFiles())
      .flatMap((romWithFiles) =>
        this.options.shouldWrite() ? romWithFiles.getOutputFile() : romWithFiles.getInputFile(),
      )
      .filter((outputFile) =>
        this.options
          .getPlaylistExtensions()
          .some((ext) => outputFile.getFilePath().toLowerCase().endsWith(ext.toLowerCase())),
      )
      .filter(ArrayPoly.filterUniqueMapped((file) => file.getFilePath()));
    if (playlistFiles.length < 2) {
      // We shouldn't make a playlist for this game, keep it for more processing
      return undefined;
    }

    this.progressBar.incrementProgress();

    const commonDirectory = PlaylistCreator.getCommonDirectory(playlistFiles);
    const playlistLines =
      playlistFiles
        .map((file) =>
          file
            .getFilePath()
            .slice(commonDirectory.length)
            .replace(/^[\\/]/, '')
            .replace(/[\\/]/g, '/'),
        )
        .sort()
        .join('\n') + '\n';

    if (!(await FsPoly.exists(commonDirectory))) {
      await FsPoly.mkdir(commonDirectory, { recursive: true });
    }
    const playlistLocation = path.join(commonDirectory, playlistBasename + '.m3u');
    this.progressBar.logInfo(`${dat.getName()}: creating playlist '${playlistLocation}'`);
    await FsPoly.writeFile(playlistLocation, playlistLines);
    return playlistLocation;
  }

  private static getCommonDirectory(files: File[]): string {
    const fileDirsSplit = files.map((file) => path.dirname(file.getFilePath()).split(/[\\/]/));

    const maxDepth = fileDirsSplit.reduce((max, file) => Math.max(max, file.length), 0);
    let lastCommonDir = '';
    let depth = 0;
    while (depth <= maxDepth) {
      const fileSubPaths = fileDirsSplit.map((split) => split.slice(0, depth).join(path.sep));
      if (new Set(fileSubPaths).size > 1) {
        break;
      }
      lastCommonDir = fileSubPaths[0];
      depth += 1;
    }
    return lastCommonDir;
  }
}
