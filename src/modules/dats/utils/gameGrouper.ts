export default {
  getMultiTrackDiscCommonName: (romName: string): string =>
    romName
      // Redump CD-ROM
      .replace(/ ?\(Track [0-9]+\)/i, '')
      // TOSEC CD-ROM
      .replace(/ ?\(Track [0-9]+ of [0-9]+\)/i, ''),

  getMultiDiscCommonName(gameName: string): string {
    return (
      this.getMultiTrackDiscCommonName(gameName)
        // Redump
        .replace(/ ?\(Dis[ck] [0-9]+\)/i, '')
        // TOSEC
        .replace(/ ?\(Dis[ck] [0-9]+ of [0-9]+\)/i, '')
    );
  },

  /**
   * Given an array of objects that contain {@link Game}s, and a function to fetch those
   * {@link Game}s' names, group those objects together with the disc numbers stripped.
   */
  groupMultiDiscGames<T>(values: T[], gameNameMapper: (value: T) => string): Map<string, T[]> {
    return Map.groupBy(values, (value) => this.getMultiDiscCommonName(gameNameMapper(value)));
  },
};
