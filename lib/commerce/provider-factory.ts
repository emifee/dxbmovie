import { CommerceProvider } from "@/lib/types";
import { MockCommerceProvider } from "./providers/mock";
import { AmazonCreatorsProvider } from "./providers/amazon-creators";

export function getCommerceProvider(): CommerceProvider {
  const provider = process.env.COMMERCE_PROVIDER;
  
  switch (provider) {
    case "amazon_creators":
      return new AmazonCreatorsProvider();
    case "mock":
    default:
      return new MockCommerceProvider();
  }
}
