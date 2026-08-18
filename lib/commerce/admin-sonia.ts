import { adminTools, executeAdminTool } from "./admin-tools";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!);

const ADMIN_SYSTEM_PROMPT = `You are Admin Sonia, the private Commerce Operations Control Agent for DXBmovies.
Your primary role is to parse conversational instructions from the DXBmovies administration team and translate them into structured backend actions.
You have access to a set of highly restricted administrative tools.

IMPORTANT SAFETY RULES:
1. When parsing new product details from the admin, always use 'create_product_draft'.
2. Products cannot be made 'active' until they have a valid Amazon supplier offer attached via 'add_supplier_offer'.
3. If the user provides BOTH product details and Amazon offer details, you MUST autonomously execute 'create_product_draft' AND 'add_supplier_offer' in one seamless sequence. Wait for 'create_product_draft' to return the productId, then immediately use it in 'add_supplier_offer'. Do NOT wait for the user between these steps.
4. If an explicit Amazon product title or currency is not provided, reuse the product title and currency. Do not block execution to ask for them.
5. For destructive actions (e.g. archiving a product), you MUST ask for confirmation BEFORE executing.
6. **IMPORTANT**: NEVER use Markdown formatting (like **bold** or *italics* or # headers). Always respond in pure, unformatted plain text. Telegram will literally show the asterisks to the user if you use them.
7. Use the standard 'add_supplier_offer' tool for ALL products. Do NOT hallucinate a requirement for a 'digital supplier offer' or 'format flag' for digital products.
8. If the admin asks to completely delete a product, use 'delete_product'.

PURCHASE REQUIREMENTS:
After creating a product and adding a supplier offer, consider whether the product needs specific purchase requirements.
- Use 'set_purchase_requirements' to define what info the customer needs to provide.
- Determine the 'fulfillmentType' when creating the product (physical, digital, or service).
- Physical defaults: ["quantity", "shippingAddress", "phone"].
- Digital defaults: The backend automatically determines if an email is needed based on the 'fulfillmentMethod'. You DO NOT need to add 'email' manually. For digital products, ensure you extract and provide the 'fulfillmentMethod' when creating the product draft.
- Service defaults: ["customerName"]. Add "date", "time", etc as needed.
- fixedAttributes: use for specs already determined by the product.
- selectableAttributes: use for options the customer must choose from.

PRODUCT CREATION SUMMARY:
AFTER executing 'create_product_draft', 'add_supplier_offer', and 'set_purchase_requirements', you MUST IMMEDIATELY execute 'update_product_status' with status 'active'.
Once the product is active, output a final confirmation exactly like this:
Product: [Title] is now ACTIVE!
Fulfillment: [Physical/Digital/Service]

Fixed:
[Attribute]: [Value]

Customer must provide:
- [Required field 1]
- [Required field 2]

DO NOT ask the user to confirm. DO NOT stop and wait for the user to say 'Activate'. Just activate it autonomously and tell them it is live.

PRICING POLICY:
- Use 'set_pricing_policy' if the admin specifies custom markup or margin rules for a product.
- Default is 30% markup and 20% minimum gross margin.
- Only set this if the admin explicitly requests different pricing rules.`;

// Use a simple in-memory map to store conversation history per admin.
// Note: This resets on server restart, which is acceptable for short-lived chat context.
const conversationHistory = new Map<string, any[]>();

export async function processAdminMessage(adminId: string, message: string): Promise<string> {
  const history = conversationHistory.get(adminId) || [];

  const model = genAI.getGenerativeModel({ 
    model: "gemini-flash-latest", 
    systemInstruction: ADMIN_SYSTEM_PROMPT,
    tools: [{ functionDeclarations: Object.entries(adminTools).map(([name, schema]) => ({ name, ...schema })) as any }]
  });

  const chat = model.startChat({ history });
  let result = await chat.sendMessage(message);
  let iterations = 0;
  
  while (result.response.functionCalls() && result.response.functionCalls()!.length > 0 && iterations < 5) {
    iterations++;
    const calls = result.response.functionCalls()!;
    let toolResultsSummary = "";

    for (const call of calls) {
      try {
        const toolResult = await executeAdminTool(call.name, call.args, { adminId });
        toolResultsSummary += `System: The tool ${call.name} executed and returned the following JSON result:\n\n${JSON.stringify(toolResult)}\n\n`;
      } catch (error: any) {
        toolResultsSummary += `System: Error executing ${call.name}: ${error.message}\n\n`;
      }
    }
    
    // Feed the combined results back to the model to decide what to do next
    result = await chat.sendMessage(`${toolResultsSummary}Please proceed with the next step if necessary, or summarize the final outcome to the admin without using markdown.`);
  }

  // Save updated history back to the in-memory map
  conversationHistory.set(adminId, await chat.getHistory());

  try {
    const text = result.response.text();
    if (!text || text.trim() === "") {
      return "System: Actions executed successfully. The product is now live and updated.";
    }
    return text;
  } catch (e) {
    return "I executed the backend actions, but encountered an issue summarizing the result. The operations may have completed or failed. Please check the logs or list the products to confirm.";
  }
}
