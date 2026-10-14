import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import * as userRepo from '../repositories/userRepository.js';
import { unauthorized } from '../utils/errors.js';

export async function login({ email, password }) {
  const user = await userRepo.findUserByEmail(String(email).toLowerCase().trim());
  // Constant-ish behavior: compare against a dummy hash when user is missing to reduce timing leaks.
  const hash = user?.password_hash || '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
  const match = await bcrypt.compare(password, hash);
  if (!user || !match) throw unauthorized('Invalid email or password');

  const payload = { sub: user.id, role: user.role, email: user.email };
  const token = jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
  const { password_hash, ...safe } = user; // never expose the hash
  return { token, user: safe };
}

export async function getMe(userId) {
  return userRepo.findUserById(userId);
}

export async function hashPassword(plain) {
  return bcrypt.hash(plain, config.bcryptRounds);
}
