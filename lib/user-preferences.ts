import clientPromise from "@/lib/mongodb";

export interface UserPreferences {
  userId: string;
  lastInteractionAt: string;
  searchQueries: string[];
  topGenres: Record<string, number>;
}

export async function trackUserSearch(userId: string, query: string) {
  try {
    const client = await clientPromise;
    const db = client.db("dxbmovies");
    
    // Add query to recent searches, keeping max 20
    await db.collection("userPreferences").updateOne(
      { userId },
      { 
        $push: { 
          searchQueries: { 
            $each: [query], 
            $position: 0, 
            $slice: 20 
          } 
        },
        $set: { lastInteractionAt: new Date().toISOString() }
      },
      { upsert: true }
    );
  } catch (e) {
    console.error("Failed to track user search", e);
  }
}

export async function trackUserGenre(userId: string, genreIds: number[]) {
  if (!genreIds || genreIds.length === 0) return;
  
  try {
    const client = await clientPromise;
    const db = client.db("dxbmovies");
    
    // Increment the count for each genre ID
    const incObj: Record<string, number> = {};
    genreIds.forEach(id => {
      incObj[`topGenres.${id}`] = 1;
    });

    await db.collection("userPreferences").updateOne(
      { userId },
      { 
        $inc: incObj,
        $set: { lastInteractionAt: new Date().toISOString() }
      },
      { upsert: true }
    );
  } catch (e) {
    console.error("Failed to track user genre", e);
  }
}

export async function getUserPreferences(userId: string): Promise<UserPreferences | null> {
  try {
    const client = await clientPromise;
    const db = client.db("dxbmovies");
    return await db.collection("userPreferences").findOne({ userId }) as unknown as UserPreferences;
  } catch (e) {
    console.error("Failed to get user preferences", e);
    return null;
  }
}
