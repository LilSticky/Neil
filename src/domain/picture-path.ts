/**
 * A picture path the tracker serves: under /static/, of a picture extension, and no `..` (dots are not allowed in the
 * directory part, so no `..` can match). Shared by the Game API schemas and the card rendering.
 */
export const PICTURE_PATH_PATTERN = /^\/static\/[A-Za-z0-9_\-/]+\.(png|jpe?g|webp|gif)$/;
