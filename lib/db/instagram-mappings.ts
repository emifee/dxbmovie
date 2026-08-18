import { Collection, ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";

export function normalizeTitle(title: string): string {
  if (!title) return "";
  return title.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export interface InstagramProductMapping {
  _id?: ObjectId | string;
  instagramProductId?: string;
  instagramMediaId?: string;
  normalizedInstagramTitle: string;
  commerceProductId: string;
  /** Physical sourcing linkage. Absent for digital products, which have no supplier offer. */
  supplierOfferId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const COLLECTION_NAME = "instagram_product_mappings";

async function getCollection() {
  const client = await clientPromise;
  const db = client.db("dxbmovies");
  return db.collection<InstagramProductMapping>(COLLECTION_NAME);
}

/**
 * Creates or updates a mapping for an Instagram product identity to our internal catalog.
 */
export async function createOrUpdateMapping(
  commerceProductId: string,
  supplierOfferId: string | undefined,
  rawTitle: string,
  instagramProductId?: string,
  instagramMediaId?: string
): Promise<string> {
  const col = await getCollection();
  const normalizedTitle = normalizeTitle(rawTitle);
  const now = new Date();

  // Try to find an existing mapping to update.
  // Match by instagramProductId OR instagramMediaId OR normalizedTitle.
  const queryParts = [];
  if (instagramProductId) queryParts.push({ instagramProductId });
  if (instagramMediaId) queryParts.push({ instagramMediaId });
  queryParts.push({ normalizedInstagramTitle: normalizedTitle });

  const existing = await col.findOne({ $or: queryParts });

  if (existing) {
    await col.updateOne(
      { _id: existing._id },
      {
        $set: {
          commerceProductId,
          ...(supplierOfferId ? { supplierOfferId } : {}),
          normalizedInstagramTitle: normalizedTitle,
          ...(instagramProductId && { instagramProductId }),
          ...(instagramMediaId && { instagramMediaId }),
          updatedAt: now,
        },
      }
    );
    return existing._id!.toString();
  }

  // Create new
  const result = await col.insertOne({
    normalizedInstagramTitle: normalizedTitle,
    commerceProductId,
    ...(supplierOfferId ? { supplierOfferId } : {}),
    ...(instagramProductId && { instagramProductId }),
    ...(instagramMediaId && { instagramMediaId }),
    createdAt: now,
    updatedAt: now,
  });

  return result.insertedId.toString();
}

/**
 * Resolves the best product mapping based on priority:
 * 1. instagramProductId
 * 2. instagramMediaId
 * 3. normalizedInstagramTitle (exact match)
 */
export async function resolveProductMapping(
  rawTitle: string,
  instagramProductId?: string,
  instagramMediaId?: string
): Promise<InstagramProductMapping | null> {
  const col = await getCollection();
  
  if (instagramProductId) {
    const byPid = await col.findOne({ instagramProductId });
    if (byPid) return byPid;
  }

  if (instagramMediaId) {
    const byMid = await col.findOne({ instagramMediaId });
    if (byMid) return byMid;
  }

  const normalizedTitle = normalizeTitle(rawTitle);
  const byTitle = await col.findOne({ normalizedInstagramTitle: normalizedTitle });
  return byTitle;
}
