export interface Asset {
  id: string;
  name: string;
  gameId: string;
  gameName: string;
  gameSlug: string;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  url: string;
  tags: string[];
  extension: string;
  /** intrinsic image size, when known - used to reserve layout before load */
  dimensions?: { width: number; height: number };
  uploadDate?: string;
  isSuggestive?: boolean;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
}
