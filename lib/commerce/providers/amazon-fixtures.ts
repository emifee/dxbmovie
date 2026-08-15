export const amazonSearchFixture = {
  items: [
    {
      asin: "B09X4DDF24",
      itemInfo: {
        title: { displayValue: "LEGO Marvel Infinity Saga Avengers Tower 76269" },
        features: { displayValues: ["Detailed Avengers Tower build"] },
      },
      images: {
        primary: { large: { url: "https://m.media-amazon.com/images/I/81xU-U-uHzL._AC_SX679_.jpg" } }
      },
      offers: {
        listings: [
          {
            price: { amount: 99.99, currency: "USD" },
            availability: { type: "NOW" }
          }
        ]
      },
      detailPageUrl: "https://www.amazon.com/dp/B09X4DDF24?tag=dxb-20"
    },
    {
      asin: "B0083SBMBM",
      itemInfo: {
        title: { displayValue: "Marvel's The Avengers (Blu-ray)" },
      },
      images: {
        primary: { large: { url: "https://m.media-amazon.com/images/I/91tPE3v6G+L._AC_UF1000,1000_QL80_.jpg" } }
      },
      offers: {
        listings: [
          {
            price: { amount: 19.99, currency: "USD" },
            availability: { type: "NOW" }
          }
        ]
      },
      detailPageUrl: "https://www.amazon.com/dp/B0083SBMBM?tag=dxb-20"
    }
  ]
};

export const amazonGetProductFixture = {
  asin: "B09X4DDF24",
  itemInfo: {
    title: { displayValue: "Mock Refreshed Product" },
  },
  images: {
    primary: { large: { url: "https://m.media-amazon.com/images/I/81xU-U-uHzL._AC_SX679_.jpg" } }
  },
  offers: {
    listings: [
      {
        price: { amount: 89.99, currency: "USD" },
        availability: { type: "NOW" }
      }
    ]
  },
  detailPageUrl: `https://www.amazon.com/dp/B09X4DDF24?tag=dxb-20`
};
