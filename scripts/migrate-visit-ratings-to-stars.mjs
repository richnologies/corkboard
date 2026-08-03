import { config } from 'dotenv';
import { resolve } from 'path';
import { MongoClient } from 'mongodb';

config({ path: resolve(process.cwd(), '.env') });

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('Missing MONGODB_URI in .env');
  process.exit(1);
}

const SUB_FIELDS = ['food', 'service', 'atmosphere', 'valueForMoney'];

function hasSubFields(rating) {
  return SUB_FIELDS.some(
    (key) => typeof rating?.[key] === 'number' && Number.isFinite(rating[key]),
  );
}

function alreadyMigrated(rating) {
  if (!rating || typeof rating !== 'object') return false;
  if (hasSubFields(rating)) return false;
  const overall = rating.overall;
  return (
    typeof overall === 'number' &&
    Number.isInteger(overall) &&
    overall >= 1 &&
    overall <= 5
  );
}

function legacyScore(rating) {
  if (!rating || typeof rating !== 'object') return null;
  if (typeof rating.overall === 'number' && Number.isFinite(rating.overall)) {
    return rating.overall;
  }
  const values = SUB_FIELDS.map((key) => rating[key]).filter(
    (value) => typeof value === 'number' && Number.isFinite(value),
  );
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function toStars(score) {
  return Math.max(1, Math.min(5, Math.round(score / 2)));
}

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const experiences = client.db().collection('experiences');

  let scanned = 0;
  let updated = 0;
  let skipped = 0;

  const cursor = experiences.find({ rating: { $exists: true, $ne: null } });
  for await (const doc of cursor) {
    scanned += 1;
    const rating = doc.rating;

    if (alreadyMigrated(rating)) {
      skipped += 1;
      continue;
    }

    const score = legacyScore(rating);
    const unset = Object.fromEntries(
      SUB_FIELDS.map((key) => [`rating.${key}`, '']),
    );

    if (score == null) {
      await experiences.updateOne({ _id: doc._id }, { $unset: unset });
      updated += 1;
      continue;
    }

    await experiences.updateOne(
      { _id: doc._id },
      {
        $set: { 'rating.overall': toStars(score) },
        $unset: unset,
      },
    );
    updated += 1;
  }

  console.log(
    `Visit rating migration complete. scanned=${scanned} updated=${updated} skipped=${skipped}`,
  );
  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
