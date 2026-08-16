const { MongoClient } = require('mongodb');

async function checkOrder() {
  const uri = process.env.MONGODB_URI; // Make sure to pass this in
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    const db = client.db('dxbmovies');
    
    // Get the most recent order for emifeaustin's igsid
    const order = await db.collection('commerce_orders').findOne(
      { displayed_product_title: { $regex: /PUMA/i } },
      { sort: { created_at: -1 } }
    );
    
    if (order) {
      console.log(JSON.stringify({
        productCategory: order.productCategory,
        requiredFields: order.requiredFields,
        collectedFields: order.collected_info,
        missingFields: order.missingFields,
        status: order.status
      }, null, 2));
    } else {
      console.log('Order not found');
    }
  } finally {
    await client.close();
  }
}

checkOrder();
