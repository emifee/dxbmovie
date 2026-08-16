const { MongoClient } = require('mongodb');

async function runTestReport() {
  const uri = "mongodb+srv://emifeaustin09_db_user:xjeAnNYKs0SBilwH@dxbmovies.5zdflaq.mongodb.net/dxbmovies?retryWrites=true&w=majority&appName=DXBmovies";
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db("dxbmovies");
    const ordersCol = db.collection("commerce_orders");
    const webhooksCol = db.collection("instagram_webhook_events");

    console.log("=== LATEST ORDER REPORT ===");
    // Get the most recent order request
    const latestOrder = await ordersCol.find({}).sort({ created_at: -1 }).limit(1).toArray();
    
    if (latestOrder.length > 0) {
      const order = latestOrder[0];
      console.log(`Order ID: ${order._id}`);
      console.log(`Product: ${order.displayed_product_title}`);
      console.log(`Customer IGSID: ${order.customer_igsid}`);
      console.log(`Status: ${order.status}`);
      console.log(`Collected Fields AFTER save:`, order.collected_info);
      console.log(`Missing Fields AFTER orchestrator:`, order.missingFields);
      
      console.log("\n=== WEBHOOK EVENTS FOR THIS CUSTOMER (LAST 10) ===");
      const events = await webhooksCol.find({ sender_id: order.customer_igsid })
        .sort({ received_at: -1 })
        .limit(10)
        .toArray();
        
      events.reverse().forEach(evt => {
        let text = evt.text || "";
        if (evt.event_type === "instagram.unknown") {
          text = "[CONTACT CARD / UNKNOWN TEMPLATE LOGGED]";
        }
        console.log(`[${evt.event_type}] ${text.substring(0, 50).replace(/\n/g, ' ')}...`);
      });
    } else {
      console.log("No orders found.");
    }
  } catch (err) {
    console.error(err);
  } finally {
    await client.close();
  }
}

runTestReport();
