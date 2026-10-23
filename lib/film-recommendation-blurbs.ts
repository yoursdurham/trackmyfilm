import type { FilmShopFormat } from "@/lib/film-product-links";

/**
 * Short copy for the account page "Try something new" card.
 * Add a stock here only when lib/film-product-links.ts already has a shop
 * page for `format`. The card builds the link from that map. It does not
 * read URLs from this file.
 */
export type FilmRecommendationBlurb = {
  stock: string;
  format: FilmShopFormat;
  look: "color" | "black-and-white";
  iso: number;
  blurb: string;
};

export const FILM_RECOMMENDATION_BLURBS: readonly FilmRecommendationBlurb[] = [
  {
    stock: "Fujifilm Superia 400",
    format: "35mm",
    look: "color",
    iso: 400,
    blurb: "Flexible everyday color when the light is changing. A good roll for the camera you carry and the evening you did not plan.",
  },
  {
    stock: "Kodak Gold 200",
    format: "35mm",
    look: "color",
    iso: 200,
    blurb: "Warm, sunny color for bright days and easy snapshots. Picnics, porches, and summer walks come back a little golden.",
  },
  {
    stock: "Kodak Portra 400",
    format: "35mm",
    look: "color",
    iso: 400,
    blurb: "Gentle color and flattering skin tones, inside or outside. Reach for it when you want portraits and quiet scenes to feel soft.",
  },
  {
    stock: "Kodak UltraMax 400",
    format: "35mm",
    look: "color",
    iso: 400,
    blurb: "Bright, punchy color that keeps up with mixed light. Fun for parties, street snapshots, and days you want the pictures to pop.",
  },
  {
    stock: "Kodak ColorPlus 200",
    format: "35mm",
    look: "color",
    iso: 200,
    blurb: "Simple, warm color for ordinary sunny days. A cheerful roll for errands, friends, and snapshots you do not want to overthink.",
  },
  {
    stock: "Lomography Color 400",
    format: "35mm",
    look: "color",
    iso: 400,
    blurb: "Lively color with a playful, slightly wild palette. Pack it when you want the day to look a little louder.",
  },
  {
    stock: "Kodak Portra 160",
    format: "35mm",
    look: "color",
    iso: 160,
    blurb: "Smooth color with fine detail when the sun is out. Lovely for portraits and slow afternoons in good light.",
  },
  {
    stock: "Cinestill 400D",
    format: "35mm",
    look: "color",
    iso: 400,
    blurb: "Daylight color with a cinematic lean and a touch of grain. Strong for sun, shade, and scenes you want to feel like a still.",
  },
  {
    stock: "Kodak Ektar 100",
    format: "35mm",
    look: "color",
    iso: 100,
    blurb: "Vivid, sharp color that loves a bright day. Landscapes and saturated subjects come back bold.",
  },
  {
    stock: "Kodak Portra 800",
    format: "35mm",
    look: "color",
    iso: 800,
    blurb: "The same soft Portra color, with extra speed for shade and indoors. Handy when you do not want to use a flash.",
  },
  {
    stock: "Fujifilm Superia 200",
    format: "35mm",
    look: "color",
    iso: 200,
    blurb: "Light, natural color for sunny walks. A softer everyday look than the faster Fuji.",
  },
  {
    stock: "Candido 400",
    format: "35mm",
    look: "color",
    iso: 400,
    blurb: "Bold color with a bit of character. Easy to toss in a camera and see what the day does with it.",
  },
  {
    stock: "Cinestill 800T",
    format: "35mm",
    look: "color",
    iso: 800,
    blurb: "Made for tungsten light, so streetlamps and neon glow. Night photos pick up soft halos around the bright spots.",
  },
  {
    stock: "Kodak Kodacolor 200",
    format: "35mm",
    look: "color",
    iso: 200,
    blurb: "Warm, straightforward color for sunny days. Another easy roll if you already like Gold and want a small change.",
  },
  {
    stock: "Candido 800",
    format: "35mm",
    look: "color",
    iso: 800,
    blurb: "Faster color for dusk and indoor window light. The pictures stay punchy as the day fades.",
  },
  {
    stock: "Phoenix 200 - Blue",
    format: "35mm",
    look: "color",
    iso: 200,
    blurb: "A cooler, bluer take on experimental color. Fun when you want an ordinary walk to look a little unreal.",
  },
  {
    stock: "Phoenix 125",
    format: "35mm",
    look: "color",
    iso: 125,
    blurb: "Experimental color with greens and reds that do not behave like ordinary film. Try it when you want a surprise.",
  },
  {
    stock: "Lomography LomoChrome Metropolis",
    format: "35mm",
    look: "color",
    iso: 400,
    blurb: "Muted, steely color that feels a bit like a faded city. Good for concrete, winter light, and quiet streets.",
  },
  {
    stock: "Ilford HP5 Plus 400",
    format: "35mm",
    look: "black-and-white",
    iso: 400,
    blurb: "Classic black and white that forgives a missed exposure. It suits gray afternoons, friends, and street walks.",
  },
  {
    stock: "Kodak Tri-X 400",
    format: "35mm",
    look: "black-and-white",
    iso: 400,
    blurb: "Gritty black and white with deep blacks and visible grain. Try it when you want night, contrast, and a little mood.",
  },
  {
    stock: "Kodak T-Max 400",
    format: "35mm",
    look: "black-and-white",
    iso: 400,
    blurb: "Finer, cleaner black and white that still handles lower light. A nice change when you want detail more than grit.",
  },
  {
    stock: "Kodak T-Max P3200",
    format: "35mm",
    look: "black-and-white",
    iso: 3200,
    blurb: "Very fast black and white for dim rooms and night streets. Expect grain, and let the shadows stay moody.",
  },
];
