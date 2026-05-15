import path from 'node:path';

import async from 'async';

import type ProgressBar from '../console/progressBar.js';
import { ProgressBarSymbol } from '../console/progressBar.js';
import type DAT from '../models/dats/dat.js';
import type File from '../models/files/file.js';
import type Options from '../models/options.js';
import { PlaylistMode } from '../models/options.js';
import type WriteCandidate from '../models/writeCandidate.js';
import ArrayUtil from '../utils/arrayUtil.js';
import FsUtil from '../utils/fsUtil.js';
import GameGrouper from './dats/utils/gameGrouper.js';
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
  async write(dat: DAT, candidates: WriteCandidate[]): Promise<string[]> {
    if (!this.options.shouldPlaylist()) {
      return [];
    }

    if (candidates.length === 0) {
      this.progressBar.logTrace(`${dat.getName()}: no candidates to create playlists for`);
      return [];
    }

    this.progressBar.logTrace(`${dat.getName()}: writing playlists`);
    this.progressBar.setSymbol(ProgressBarSymbol.WRITING);
    this.progressBar.resetProgress(candidates.length);

    const writtenPlaylistPaths: string[] = [];

    let remainingCandidates: WriteCandidate[] = candidates;

    // Write playlists for games that have playlist-able files, i.e. from disc merging
    remainingCandidates = (
      await async.mapLimit(
        remainingCandidates,
        this.options.getWriterThreads(),
        async (candidate: WriteCandidate) => {
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
        async ([gameName, candidates]: [string, WriteCandidate[]]) => {
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
    candidates: WriteCandidate | WriteCandidate[],
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
      .filter(ArrayUtil.filterUniqueMapped((file) => file.getFilePath()));
    if (playlistFiles.length === 0) {
      return undefined;
    }
    if (this.options.getPlaylistMode() === PlaylistMode.MULTIPLE && playlistFiles.length < 2) {
      // We shouldn't make a playlist for this game, keep it for more processing
      return undefined;
    }

    this.progressBar.incrementInProgress();

    const commonDirectory = PlaylistCreator.getCommonDirectory(playlistFiles);
    const playlistLines = `${playlistFiles
      .map((file) =>
        file
          .getFilePath()
          .slice(commonDirectory.length)
          .replace(/^[\\/]/, '')
          .replaceAll('\\', '/'),
      )
      .toSorted()
      .join('\n')}\n`;

    if (!(await FsUtil.exists(commonDirectory))) {
      await FsUtil.mkdir(commonDirectory, { recursive: true });
    }
    const playlistLocation = path.join(commonDirectory, `${playlistBasename}.m3u`);
    this.progressBar.logInfo(`${dat.getName()}: creating playlist '${playlistLocation}'`);
    await FsUtil.writeFile(playlistLocation, playlistLines);
    return playlistLocation;
  }

  private static getCommonDirectory(files: File[]): string {
    if (files.length === 1) {
      return path.dirname(files[0].getFilePath());
    }

    const fileDirsSplit = files.map((file) => path.dirname(file.getFilePath()).split(path.sep));

    const maxDepth = fileDirsSplit.reduce((max, file) => Math.max(max, file.length), 0);
    let lastCommonDir = '';
    let depth = 0;
    while (depth <= maxDepth) {
      const fileSubPaths = fileDirsSplit.map((split) => split.slice(0, depth).join(path.sep));
      if (fileSubPaths.some((p) => p !== fileSubPaths[0])) {
        break;
      }
      lastCommonDir = fileSubPaths[0];
      depth += 1;
    }
    return lastCommonDir;
  }
}
