import { ItemCategory } from '@org/domain';

export interface GooglePlaceReview {
  text: string;
  rating?: number;
  relativePublishTimeDescription?: string;
}

export interface GooglePlacePhoto {
  name: string;
  widthPx?: number;
  heightPx?: number;
}

export interface GooglePlaceRecord {
  googlePlaceId: string;
  name: string;
  displayName: string;
  latitude: number;
  longitude: number;
  city?: string;
  country?: string;
  googleMapsUrl: string;
  types: string[];
  category: ItemCategory;
  rating?: number;
  userRatingCount?: number;
  reviews?: GooglePlaceReview[];
  photos?: GooglePlacePhoto[];
}

interface GoogleAddressComponent {
  longText?: string;
  shortText?: string;
  types?: string[];
}

interface GoogleReviewPayload {
  text?: { text?: string };
  rating?: number;
  relativePublishTimeDescription?: string;
}

interface GooglePhotoPayload {
  name?: string;
  widthPx?: number;
  heightPx?: number;
}

interface GooglePlacePayload {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  googleMapsUri?: string;
  types?: string[];
  addressComponents?: GoogleAddressComponent[];
  rating?: number;
  userRatingCount?: number;
  reviews?: GoogleReviewPayload[];
  photos?: GooglePhotoPayload[];
}

export function normalizeGooglePlaceId(id: string): string {
  return id.startsWith('places/') ? id.slice('places/'.length) : id;
}

export function googlePlaceResourceName(googlePlaceId: string): string {
  const normalized = normalizeGooglePlaceId(googlePlaceId);
  return normalized.startsWith('places/') ? normalized : `places/${normalized}`;
}

export function inferCategoryFromTypes(types: string[] = []): ItemCategory {
  const normalized = types.map((type) => type.toLowerCase());
  if (normalized.some((type) => type === 'restaurant' || type === 'meal_delivery')) {
    return ItemCategory.Restaurant;
  }
  if (normalized.some((type) => type === 'cafe' || type === 'bakery')) {
    return ItemCategory.Cafe;
  }
  if (
    normalized.some((type) =>
      ['bar', 'night_club', 'pub', 'wine_bar'].includes(type),
    )
  ) {
    return ItemCategory.Bar;
  }
  if (normalized.some((type) => ['lodging', 'hotel'].includes(type))) {
    return ItemCategory.Hotel;
  }
  return ItemCategory.Other;
}

export function mapGooglePlace(place: GooglePlacePayload): GooglePlaceRecord | null {
  if (!place.id || place.location?.latitude == null || place.location?.longitude == null) {
    return null;
  }

  const googlePlaceId = normalizeGooglePlaceId(place.id);
  const name = place.displayName?.text?.trim() || 'Place';
  const types = place.types ?? [];
  const city = readAddressComponent(place.addressComponents, [
    'locality',
    'postal_town',
    'administrative_area_level_2',
  ]);
  const country = readAddressComponent(place.addressComponents, ['country']);

  const reviews = (place.reviews ?? [])
    .map((review) => {
      const text = review.text?.text?.trim();
      if (!text) return null;
      return {
        text,
        rating: review.rating,
        relativePublishTimeDescription: review.relativePublishTimeDescription,
      } satisfies GooglePlaceReview;
    })
    .filter((review): review is GooglePlaceReview => !!review);

  const photos = (place.photos ?? [])
    .map((photo) => {
      if (!photo.name) return null;
      return {
        name: photo.name,
        widthPx: photo.widthPx,
        heightPx: photo.heightPx,
      } satisfies GooglePlacePhoto;
    })
    .filter((photo): photo is GooglePlacePhoto => !!photo);

  return {
    googlePlaceId,
    name,
    displayName: place.formattedAddress ?? name,
    latitude: place.location.latitude,
    longitude: place.location.longitude,
    city,
    country,
    googleMapsUrl:
      place.googleMapsUri ??
      `https://www.google.com/maps/search/?api=1&query=${place.location.latitude},${place.location.longitude}&query_place_id=${googlePlaceId}`,
    types,
    category: inferCategoryFromTypes(types),
    rating: place.rating,
    userRatingCount: place.userRatingCount,
    reviews: reviews.length ? reviews : undefined,
    photos: photos.length ? photos : undefined,
  };
}

function readAddressComponent(
  components: GoogleAddressComponent[] | undefined,
  types: string[],
): string | undefined {
  for (const type of types) {
    const match = components?.find((component) => component.types?.includes(type));
    if (match?.longText) return match.longText;
  }
  return undefined;
}
