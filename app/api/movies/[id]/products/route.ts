import { NextResponse } from "next/server";
import type { MovieProduct } from "@/lib/types";

// Mock data for The Avengers (2012) - TMDB ID: 24428
const AVENGERS_PRODUCTS: MovieProduct[] = [
  {
    id: "prod-avg-001",
    movieId: "24428",
    title: "LEGO Marvel Avengers Tower",
    description: "Recreate the most iconic building in the Avengers Universe.",
    image: "https://m.media-amazon.com/images/I/81xU-U-uHzL._AC_SX679_.jpg",
    category: "LEGO",
    price: 399,
    currency: "AED",
    rating: 4.8,
    reviewCount: 312,
    merchant: "Amazon",
    affiliateUrl: "https://www.amazon.ae/s?k=lego+marvel+avengers+tower",
    availability: "in_stock",
    featured: true,
  },
  {
    id: "prod-avg-002",
    movieId: "24428",
    title: "Marvel's The Avengers (Blu-ray)",
    description: "Experience the epic assembly of Earth's mightiest heroes in stunning high definition.",
    image: "https://m.media-amazon.com/images/I/91tPE3v6G+L._AC_UF1000,1000_QL80_.jpg",
    category: "Blu-ray",
    price: 59,
    currency: "AED",
    rating: 4.9,
    reviewCount: 14002,
    merchant: "Amazon",
    affiliateUrl: "https://www.amazon.ae/s?k=avengers+blu+ray",
    availability: "in_stock",
  },
  {
    id: "prod-avg-003",
    movieId: "24428",
    title: "Iron Man Electronic Helmet Replica",
    description: "Premium roleplay helmet with glowing eyes and electronic sound effects.",
    image: "https://m.media-amazon.com/images/I/71M2gI3g5YL._AC_SX679_.jpg",
    category: "Collectibles",
    price: 549,
    currency: "AED",
    originalPrice: 650,
    rating: 4.7,
    reviewCount: 890,
    merchant: "Amazon",
    affiliateUrl: "https://www.amazon.ae/s?k=iron+man+helmet+replica",
    availability: "in_stock",
  },
  {
    id: "prod-avg-004",
    movieId: "24428",
    title: "The Art of Marvel's The Avengers",
    description: "Exclusive concept art and behind-the-scenes look at the making of the movie.",
    image: "https://m.media-amazon.com/images/I/81N33hL+4dL._SY466_.jpg",
    category: "Books",
    price: 185,
    currency: "AED",
    rating: 4.9,
    reviewCount: 450,
    merchant: "Amazon",
    affiliateUrl: "https://www.amazon.ae/s?k=art+of+marvel+avengers",
    availability: "in_stock",
  },
  {
    id: "prod-avg-005",
    movieId: "24428",
    title: "Thor's Mjolnir Prop Replica",
    description: "1:1 scale replica of Thor's mighty hammer with display stand.",
    image: "https://m.media-amazon.com/images/I/71wLpQ2vJ-L._AC_SX679_.jpg",
    category: "Props",
    price: 499,
    currency: "AED",
    rating: 4.6,
    reviewCount: 215,
    merchant: "Amazon",
    affiliateUrl: "https://www.amazon.ae/s?k=thor+mjolnir+replica",
    availability: "out_of_stock",
  },
  {
    id: "prod-avg-006",
    movieId: "24428",
    title: "Avengers Logo T-Shirt (Black)",
    description: "Official Marvel merchandise. 100% cotton classic fit.",
    image: "https://m.media-amazon.com/images/I/51wX-614wOL._AC_SX679_.jpg",
    category: "Clothing",
    price: 85,
    currency: "AED",
    rating: 4.5,
    reviewCount: 1200,
    merchant: "Amazon",
    affiliateUrl: "https://www.amazon.ae/s?k=avengers+logo+shirt",
    availability: "in_stock",
  }
];

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  // Simulate a slight network delay
  await new Promise(resolve => setTimeout(resolve, 800));

  // For MVP: only return products if the movie is The Avengers (24428)
  if (id === "24428") {
    return NextResponse.json({
      movieId: id,
      products: AVENGERS_PRODUCTS
    });
  }

  // Otherwise, return empty for now
  return NextResponse.json({
    movieId: id,
    products: []
  });
}
