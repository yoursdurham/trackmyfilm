export type ShopItemVariation = {
  id: string;
  squareVariationId: string;
  name: string;
  priceMoney?: {
    amount: number;
    currency: string;
  };
  displayPrice: string;
  inStock?: boolean;
};

export type ShopItem = {
  id: string;
  squareItemId: string;
  name: string;
  description?: string;
  category?: string;
  imageUrl?: string;
  variations: ShopItemVariation[];
  minPrice?: number;
  maxPrice?: number;
  displayPrice: string;
  inStock?: boolean;
};

export type ShopCatalogResponse = {
  items: ShopItem[];
  categories: string[];
};

export type ShopCheckoutResponse = {
  checkoutUrl: string;
};
