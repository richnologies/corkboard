export function googleMapsUrl(
  lat?: number,
  lng?: number,
  googlePlaceId?: string,
  name?: string,
): string {
  if (googlePlaceId?.startsWith('ChIJ')) {
    const query = encodeURIComponent(name ?? 'Place');
    return `https://www.google.com/maps/search/?api=1&query=${query}&query_place_id=${googlePlaceId}`;
  }
  if (lat != null && lng != null) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  return '';
}

export function openStreetMapUrl(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;
}

export function streetViewUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?layer=c&cbll=${lat},${lng}`;
}

export function osmEmbedUrl(lat: number, lng: number, zoom = 15): string {
  const delta = 0.012;
  const bbox = `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat}%2C${lng}`;
}
