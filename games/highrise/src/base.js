// =====================================================================
// HIGHRISE :: base.js - WHERE THIS GAME IS MOUNTED
// =====================================================================
//
// HIGHRISE used to ask the web ROOT for everything: `/src/main.js`,
// `/assets/ref/...`, `/edits.json`. That is fine when it has a server to
// itself, which it has had for its whole life - and it is why putting it
// on PLAYPILE originally meant giving it its own subdomain, because at
// `playpile.net/highrise/` every one of those requests would go looking
// one directory too high and 404.
//
// This is the fix, and it needs no configuration anywhere: `import.meta.url`
// is the full URL of THIS module, so one level up from it is the folder
// the game is installed in, wherever that turns out to be. Served from
// its own root it resolves to the root; served from a subdirectory it
// resolves to the subdirectory; opened from a file:// path it resolves to
// that. Nothing has to be told where it is.
export const ROOT = new URL('../', import.meta.url).href;

/**
 * A path inside the game, as a URL that works from wherever it is served.
 *
 * Leading slashes are stripped so the old root-absolute strings can be
 * passed in unchanged and still come out right.
 */
export const asset = (p) => new URL(String(p).replace(/^\/+/, ''), ROOT).href;
