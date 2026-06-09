const API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.rating",
  "places.userRatingCount",
  "places.priceLevel",
  "places.googleMapsUri",
  "places.internationalPhoneNumber",
  "places.location",
  "places.photos",
].join(",");

export async function searchPlaces({ query, near }) {
  if (!API_KEY) throw new Error("GOOGLE_MAPS_API_KEY not set");

  const body = { textQuery: query, maxResultCount: 8, languageCode: "zh-TW" };
  if (near?.lat && near?.lng) {
    body.locationBias = {
      circle: {
        center: { latitude: near.lat, longitude: near.lng },
        radius: near.radius ?? 5000,
      },
    };
  }

  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": API_KEY,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Places API ${res.status}: ${text}`);
  }

  const data = await res.json();
  return (data.places ?? []).map(normalizePlace).filter(Boolean);
}

function normalizePlace(p) {
  if (!p?.displayName?.text) return null;
  const photoName = p.photos?.[0]?.name;
  return {
    id: p.id,
    name: p.displayName.text,
    address: p.formattedAddress ?? "",
    rating: p.rating ?? null,
    ratingsCount: p.userRatingCount ?? 0,
    priceLevel: priceLabel(p.priceLevel),
    phone: p.internationalPhoneNumber ?? null,
    mapsUrl: p.googleMapsUri ?? null,
    location: p.location ?? null,
    photoUrl: photoName
      ? `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=400&maxWidthPx=600&key=${API_KEY}`
      : null,
  };
}

function priceLabel(level) {
  switch (level) {
    case "PRICE_LEVEL_FREE":
      return "免費";
    case "PRICE_LEVEL_INEXPENSIVE":
      return "$";
    case "PRICE_LEVEL_MODERATE":
      return "$$";
    case "PRICE_LEVEL_EXPENSIVE":
      return "$$$";
    case "PRICE_LEVEL_VERY_EXPENSIVE":
      return "$$$$";
    default:
      return null;
  }
}
