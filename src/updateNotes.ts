/**
 * The download size the update strip shows.
 *
 * Its own file rather than sitting inside UpdateModal, because it is a pure
 * number function with a real edge case, and reaching it from a test through
 * the component meant mocking AsyncStorage, the gesture handler's native module
 * and Reanimated.
 */

/**
 * "47.6 MB", or empty when the size is unknown so the caller renders nothing.
 *
 * One decimal below 100 MB and none above it: the tenth of a megabyte matters
 * when you are deciding whether to spend mobile data on 47.6, and is noise at
 * 470.
 */
export function formatSize(bytes?: number): string {
  if (!bytes || bytes <= 0) {
    return '';
  }
  const mb = bytes / (1024 * 1024);
  return mb >= 100 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
}
