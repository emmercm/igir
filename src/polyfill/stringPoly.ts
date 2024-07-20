export default {
  replaceInsensitive(input: string, searchValue: string, replaceValue: string): string {
    // https://stackoverflow.com/a/21257041
    const idx = input.toLowerCase().indexOf(searchValue.toLowerCase());
    return idx === -1
      ? input
      : input.substring(0, idx) + replaceValue + input.substring(idx + searchValue.length);
  },
};
