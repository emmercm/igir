export default {
  fromUtcSeconds(seconds: number): Date {
    const localDate = new Date(seconds * 1000);
    return new Date(
      Date.UTC(
        localDate.getFullYear(),
        localDate.getMonth(),
        localDate.getDate(),
        localDate.getHours(),
        localDate.getMinutes(),
        localDate.getSeconds(),
      ),
    );
  },
};
