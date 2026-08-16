import clientPromise from "@/lib/mongodb";
import { SupplierCheckResult } from "@/lib/commerce/supplier-provider";
import { ObjectId } from "mongodb";

export interface SupplierCheckDocument extends SupplierCheckResult {
  _id?: ObjectId | string;
  orderId?: string; // Optional link if this check was triggered by an active order
  commerceProductId?: string; // Link to the original commerce product
}

async function getSupplierChecksCollection() {
  const client = await clientPromise;
  const db = client.db("dxbmovies");
  return db.collection<SupplierCheckDocument>("supplier_checks");
}

export async function insertSupplierCheck(check: SupplierCheckDocument): Promise<SupplierCheckDocument> {
  const col = await getSupplierChecksCollection();
  
  const docToInsert = { ...check };
  if (!docToInsert.checkedAt) {
    docToInsert.checkedAt = new Date();
  }

  const result = await col.insertOne(docToInsert);
  return { ...docToInsert, _id: result.insertedId };
}

export async function getSupplierChecksForOffer(offerId: string): Promise<SupplierCheckDocument[]> {
  const col = await getSupplierChecksCollection();
  return col.find({ offerId }).sort({ checkedAt: -1 }).toArray();
}
