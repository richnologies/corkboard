import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  effect,
  input,
  output,
} from '@angular/core';
import * as L from 'leaflet';
import { Item, ItemStatus } from '@org/domain';
import { hasMapLocation } from '../maps';

const STATUS_MARKER_COLORS: Record<ItemStatus, string> = {
  [ItemStatus.Wishlist]: '#2563eb',
  [ItemStatus.Planned]: '#0284c7',
  [ItemStatus.Visited]: '#4338ca',
  [ItemStatus.Rejected]: '#64748b',
};

const DEFAULT_CENTER: L.LatLngExpression = [40.4168, -3.7038];
const DEFAULT_ZOOM = 5;
const USER_ZOOM = 13;

@Component({
  selector: 'app-places-map',
  standalone: true,
  template: `<div #mapContainer class="map-container"></div>`,
  styleUrl: './places-map.component.scss',
})
export class PlacesMapComponent implements AfterViewInit, OnDestroy {
  readonly items = input.required<Item[]>();
  readonly selectedItemId = input<string | null>(null);
  readonly pinClicked = output<Item>();
  readonly backgroundClicked = output<void>();

  @ViewChild('mapContainer', { static: true })
  mapContainer!: ElementRef<HTMLDivElement>;

  private map?: L.Map;
  private markersLayer?: L.LayerGroup;
  private markers = new Map<string, L.CircleMarker>();
  private userMarker?: L.CircleMarker;
  private initialViewSet = false;

  constructor() {
    effect(() => {
      const items = this.items();
      if (this.map) {
        this.renderMarkers(items);
      }
    });

    effect(() => {
      this.selectedItemId();
      this.updateSelectedMarker();
    });
  }

  ngAfterViewInit() {
    this.map = L.map(this.mapContainer.nativeElement, {
      zoomControl: true,
      attributionControl: true,
    }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(this.map);

    this.markersLayer = L.layerGroup().addTo(this.map);
    this.renderMarkers(this.items());
    this.map.on('click', () => this.backgroundClicked.emit());
    this.centerOnUserLocation();

    setTimeout(() => this.refreshSize(), 100);
  }

  ngOnDestroy() {
    this.map?.remove();
  }

  refreshSize() {
    this.map?.invalidateSize();
    if (!this.initialViewSet) {
      this.centerOnUserLocation();
    }
  }

  private centerOnUserLocation() {
    if (!this.map || this.initialViewSet) return;

    if (!navigator.geolocation) {
      this.setInitialViewFallback();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!this.map || this.initialViewSet) return;
        const { latitude, longitude } = pos.coords;
        this.map.setView([latitude, longitude], USER_ZOOM);
        this.showUserMarker(latitude, longitude);
        this.initialViewSet = true;
      },
      () => this.setInitialViewFallback(),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
    );
  }

  private setInitialViewFallback() {
    if (!this.map || this.initialViewSet) return;

    const mappable = this.items().filter(hasMapLocation);
    if (mappable.length) {
      this.fitToMarkers(mappable);
    }

    this.initialViewSet = true;
  }

  private showUserMarker(lat: number, lng: number) {
    if (!this.map) return;

    if (this.userMarker) {
      this.userMarker.setLatLng([lat, lng]);
      return;
    }

    this.userMarker = L.circleMarker([lat, lng], {
      radius: 7,
      color: '#1d4ed8',
      fillColor: '#93c5fd',
      fillOpacity: 1,
      weight: 2,
    }).addTo(this.map);
  }

  private renderMarkers(items: Item[]) {
    if (!this.map || !this.markersLayer) return;

    this.markersLayer.clearLayers();
    this.markers.clear();
    const mappable = items.filter(hasMapLocation);

    for (const item of mappable) {
      const lat = item.location!.latitude!;
      const lng = item.location!.longitude!;
      const marker = L.circleMarker([lat, lng], this.markerStyle(item, false));

      marker.on('click', (event) => {
        L.DomEvent.stopPropagation(event);
        this.map?.panTo([lat, lng], { animate: true });
        this.pinClicked.emit(item);
      });

      const tooltip = this.visitTooltip(item);
      if (tooltip) {
        marker.bindTooltip(tooltip, {
          direction: 'top',
          offset: L.point(0, -10),
          opacity: 0.95,
        });
      }

      marker.addTo(this.markersLayer);
      this.markers.set(item.id, marker);
    }

    this.updateSelectedMarker();
  }

  private markerStyle(item: Item, selected: boolean): L.CircleMarkerOptions {
    return {
      radius: selected ? 11 : 8,
      color: selected ? '#1d4ed8' : '#ffffff',
      fillColor: STATUS_MARKER_COLORS[item.status],
      fillOpacity: 0.95,
      weight: selected ? 3 : 2,
    };
  }

  private updateSelectedMarker() {
    const selectedId = this.selectedItemId();
    for (const [id, marker] of this.markers) {
      const item = this.items().find((entry) => entry.id === id);
      if (!item) continue;
      marker.setStyle(this.markerStyle(item, id === selectedId));
    }
  }

  private visitTooltip(item: Item): string | null {
    const visit = item.latestVisit;
    if (!visit) return null;

    const parts: string[] = [];
    const visitedAt = new Date(visit.visitedAt);
    if (!Number.isNaN(visitedAt.getTime())) {
      parts.push(visitedAt.toLocaleDateString());
    }
    if (visit.rating?.overall != null) {
      parts.push(`${visit.rating.overall}/10`);
    }
    return parts.length ? parts.join(' · ') : null;
  }

  private fitToMarkers(items: Item[]) {
    if (!this.map || !items.length) return;

    if (items.length === 1) {
      const item = items[0];
      this.map.setView(
        [item.location!.latitude!, item.location!.longitude!],
        14,
      );
      return;
    }

    const bounds = L.latLngBounds(
      items.map((item) => [
        item.location!.latitude!,
        item.location!.longitude!],
      ),
    );
    this.map.fitBounds(bounds, { padding: [48, 48], maxZoom: 14 });
  }
}
