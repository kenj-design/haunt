/**
 * Client-side id generation.
 *
 * Only the prototype needs this: once records are inserted through an API the
 * database issues ids, and these functions disappear along with the local
 * factory that calls them.
 */

/** Turns a place name into a URL-safe fragment. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** A readable, collision-resistant local id: `drop-the-moss-steps-1724899200000`. */
export function localId(prefix: string, name: string): string {
  const slug = slugify(name)
  return slug ? `${prefix}-${slug}-${Date.now()}` : `${prefix}-${Date.now()}`
}
