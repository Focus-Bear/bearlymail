/** HTTP header names set or exposed by hand (outside Nest's decorators). */
export const HTTP_HEADERS = {
  CONTENT_TYPE: "Content-Type",
  CONTENT_DISPOSITION: "Content-Disposition",
  CONTENT_LENGTH: "Content-Length",
  WWW_AUTHENTICATE: "WWW-Authenticate",
  CACHE_CONTROL: "Cache-Control",
  PRAGMA: "Pragma",
  ACCEPT: "Accept",
} as const;
