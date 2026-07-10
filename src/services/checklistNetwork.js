export function isNavigatorOnline() {
  return typeof navigator === "undefined" ? true : navigator.onLine !== false;
}
