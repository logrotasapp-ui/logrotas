const isDev =
  typeof import.meta !== "undefined" &&
  import.meta.env &&
  import.meta.env.DEV;

export const devLog = (...args) => {
  if (isDev) console.log(...args);
};

export const devInfo = (...args) => {
  if (isDev) console.info(...args);
};

export const devDebug = (...args) => {
  if (isDev) console.debug(...args);
};
