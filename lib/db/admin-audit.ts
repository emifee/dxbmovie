import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export interface AdminAuditLog {
  _id?: string;
  adminId: string;
  action: string;
  targetCollection: string;
  targetId: string;
  oldValue?: any;
  newValue?: any;
  requiredConfirmation: boolean;
  timestamp: string;
}

export async function createAuditLog(log: Omit<AdminAuditLog, "_id" | "timestamp">) {
  const client = await clientPromise;
  const db = client.db("dxbmovies");
  
  const auditLog = {
    ...log,
    timestamp: new Date().toISOString()
  };

  const result = await db.collection("admin_audit_logs").insertOne(auditLog);
  return result.insertedId.toString();
}

export async function getAuditLogs(limit: number = 50) {
  const client = await clientPromise;
  const db = client.db("dxbmovies");
  
  return await db.collection("admin_audit_logs")
    .find()
    .sort({ timestamp: -1 })
    .limit(limit)
    .toArray();
}
