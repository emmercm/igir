export default {
  hrtimeMillis(timeMillis?: number): number {
    const hrtime = timeMillis !== undefined
      ? [
        // ms -> s
        Math.floor(timeMillis / 1000),
        // ms -> ns
        (timeMillis - Math.floor(timeMillis / 1000) * 1000) * 1_000_000,
      ] satisfies [number, number] : undefined;

    const [sec, nano] = process.hrtime(hrtime);
    return sec * 1000 + Math.floor(nano / 1_000_000);
  },
};
