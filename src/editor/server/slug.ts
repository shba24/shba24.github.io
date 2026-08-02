export const isValidSlug = (s: string): boolean => /^[A-Za-z0-9._-]+$/.test(s) && !s.includes('..');
