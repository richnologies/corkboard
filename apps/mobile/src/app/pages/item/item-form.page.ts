import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonList,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTitle,
  IonToolbar,
  IonChip,
  IonLabel,
  IonSegment,
  IonSegmentButton,
  IonNote,
} from '@ionic/angular/standalone';
import { ItemsService } from '../../core/services/items.service';
import { PlacesService, PlaceSearchResult } from '../../core/services/places.service';
import {
  ItemCategory,
  ItemStatus,
  SourceType,
} from '@org/domain';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { OsmMapComponent } from '../../shared/components/osm-map.component';
import { MapPickerComponent } from '../../shared/components/map-picker.component';
import { googleMapsUrl } from '../../shared/maps';

type LocationMode = 'link' | 'map';

@Component({
  selector: 'app-item-form',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    TranslatePipe,
    OsmMapComponent,
    MapPickerComponent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonContent,
    IonList,
    IonItem,
    IonInput,
    IonSelect,
    IonSelectOption,
    IonButton,
    IonSpinner,
    IonChip,
    IonLabel,
    IonSegment,
    IonSegmentButton,
    IonNote,
  ],
  templateUrl: './item-form.page.html',
  styleUrl: './item-form.page.scss',
})
export class ItemFormPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly itemsService = inject(ItemsService);
  private readonly placesService = inject(PlacesService);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly resolvingLink = signal(false);
  readonly linkError = signal(false);
  readonly selectedPlace = signal<PlaceSearchResult | null>(null);
  readonly tagsInput = signal('');
  readonly googleMapsLink = signal('');
  readonly locationMode = signal<LocationMode>('map');

  readonly categories = Object.values(ItemCategory);
  readonly statuses = Object.values(ItemStatus);
  readonly sourceTypes = Object.values(SourceType);

  private itemId: string | null = null;
  get id() { return this.itemId; }

  readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    category: [ItemCategory.Restaurant, Validators.required],
    status: [ItemStatus.Wishlist, Validators.required],
    sourceType: [SourceType.Friend],
    referrerName: [''],
    sourceNotes: [''],
    city: [''],
    country: [''],
  });

  ngOnInit() {
    this.itemId = this.route.snapshot.paramMap.get('id');
    if (this.itemId && this.itemId !== 'new') {
      this.loading.set(true);
      this.itemsService.get(this.itemId).subscribe({
        next: (item) => {
          this.form.patchValue({
            name: item.name,
            category: item.category,
            status: item.status,
            sourceType: item.source?.type ?? SourceType.Other,
            referrerName: item.source?.referrerName ?? '',
            sourceNotes: item.source?.notes ?? '',
            city: item.location?.city ?? '',
            country: item.location?.country ?? '',
          });
          this.tagsInput.set(item.tags.join(', '));

          const loc = item.location;
          if (loc?.googleMapsUrl) {
            this.googleMapsLink.set(loc.googleMapsUrl);
            this.locationMode.set('link');
          }

          if (loc?.latitude != null && loc?.longitude != null) {
            this.selectedPlace.set(this.locationToPlace(loc, item.name));
          } else if (loc?.googleMapsUrl || loc?.googlePlaceId) {
            this.selectedPlace.set({
              name: item.name,
              displayName: loc.address ?? item.name,
              latitude: 0,
              longitude: 0,
              city: loc.city,
              country: loc.country,
              googlePlaceId: loc.googlePlaceId ?? loc.placeId,
              googleMapsUrl:
                loc.googleMapsUrl ??
                googleMapsUrl(
                  loc.latitude,
                  loc.longitude,
                  loc.googlePlaceId ?? loc.placeId,
                  item.name,
                ),
              osmUrl: '',
              streetViewUrl: '',
            });
          }

          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
    }
  }

  onLocationModeChange(ev: CustomEvent) {
    const mode = (ev.detail as { value?: LocationMode }).value;
    if (mode) {
      this.locationMode.set(mode);
      this.linkError.set(false);
    }
  }

  resolveGoogleLink() {
    const url = this.googleMapsLink().trim();
    if (!url) return;
    this.resolvingLink.set(true);
    this.linkError.set(false);
    this.placesService.resolveGoogleUrl(url).subscribe({
      next: (place) => {
        this.resolvingLink.set(false);
        if (place) {
          this.pickPlace(place);
        } else {
          this.linkError.set(true);
        }
      },
      error: () => {
        this.resolvingLink.set(false);
        this.linkError.set(true);
      },
    });
  }

  onMapPlaceSelected(place: PlaceSearchResult) {
    this.pickPlace(place);
  }

  pickPlace(place: PlaceSearchResult) {
    this.selectedPlace.set(place);
    this.form.patchValue({
      name: this.form.value.name || place.name,
      city: place.city ?? '',
      country: place.country ?? '',
    });
    if (place.googleMapsUrl) {
      this.googleMapsLink.set(place.googleMapsUrl);
    }
  }

  clearLocation() {
    this.selectedPlace.set(null);
    this.googleMapsLink.set('');
    this.linkError.set(false);
  }

  hasMapCoords(): boolean {
    const place = this.selectedPlace();
    return place != null && place.latitude !== 0 && place.longitude !== 0;
  }

  mapLat(): number {
    return this.selectedPlace()?.latitude ?? 0;
  }

  mapLng(): number {
    return this.selectedPlace()?.longitude ?? 0;
  }

  save() {
    if (this.form.invalid) return;
    this.saving.set(true);
    const v = this.form.getRawValue();
    const place = this.selectedPlace();
    const tags = this.tagsInput()
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const payload = {
      name: v.name,
      category: v.category,
      status: v.status,
      tags,
      location: place
        ? {
            city: place.city ?? v.city,
            country: place.country ?? v.country,
            latitude: place.latitude || undefined,
            longitude: place.longitude || undefined,
            address: place.displayName,
            googlePlaceId: place.googlePlaceId,
            googleMapsUrl: place.googleMapsUrl,
            placeId: place.googlePlaceId,
          }
        : v.city || v.country
          ? { city: v.city, country: v.country }
          : undefined,
      source: {
        type: v.sourceType,
        referrerName: v.referrerName || undefined,
        notes: v.sourceNotes || undefined,
      },
    };

    const req = this.itemId && this.itemId !== 'new'
      ? this.itemsService.update(this.itemId, payload)
      : this.itemsService.create(payload);

    req.subscribe({
      next: (item) => {
        this.saving.set(false);
        this.router.navigate(['/item', item.id]);
      },
      error: () => this.saving.set(false),
    });
  }

  private locationToPlace(
    loc: NonNullable<import('@org/domain').Item['location']>,
    name: string,
  ): PlaceSearchResult {
    return {
      name,
      displayName: loc.address ?? name,
      latitude: loc.latitude!,
      longitude: loc.longitude!,
      city: loc.city,
      country: loc.country,
      googlePlaceId: loc.googlePlaceId ?? loc.placeId,
      googleMapsUrl:
        loc.googleMapsUrl ??
        googleMapsUrl(
          loc.latitude,
          loc.longitude,
          loc.googlePlaceId ?? loc.placeId,
          name,
        ),
      osmUrl: '',
      streetViewUrl: '',
    };
  }
}
