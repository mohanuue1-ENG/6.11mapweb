import { z } from 'zod';
import { badRequest } from './errors.js';

export const uuid = z.string().uuid();

export const email = z.string().trim().toLowerCase().email().max(254);

// bcrypt only reads the first 72 bytes, so longer passwords are rejected rather than silently truncated.
export const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .refine((v) => Buffer.byteLength(v, 'utf8') <= 72, 'Password must be at most 72 bytes');

export const requiredText = (max) => z.string().trim().min(1, 'Required').max(max);

// Optional text: missing, null and "" all become null.
export const nullableText = (max) =>
  z
    .union([z.string().trim().max(max), z.null()])
    .optional()
    .transform((v) => (v ? v : null));

export const nullableDate = z
  .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD'), z.literal(''), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

// Builds "col = $n" pairs for a PATCH from the fields actually present in the
// request body. `columns` maps API field -> column and is the whitelist of
// what may change; placeholders start at $startAt.
export function buildUpdate(columns, input, body, startAt) {
  const fields = Object.keys(columns).filter((f) => Object.prototype.hasOwnProperty.call(body ?? {}, f));
  if (!fields.length) throw badRequest('No fields to update');
  return {
    fields,
    sets: fields.map((f, i) => `${columns[f]} = $${startAt + i}`),
    values: fields.map((f) => input[f]),
  };
}
