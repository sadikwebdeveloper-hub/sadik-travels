import { randomUUID } from 'node:crypto';
import { validateConfig, config } from './config.js';
import { connectMongo, seedTours, TourModel } from './store.js';

validateConfig();
if (config.dataMode !== 'mongodb') throw new Error('Run seed with DATA_MODE=mongodb');
await connectMongo();
for (const tour of seedTours) {
  await TourModel.updateOne({ slug: tour.slug }, { $setOnInsert: { id: randomUUID(), ...tour } }, { upsert: true });
}
console.log(`Seeded ${seedTours.length} tour packages`);
const mongoose = await import('mongoose');
await mongoose.default.disconnect();
