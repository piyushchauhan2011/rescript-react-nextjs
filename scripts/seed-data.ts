import type { InferInsertModel } from "drizzle-orm";
import type { destinations, hotels } from "../apps/web/src/server/db/schema";

export const destinationSeeds: InferInsertModel<typeof destinations>[] = [
  {
    id: "dest-amalfi",
    slug: "amalfi-coast",
    name: "Amalfi Coast",
    country: "Italy",
    summary:
      "Cliffside villages, lemon-scented terraces, and quiet coves along Italy’s most cinematic coastline.",
    image: "/images/hero-1280.webp",
  },
  {
    id: "dest-kyoto",
    slug: "kyoto",
    name: "Kyoto",
    country: "Japan",
    summary:
      "Temple gardens, intimate machiya stays, and a slower rhythm shaped by craft and season.",
    image: "/images/hero-1280.webp",
  },
  {
    id: "dest-bali",
    slug: "bali",
    name: "Bali",
    country: "Indonesia",
    summary:
      "Jungle hideaways and ocean retreats connected by food, ritual, and remarkable design.",
    image: "/images/hero-1280.webp",
  },
  {
    id: "dest-cape",
    slug: "cape-town",
    name: "Cape Town",
    country: "South Africa",
    summary: "Mountain-framed city stays, winelands escapes, and wild Atlantic horizons.",
    image: "/images/hero-1280.webp",
  },
  {
    id: "dest-yucatan",
    slug: "yucatan",
    name: "Yucatán",
    country: "Mexico",
    summary: "Restored haciendas, cenotes, and contemporary stays rooted in Mayan heritage.",
    image: "/images/hero-1280.webp",
  },
  {
    id: "dest-cyclades",
    slug: "cyclades",
    name: "The Cyclades",
    country: "Greece",
    summary: "Whitewashed island houses, volcanic beaches, and elemental Aegean calm.",
    image: "/images/hero-1280.webp",
  },
  {
    id: "dest-bengaluru",
    slug: "bengaluru",
    name: "Bengaluru",
    country: "India",
    summary:
      "Tree-lined neighborhoods, independent kitchens, design studios, and easy metro links across India’s garden city.",
    image: "/images/hero-1280.webp",
  },
];

export const hotelSeeds: InferInsertModel<typeof hotels>[] = [
  {
    id: "hotel-1-1",
    destinationId: "dest-amalfi",
    slug: "casa-aurelia",
    name: "Casa Aurelia",
    summary:
      "A considered stay in Amalfi Coast, pairing a strong sense of place with quietly attentive service.",
    rating: 46,
    priceFrom: 220,
    image: "/images/hotel-pool.webp",
  },
  {
    id: "hotel-2-1",
    destinationId: "dest-kyoto",
    slug: "hikari-house",
    name: "Hikari House",
    summary:
      "A considered stay in Kyoto, pairing a strong sense of place with quietly attentive service.",
    rating: 46,
    priceFrom: 255,
    image: "/images/hotel-garden.webp",
  },
  {
    id: "hotel-3-1",
    destinationId: "dest-bali",
    slug: "uma-verde",
    name: "Uma Verde",
    summary:
      "A considered stay in Bali, pairing a strong sense of place with quietly attentive service.",
    rating: 46,
    priceFrom: 290,
    image: "/images/hotel-terrace.webp",
  },
];
