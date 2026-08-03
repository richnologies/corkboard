import {
  CatalogPlace as CatalogPlaceEntity,
  CatalogWine as CatalogWineEntity,
  PlaceDetails,
  WineDetails,
} from '@org/domain';
import { CatalogPlaceDocument } from './catalog-place.schema.js';
import { CatalogWineDocument } from './catalog-wine.schema.js';
import { mapPlaceDetails, mapWineDetails } from '../common/mappers.js';

export function mapCatalogPlace(doc: CatalogPlaceDocument): CatalogPlaceEntity {
  return {
    id: doc.id,
    externalId: doc.externalId,
    name: doc.name,
    nameEn: doc.nameEn,
    nameEs: doc.nameEs,
    category: doc.category,
    location: doc.location ?? {},
    place: mapPlaceDetails(doc.place),
    createdAt: doc.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: doc.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

export function mapCatalogWine(doc: CatalogWineDocument): CatalogWineEntity {
  return {
    id: doc.id,
    externalId: doc.externalId,
    name: doc.name,
    nameEn: doc.nameEn,
    nameEs: doc.nameEs,
    wine: mapWineDetails(doc.wine) ?? ({} as WineDetails),
    createdAt: doc.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: doc.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

export function stripPlaceDetailsForStorage(
  place?: PlaceDetails,
): PlaceDetails | undefined {
  if (!place) return undefined;
  const {
    coverPhotoUrl: _url,
    coverPhotoThumbUrl: _thumbUrl,
    ...rest
  } = place;
  return rest;
}
