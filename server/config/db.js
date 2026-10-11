import mongoose from 'mongoose';
import { env } from './env.js';

export async function connectDB() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
  });
  console.log(`[db] connected to MongoDB (${mongoose.connection.name})`);
}

export function dbState() {
  // 0=disconnected 1=connected 2=connecting 3=disconnecting
  return mongoose.connection.readyState;
}
