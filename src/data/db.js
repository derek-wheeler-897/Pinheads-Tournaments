export const DB = {
  get(key, fallback) {
    const value = localStorage.getItem(key);

    if (!value) return fallback;

    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  },

  set(key, value) {
    localStorage.setItem(
      key,
      JSON.stringify(value)
    );
  },
};