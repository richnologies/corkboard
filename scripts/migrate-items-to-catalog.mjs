/**
 * One-shot: promote Item location/wine into shared catalog_places / catalog_wines,
 * link library entries via catalogId, backfill Experience.catalogId.
 *
 * Idempotent — safe to re-run.
 *
 * Usage: npm run migrate:items-to-catalog
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import { MongoClient, ObjectId } from 'mongodb';

config({ path: resolve(process.cwd(), '.env') });

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('Missing MONGODB_URI in .env');
  process.exit(1);
}

function placeExternalId(location = {}, name = '') {
  if (location.googlePlaceId?.trim()) return location.googlePlaceId.trim();
  if (
    typeof location.latitude === 'number' &&
    typeof location.longitude === 'number' &&
    Number.isFinite(location.latitude) &&
    Number.isFinite(location.longitude)
  ) {
    return `osm:${location.latitude},${location.longitude}`;
  }
  const slug = String(name).trim().toLowerCase().replace(/\s+/g, '-').slice(0, 80);
  return slug ? `name:${slug}` : `name:${new ObjectId().toString()}`;
}

function wineExternalId(wine = {}, name = '') {
  if (wine.vivinoVintageId?.trim()) return wine.vivinoVintageId.trim();
  if (wine.vivinoWineId?.trim()) return `wine:${wine.vivinoWineId.trim()}`;
  const slug = String(name).trim().toLowerCase().replace(/\s+/g, '-').slice(0, 80);
  return slug ? `local:${slug}` : `local:${new ObjectId().toString()}`;
}

function isWineCategory(category) {
  return category === 'wine';
}

function stripImageUrl(wine) {
  if (!wine || typeof wine !== 'object') return wine;
  const { imageUrl: _drop, ...rest } = wine;
  return rest;
}

async function ensurePlaceCatalog(places, item) {
  const externalId = placeExternalId(item.location, item.name);
  const existing = await places.findOne({ externalId });
  if (existing) {
    const $set = {};
    if (item.place && !existing.place?.enrichedAt) {
      $set.place = { ...existing.place, ...item.place };
      delete $set.place.coverPhotoUrl;
    }
    if (Object.keys($set).length) {
      await places.updateOne({ _id: existing._id }, { $set });
    }
    return existing._id;
  }

  const place = item.place ? { ...item.place } : undefined;
  if (place) delete place.coverPhotoUrl;

  const inserted = await places.insertOne({
    externalId,
    name: item.name,
    nameEn: item.nameEn,
    nameEs: item.nameEs,
    category: item.category,
    location: item.location ?? {},
    place,
    createdAt: item.createdAt ?? new Date(),
    updatedAt: new Date(),
  });
  return inserted.insertedId;
}

async function ensureWineCatalog(wines, item) {
  const wine = item.wine ?? {};
  const externalId = wineExternalId(wine, item.name);

  let existing = null;
  if (wine.vivinoVintageId) {
    existing = await wines.findOne({ vivinoVintageId: wine.vivinoVintageId });
  }
  if (!existing) {
    existing = await wines.findOne({ externalId });
  }
  if (existing) {
    await wines.updateOne(
      { _id: existing._id },
      {
        $set: {
          wine: { ...existing.wine, ...stripImageUrl(wine) },
          vivinoWineId: wine.vivinoWineId ?? existing.vivinoWineId,
          vivinoVintageId: wine.vivinoVintageId ?? existing.vivinoVintageId,
          updatedAt: new Date(),
        },
      },
    );
    return existing._id;
  }

  const inserted = await wines.insertOne({
    externalId,
    vivinoWineId: wine.vivinoWineId,
    vivinoVintageId: wine.vivinoVintageId,
    name: item.name,
    nameEn: item.nameEn,
    nameEs: item.nameEs,
    wine: stripImageUrl(wine) ?? {},
    createdAt: item.createdAt ?? new Date(),
    updatedAt: new Date(),
  });
  return inserted.insertedId;
}

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();
  const items = db.collection('items');
  const places = db.collection('catalog_places');
  const wines = db.collection('catalog_wines');
  const experiences = db.collection('experiences');
  const wineCache = db.collection('wine_details_cache');

  // Promote legacy wine details cache into catalog_wines first.
  let cachePromoted = 0;
  const cacheCursor = wineCache.find({});
  for await (const row of cacheCursor) {
    const externalId = row.vivinoVintageId || `cache:${row._id}`;
    const existing = await wines.findOne({
      $or: [
        { vivinoVintageId: row.vivinoVintageId },
        { externalId },
      ],
    });
    if (existing) continue;
    await wines.insertOne({
      externalId,
      vivinoWineId: row.vivinoWineId,
      vivinoVintageId: row.vivinoVintageId,
      name: row.name,
      wine: stripImageUrl(row.wine) ?? {},
      enrichedAt: row.enrichedAt,
      createdAt: row.createdAt ?? new Date(),
      updatedAt: row.updatedAt ?? new Date(),
    });
    cachePromoted += 1;
  }

  let scanned = 0;
  let linked = 0;
  let skipped = 0;
  let experiencesBackfilled = 0;

  const cursor = items.find({});
  for await (const item of cursor) {
    scanned += 1;

    if (item.catalogId) {
      skipped += 1;
      continue;
    }

    let catalogId;
    let catalogKind;

    if (isWineCategory(item.category) || item.wine) {
      catalogKind = 'wine';
      catalogId = await ensureWineCatalog(wines, item);
    } else if (item.location || item.place) {
      catalogKind = 'place';
      catalogId = await ensurePlaceCatalog(places, item);
    } else {
      skipped += 1;
      continue;
    }

    const unset = {};
    if (catalogKind === 'place') {
      unset.place = '';
    }
    if (catalogKind === 'wine') {
      // Keep thin vivino ids on library row for legacy queries.
      const thinWine = {
        vivinoWineId: item.wine?.vivinoWineId,
        vivinoVintageId: item.wine?.vivinoVintageId,
        vivinoUrl: item.wine?.vivinoUrl,
        year: item.wine?.year,
        winery: item.wine?.winery,
      };
      await items.updateOne(
        { _id: item._id },
        {
          $set: {
            catalogKind,
            catalogId,
            wine: thinWine,
          },
          $unset: { location: '', place: '' },
        },
      );
    } else {
      await items.updateOne(
        { _id: item._id },
        {
          $set: { catalogKind, catalogId },
          ...(Object.keys(unset).length ? { $unset: unset } : {}),
        },
      );
    }

    linked += 1;

    const expResult = await experiences.updateMany(
      {
        itemId: item._id,
        $or: [{ catalogId: { $exists: false } }, { catalogId: null }],
      },
      { $set: { catalogId, catalogKind } },
    );
    experiencesBackfilled += expResult.modifiedCount;
  }

  // Also backfill experiences whose item already has catalogId.
  const linkedItems = items.find({ catalogId: { $exists: true } });
  for await (const item of linkedItems) {
    const expResult = await experiences.updateMany(
      {
        itemId: item._id,
        $or: [{ catalogId: { $exists: false } }, { catalogId: null }],
      },
      {
        $set: {
          catalogId: item.catalogId,
          catalogKind: item.catalogKind,
        },
      },
    );
    experiencesBackfilled += expResult.modifiedCount;
  }

  await places.createIndex({ externalId: 1 }, { unique: true });
  await wines.createIndex({ externalId: 1 }, { unique: true });
  await wines.createIndex({ vivinoVintageId: 1 });
  await wines.createIndex({ vivinoWineId: 1 });
  await items.createIndex(
    { ownerId: 1, catalogId: 1 },
    { unique: true, sparse: true },
  );
  await experiences.createIndex({ catalogId: 1, visitedAt: -1 });

  // Existing accounts should not see first-run onboarding after deploy.
  const users = db.collection('users');
  const onboardingResult = await users.updateMany(
    { onboardingCompletedAt: { $exists: false } },
    { $set: { onboardingCompletedAt: new Date() } },
  );

  console.log(
    JSON.stringify(
      {
        scanned,
        linked,
        skipped,
        cachePromoted,
        experiencesBackfilled,
        existingUsersMarkedOnboarded: onboardingResult.modifiedCount,
      },
      null,
      2,
    ),
  );

  await client.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
