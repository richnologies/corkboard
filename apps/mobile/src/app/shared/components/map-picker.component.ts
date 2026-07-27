import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import {
  IonButton,
  IonItem,
  IonLabel,
  IonSpinner,
} from '@ionic/angular/standalone';
import * as L from 'leaflet';
import { PlacesService, PlaceSearchResult } from '../../core/services/places.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

@Component({
  selector: 'app-map-picker',
  standalone: true,
  imports: [TranslatePipe, IonSpinner, IonItem, IonLabel, IonButton],
  templateUrl: './map-picker.component.html',
  styleUrl: './map-picker.component.scss',
})
export class MapPickerComponent implements AfterViewInit, OnDestroy {
  private readonly placesService = inject(PlacesService);

  @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef<HTMLDivElement>;

  @Input() latitude?: number;
  @Input() longitude?: number;

  @Output() placeSelected = new EventEmitter<PlaceSearchResult>();

  readonly loading = signal(false);
  readonly suggestions = signal<PlaceSearchResult[]>([]);
  readonly selectedKey = signal<string | null>(null);

  private map?: L.Map;
  private marker?: L.CircleMarker;

  ngAfterViewInit() {
    const lat = this.latitude ?? 40.4168;
    const lng = this.longitude ?? -3.7038;
    const zoom = this.latitude != null ? 15 : 5;

    this.map = L.map(this.mapContainer.nativeElement, {
      zoomControl: true,
      attributionControl: true,
    }).setView([lat, lng], zoom);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(this.map);

    if (this.latitude != null && this.longitude != null) {
      this.setMarker(this.latitude, this.longitude);
      this.loadNearby(this.latitude, this.longitude);
    }

    this.map.on('click', (event: L.LeafletMouseEvent) => {
      this.onMapClick(event.latlng.lat, event.latlng.lng);
    });

    setTimeout(() => this.map?.invalidateSize(), 100);
  }

  ngOnDestroy() {
    this.map?.remove();
  }

  useCurrentLocation() {
    if (!navigator.geolocation) return;
    this.loading.set(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        this.map?.setView([latitude, longitude], 15);
        this.onMapClick(latitude, longitude);
      },
      () => this.loading.set(false),
    );
  }

  selectPlace(place: PlaceSearchResult) {
    this.selectedKey.set(this.placeKey(place));
    this.setMarker(place.latitude, place.longitude);
    this.placeSelected.emit(place);
  }

  private onMapClick(lat: number, lng: number) {
    this.setMarker(lat, lng);
    this.loadNearby(lat, lng);
  }

  private loadNearby(lat: number, lng: number) {
    this.loading.set(true);
    this.placesService.nearby(lat, lng).subscribe({
      next: (places) => {
        this.suggestions.set(places);
        this.loading.set(false);
        if (places.length) {
          this.selectPlace(places[0]);
        } else {
          this.placesService.reverse(lat, lng).subscribe({
            next: (place) => {
              if (place) {
                this.suggestions.set([place]);
                this.selectPlace(place);
              }
            },
          });
        }
      },
      error: () => this.loading.set(false),
    });
  }

  private setMarker(lat: number, lng: number) {
    if (!this.map) return;
    if (this.marker) {
      this.marker.setLatLng([lat, lng]);
    } else {
      this.marker = L.circleMarker([lat, lng], {
        radius: 9,
        color: '#2563eb',
        fillColor: '#3b82f6',
        fillOpacity: 1,
        weight: 2,
      }).addTo(this.map);
    }
  }

  private placeKey(place: PlaceSearchResult): string {
    return `${place.latitude},${place.longitude},${place.name}`;
  }
}
