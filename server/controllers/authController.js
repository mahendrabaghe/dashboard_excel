import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { signToken } from '../middleware/auth.js';

export async function register(req, res) {
  const { name, email, password } = req.body;
  const exists = await User.exists({ email });
  if (exists) throw ApiError.conflict('An account with this email already exists.');
  const passwordHash = await User.hashPassword(password);
  const user = await User.create({ name, email, passwordHash, lastLoginAt: new Date() });
  res.status(201).json({ token: signToken(user), user: user.toSafeJSON() });
}

export async function login(req, res) {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+passwordHash');
  // Same message for unknown email and wrong password (no user enumeration)
  const ok = user && (await user.verifyPassword(password));
  if (!ok) throw ApiError.unauthorized('Invalid email or password.');
  user.lastLoginAt = new Date();
  await user.save();
  res.json({ token: signToken(user), user: user.toSafeJSON() });
}

export async function me(req, res) {
  res.json({ user: req.user.toSafeJSON() });
}

export async function updateProfile(req, res) {
  const user = req.user;
  if (req.body.name !== undefined) user.name = req.body.name;
  if (req.body.preferences) {
    user.preferences = { ...user.toObject().preferences, ...req.body.preferences };
  }
  if (req.body.newPassword) {
    const valid = await user.verifyPassword(req.body.currentPassword || '');
    if (!valid) throw ApiError.badRequest('Current password is incorrect.');
    user.passwordHash = await User.hashPassword(req.body.newPassword);
  }
  await user.save();
  res.json({ user: user.toSafeJSON() });
}

export async function deleteAccount(req, res) {
  const valid = await req.user.verifyPassword(req.body.password || '');
  if (!valid) throw ApiError.badRequest('Password is incorrect.');
  const { Dataset } = await import('../models/Dataset.js');
  const { DatasetChunk } = await import('../models/DatasetChunk.js');
  const { DatasetTransformation } = await import('../models/DatasetTransformation.js');
  const { Dashboard } = await import('../models/Dashboard.js');
  const { Report } = await import('../models/Report.js');
  const owner = req.user._id;
  await Promise.all([
    DatasetChunk.deleteMany({ owner }),
    DatasetTransformation.deleteMany({ owner }),
    Dataset.deleteMany({ owner }),
    Dashboard.deleteMany({ owner }),
    Report.deleteMany({ owner }),
  ]);
  await User.deleteOne({ _id: owner });
  res.status(204).end();
}
