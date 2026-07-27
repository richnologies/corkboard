export enum ItemCategory {
  Restaurant = 'restaurant',
  Hotel = 'hotel',
  Wine = 'wine',
  Bar = 'bar',
  Cafe = 'cafe',
  Other = 'other',
}

export enum ItemStatus {
  Wishlist = 'wishlist',
  Planned = 'planned',
  Visited = 'visited',
  Rejected = 'rejected',
}

export enum SourceType {
  Friend = 'friend',
  Family = 'family',
  Instagram = 'instagram',
  Michelin = 'michelin',
  Reddit = 'reddit',
  Article = 'article',
  ChatGpt = 'chatgpt',
  TravelGuide = 'travel_guide',
  Other = 'other',
}

export enum SharePermission {
  View = 'view',
  Edit = 'edit',
}

export enum ExperienceVisibility {
  Private = 'private',
  /** Visible to anyone with access to the parent item */
  Shared = 'shared',
}

export enum PersonType {
  Friend = 'friend',
  Family = 'family',
  Pareja = 'pareja',
  Colleague = 'colleague',
  Other = 'other',
}
