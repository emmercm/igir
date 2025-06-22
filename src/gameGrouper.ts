export default {
  /**
   * Given an array of objects that contain {@link Game}s, and a function to fetch those
   * {@link Game}s' names, group those objects together with the disc numbers stripped.
   */
  groupMultiDiscGames<T>(values: T[], gameNameMapper: (value: T) => string): Map<string, T[]> {
    return values.reduce((map, value) => {
      const gameName = gameNameMapper(value);

      const gameNameStripped = gameName
        // HTGD SMBD
        .replace(/ ?\(Track [0-9]+\)/i, '')
        // Redump
        .replace(/ ?\(Dis[ck] [0-9]+\)/i, '')
        // TOSEC
        .replace(/ ?\(Dis[ck] [0-9]+ of [0-9]+\)/i, '');

      if (map.has(gameNameStripped)) {
        map.get(gameNameStripped)?.push(value);
      } else {
        map.set(gameNameStripped, [value]);
      }

      return map;
    }, new Map<string, T[]>());
  },
};
