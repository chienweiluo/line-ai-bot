const PLACEHOLDER_IMG =
  "https://placehold.co/600x400/eeeeee/666666?text=No+Photo";

export function buildPlacesCarousel(places, label = null) {
  const bubbles = places.slice(0, 10).map(buildPlaceBubble);
  const alt = label
    ? `${label} - ${places.length} 個推薦`
    : `${places.length} 個店家推薦`;
  return {
    type: "flex",
    altText: alt.slice(0, 400),
    contents: { type: "carousel", contents: bubbles },
  };
}

function buildPlaceBubble(p) {
  const ratingLine = p.rating
    ? `⭐ ${p.rating.toFixed(1)} (${formatCount(p.ratingsCount)})`
    : "尚無評分";
  const subtitle = [p.priceLevel, ratingLine].filter(Boolean).join("  ·  ");

  const footerButtons = [];
  if (p.mapsUrl) {
    footerButtons.push({
      type: "button",
      style: "primary",
      height: "sm",
      color: "#06C755",
      action: { type: "uri", label: "開啟地圖", uri: p.mapsUrl },
    });
  }
  if (p.phone) {
    footerButtons.push({
      type: "button",
      style: "secondary",
      height: "sm",
      action: {
        type: "uri",
        label: "撥電話",
        uri: `tel:${p.phone.replace(/[^+\d]/g, "")}`,
      },
    });
  }

  return {
    type: "bubble",
    size: "kilo",
    hero: {
      type: "image",
      url: p.photoUrl || PLACEHOLDER_IMG,
      size: "full",
      aspectRatio: "20:13",
      aspectMode: "cover",
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        { type: "text", text: p.name, weight: "bold", size: "md", wrap: true },
        { type: "text", text: subtitle, size: "xs", color: "#888888", wrap: true },
        {
          type: "text",
          text: p.address || " ",
          size: "xs",
          color: "#aaaaaa",
          wrap: true,
          margin: "sm",
        },
      ],
    },
    footer:
      footerButtons.length > 0
        ? { type: "box", layout: "vertical", spacing: "sm", contents: footerButtons }
        : undefined,
  };
}

function formatCount(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
