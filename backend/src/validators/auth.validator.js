/**
 * Request validators for the local-account authentication endpoints.
 *
 * These are EDGE checks only (shape / length / normalisation). The auth service
 * additionally enforces business rules (duplicate email, wrong password, blocked
 * account). The password floor is 6 characters to match the frontend demo form
 * and existing memory-noted convention; anything stronger belongs to a policy
 * decision, not a Zod file. `email` is trimmed + lowercased here so the derived
 * `veloopId = local:<email>` is deterministic across signup and later login.
 */
const { z } = require('zod');

const email = z
  .string({ required_error: 'Email is required.' })
  .trim()
  .toLowerCase()
  .min(1, 'Email is required.')
  .max(254)
  .email('Enter a valid email address.');

/**
 * Signup enforces the min length. Login accepts ANY non-empty string so a wrong
 * password cannot be distinguished from "too short" by an attacker probing the
 * error shape — the service then answers with a single INVALID_CREDENTIALS code.
 */
const password = z
  .string({ required_error: 'Password is required.' })
  .min(6, 'Password must be at least 6 characters.')
  .max(200);

const signupBody = z
  .object({
    name: z.string({ required_error: 'Name is required.' }).trim().min(2, 'Please enter your full name.').max(100),
    email,
    password,
  })
  .strict();

const loginBody = z
  .object({
    email,
    password: z.string({ required_error: 'Password is required.' }).min(1).max(200),
  })
  .strict();

module.exports = { signupBody, loginBody };
