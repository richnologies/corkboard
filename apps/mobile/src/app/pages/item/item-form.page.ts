import { Component, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
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
  IonToggle,
  IonTextarea,
  IonSearchbar,
} from '@ionic/angular/standalone';
import { ItemsService } from '../../core/services/items.service';
import { PlacesService, PlaceSearchResult } from '../../core/services/places.service';
import {
  WinesService,
  WineLookupResult,
  WineSearchResult,
} from '../../core/services/wines.service';
import { MediaService } from '../../core/services/media.service';
import { I18nService } from '../../core/i18n/i18n.service';
import {
  itemDisplayName,
  locationAddress,
  locationCity,
  locationCountry,
  wineAllergens,
  wineCountry,
  wineDescription,
  wineGrapes,
  wineRegion,
  wineStyle,
} from '../../shared/localized';
import {
  ItemCategory,
  ItemStatus,
  SourceType,
  WineDetails,
  PLACE_CATEGORIES,
  categoryHasLocation,
  FAVORITE_TAG,
  addFavoriteTag,
  hasFavoriteTag,
  removeFavoriteTag,
  tagsWithoutFavorite,
} from '@org/domain';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { OsmMapComponent } from '../../shared/components/osm-map.component';
import { MapPickerComponent } from '../../shared/components/map-picker.component';
import { TagPickerComponent } from '../../shared/components/tag-picker.component';
import { PersonPickerComponent } from '../../shared/components/person-picker.component';
import { googleMapsUrl } from '../../shared/maps';
import {
  IMAGE_ACCEPT,
  ImagePrepareError,
  isImageFile,
  prepareImageFile,
} from '../../shared/utils/image-resize';
import { Subject, debounceTime, distinctUntilChanged, switchMap, of, catchError, firstValueFrom } from 'rxjs';

type LocationMode = 'link' | 'map';
type WineLinkMode = 'search' | 'link' | 'photo';

@Component({
  selector: 'app-item-form',
  standalone: true,
  imports: [
    DecimalPipe,
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
    IonFooter,
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
    IonToggle,
    IonTextarea,
    IonSearchbar,
    TagPickerComponent,
    PersonPickerComponent,
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
  private readonly winesService = inject(WinesService);
  private readonly mediaService = inject(MediaService);
  private readonly i18n = inject(I18nService);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly resolvingLink = signal(false);
  readonly linkError = signal(false);
  readonly selectedPlace = signal<PlaceSearchResult | null>(null);
  readonly selectedTags = signal<string[]>([]);
  readonly referrerPersonIds = signal<string[]>([]);
  readonly isFavorite = signal(false);
  readonly googleMapsLink = signal('');
  readonly locationMode = signal<LocationMode>('link');

  readonly wineLinkMode = signal<WineLinkMode>('search');
  readonly vivinoLink = signal('');
  readonly wineSearchResults = signal<WineSearchResult[]>([]);
  readonly searchingWines = signal(false);
  readonly identifyingWine = signal(false);
  readonly wineIdentifyError = signal<string | null>(null);
  readonly winePhotoPreview = signal<string | null>(null);
  readonly selectedWineMeta = signal<WineDetails | null>(null);
  readonly wineSearchQuery = signal('');
  readonly imageAccept = IMAGE_ACCEPT;
  private readonly wineSearch$ = new Subject<string>();
  private winePhotoPreviewUrl: string | null = null;
  /** Preserves bilingual fields for the language the user is not currently editing. */
  private existingLocaleFields: {
    nameEn?: string;
    nameEs?: string;
    location?: import('@org/domain').Location;
  } | null = null;

  readonly placeCategories = PLACE_CATEGORIES;
  readonly statuses = Object.values(ItemStatus);
  readonly sourceTypes = Object.values(SourceType);
  readonly favoriteTag = FAVORITE_TAG;
  readonly isWineForm = signal(false);
  readonly defaultHref = signal('/tabs/places');

  private itemId: string | null = null;
  get id() { return this.itemId; }

  readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    category: [ItemCategory.Restaurant, Validators.required],
    status: [ItemStatus.Wishlist, Validators.required],
    rejectionReason: [''],
    sourceType: [SourceType.Friend],
    sourceNotes: [''],
    city: [''],
    country: [''],
    winery: [''],
    grapes: [''],
    wineRegion: [''],
    wineCountry: [''],
    style: [''],
    alcoholPercentage: [''],
    allergens: [''],
    description: [''],
    price: [''],
    priceCurrency: ['EUR'],
    rating: [''],
    year: [''],
  });

  formCategories(): ItemCategory[] {
    if (this.isWineForm()) return [ItemCategory.Wine];
    return this.placeCategories;
  }

  showsLocation(): boolean {
    return categoryHasLocation(this.form.controls.category.value);
  }

  showsRejectionReason(): boolean {
    return this.form.controls.status.value === ItemStatus.Rejected;
  }

  ngOnInit() {
    this.wineSearch$
      .pipe(
        debounceTime(350),
        distinctUntilChanged(),
        switchMap((query) => {
          const q = query.trim();
          if (q.length < 2) {
            this.searchingWines.set(false);
            this.wineSearchResults.set([]);
            return of([] as WineSearchResult[]);
          }
          this.searchingWines.set(true);
          return this.winesService.search(q).pipe(
            catchError(() => of([] as WineSearchResult[])),
          );
        }),
      )
      .subscribe((results) => {
        this.wineSearchResults.set(results);
        this.searchingWines.set(false);
      });

    this.form.controls.category.valueChanges.subscribe((category) => {
      if (category && !categoryHasLocation(category)) {
        this.clearLocation();
        this.form.patchValue({ city: '', country: '' });
      }
      this.syncFormMode(category);
    });

    this.form.controls.status.valueChanges.subscribe((status) => {
      if (status !== ItemStatus.Rejected) {
        this.form.patchValue({ rejectionReason: '' });
      }
    });

    this.itemId = this.route.snapshot.paramMap.get('id');
    const queryCategory = this.route.snapshot.queryParamMap.get('category');
    if (
      (!this.itemId || this.itemId === 'new') &&
      queryCategory === ItemCategory.Wine
    ) {
      this.form.patchValue({ category: ItemCategory.Wine });
      this.syncFormMode(ItemCategory.Wine);
    }

    if (this.itemId && this.itemId !== 'new') {
      this.loading.set(true);
      this.itemsService.get(this.itemId).subscribe({
        next: (item) => {
          const locale = this.i18n.locale();
          const displayName = itemDisplayName(item, locale);
          this.existingLocaleFields = {
            nameEn: item.nameEn,
            nameEs: item.nameEs,
            location: item.location,
          };
          this.form.patchValue({
            name: displayName,
            category: item.category,
            status: item.status,
            rejectionReason: item.rejectionReason ?? '',
            sourceType: item.source?.type ?? SourceType.Other,
            sourceNotes: item.source?.notes ?? '',
            city: locationCity(item.location, locale) ?? '',
            country: locationCountry(item.location, locale) ?? '',
          });
          this.syncFormMode(item.category);
          if (item.wine) {
            this.applyWineDetails(displayName, item.wine, { keepName: true });
          }
          this.referrerPersonIds.set(
            item.source?.referrerPersonId ? [item.source.referrerPersonId] : [],
          );
          this.isFavorite.set(hasFavoriteTag(item.tags));
          this.selectedTags.set(tagsWithoutFavorite(item.tags));

          const loc = item.location;
          if (loc?.googleMapsUrl) {
            this.googleMapsLink.set(loc.googleMapsUrl);
            this.locationMode.set('link');
          } else if (loc?.latitude != null && loc?.longitude != null) {
            this.locationMode.set('map');
          }

          if (loc?.latitude != null && loc?.longitude != null) {
            this.selectedPlace.set(this.locationToPlace(loc, displayName, locale));
          } else if (loc?.googleMapsUrl || loc?.googlePlaceId) {
            this.selectedPlace.set({
              name: displayName,
              displayName: locationAddress(loc, locale) ?? displayName,
              latitude: 0,
              longitude: 0,
              city: locationCity(loc, locale),
              country: locationCountry(loc, locale),
              googlePlaceId: loc.googlePlaceId ?? loc.placeId,
              googleMapsUrl:
                loc.googleMapsUrl ??
                googleMapsUrl(
                  loc.latitude,
                  loc.longitude,
                  loc.googlePlaceId ?? loc.placeId,
                  displayName,
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

  private syncFormMode(category: ItemCategory | null | undefined) {
    const wine = category === ItemCategory.Wine;
    this.isWineForm.set(wine);
    this.defaultHref.set(wine ? '/tabs/wines' : '/tabs/places');
  }

  formTitleKey(): string {
    const isNew = this.id === 'new' || !this.id;
    if (this.isWineForm()) {
      return isNew ? 'item.addTitleWine' : 'item.editTitleWine';
    }
    return isNew ? 'item.addTitle' : 'item.editTitle';
  }

  onWineSearch(ev: CustomEvent) {
    const value = (ev.detail as { value?: string }).value ?? '';
    this.wineSearchQuery.set(value);
    this.wineSearch$.next(value);
  }

  onWineLinkModeChange(ev: CustomEvent) {
    const mode = (ev.detail as { value?: WineLinkMode }).value;
    if (mode) {
      this.wineLinkMode.set(mode);
      this.linkError.set(false);
    }
  }

  pickWineSearchResult(result: WineSearchResult) {
    this.searchingWines.set(true);
    this.linkError.set(false);
    this.winesService
      .details({
        vintageId: result.vintageId,
        wineId: result.wineId,
        itemId: result.itemId,
      })
      .subscribe({
        next: (lookup) => {
          this.searchingWines.set(false);
          this.applyWineLookup(lookup);
          this.wineSearchResults.set([]);
          this.wineSearchQuery.set('');
        },
        error: () => {
          // Local results without Vivino ids can still apply from the hit.
          if (result.source === 'local') {
            this.applyWineDetails(result.name, {
              vivinoWineId: result.wineId !== result.itemId ? result.wineId : undefined,
              vivinoVintageId: result.vintageId,
              vivinoUrl: result.vivinoUrl || undefined,
              winery: result.winery,
              region: result.region,
              country: result.country,
              year: result.year,
              rating: result.rating,
              imageUrl: result.imageUrl,
            });
            this.wineSearchResults.set([]);
            this.wineSearchQuery.set('');
            this.searchingWines.set(false);
            return;
          }
          this.searchingWines.set(false);
          this.linkError.set(true);
        },
      });
  }

  async onWinePhotoSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !isImageFile(file)) return;

    this.wineIdentifyError.set(null);
    this.identifyingWine.set(true);
    this.linkError.set(false);

    try {
      const { full, thumb } = await prepareImageFile(file);
      if (this.winePhotoPreviewUrl) {
        URL.revokeObjectURL(this.winePhotoPreviewUrl);
      }
      this.winePhotoPreviewUrl = URL.createObjectURL(thumb);
      this.winePhotoPreview.set(this.winePhotoPreviewUrl);

      const uploaded = await this.mediaService.uploadPhoto(full, thumb);
      const identified = await firstValueFrom(
        this.winesService.identifyPhoto(uploaded.key),
      );

      if (identified.extracted.searchQuery) {
        this.wineSearchQuery.set(identified.extracted.searchQuery);
      }
      this.wineSearchResults.set(identified.results);

      if (!identified.results.length && identified.extracted) {
        this.form.patchValue({
          name: identified.extracted.name || this.form.value.name,
          winery: identified.extracted.winery ?? '',
          year: identified.extracted.year ?? '',
          wineRegion: identified.extracted.region ?? '',
          grapes: (identified.extracted.grapes ?? []).join(', '),
          alcoholPercentage:
            identified.extracted.alcoholPercentage != null
              ? String(identified.extracted.alcoholPercentage)
              : '',
        });
      }
    } catch (error) {
      if (error instanceof ImagePrepareError) {
        this.wineIdentifyError.set(
          error.code === 'IMAGE_TOO_LARGE'
            ? this.i18n.t('item.photoTooLarge')
            : this.i18n.t('item.photoProcessingFailed'),
        );
      } else {
        this.wineIdentifyError.set(this.i18n.t('item.wineIdentifyError'));
      }
    } finally {
      this.identifyingWine.set(false);
    }
  }

  clearWinePhoto() {
    if (this.winePhotoPreviewUrl) {
      URL.revokeObjectURL(this.winePhotoPreviewUrl);
      this.winePhotoPreviewUrl = null;
    }
    this.winePhotoPreview.set(null);
    this.wineIdentifyError.set(null);
  }

  resolveVivinoLink() {
    const url = this.vivinoLink().trim();
    if (!url) return;
    this.resolvingLink.set(true);
    this.linkError.set(false);
    this.winesService.resolveVivinoUrl(url).subscribe({
      next: (lookup) => {
        this.resolvingLink.set(false);
        if (lookup) {
          this.applyWineLookup(lookup);
          if (lookup.wine.vivinoUrl) {
            this.vivinoLink.set(lookup.wine.vivinoUrl);
          }
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

  clearWineLink() {
    this.selectedWineMeta.set(null);
    this.vivinoLink.set('');
    this.wineSearchResults.set([]);
    this.form.patchValue({
      winery: '',
      grapes: '',
      wineRegion: '',
      wineCountry: '',
      style: '',
      alcoholPercentage: '',
      allergens: '',
      description: '',
      price: '',
      priceCurrency: 'EUR',
      rating: '',
      year: '',
    });
  }

  private applyWineLookup(lookup: WineLookupResult) {
    this.applyWineDetails(lookup.name, lookup.wine);
  }

  private applyWineDetails(
    name: string,
    wine: WineDetails,
    opts?: { keepName?: boolean },
  ) {
    this.selectedWineMeta.set(wine);
    if (wine.vivinoUrl) this.vivinoLink.set(wine.vivinoUrl);
    const locale = this.i18n.locale();
    this.form.patchValue({
      ...(opts?.keepName ? {} : { name }),
      winery: wine.winery ?? '',
      grapes: (wineGrapes(wine, locale) ?? []).join(', '),
      wineRegion: wineRegion(wine, locale) ?? '',
      wineCountry: wineCountry(wine, locale) ?? '',
      style: wineStyle(wine, locale) ?? '',
      alcoholPercentage:
        wine.alcoholPercentage != null ? String(wine.alcoholPercentage) : '',
      allergens: (wineAllergens(wine, locale) ?? []).join(', '),
      description: wineDescription(wine, locale) ?? '',
      price: wine.price != null ? String(wine.price) : '',
      priceCurrency: wine.priceCurrency ?? 'EUR',
      rating: wine.rating != null ? String(wine.rating) : '',
      year: wine.year ?? '',
    });
  }

  private buildWinePayload(): WineDetails | undefined {
    if (!this.isWineForm()) return undefined;
    const v = this.form.getRawValue();
    const meta = this.selectedWineMeta();
    const grapes = v.grapes
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    const allergens = v.allergens
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    const alcohol = v.alcoholPercentage.trim()
      ? Number(v.alcoholPercentage)
      : undefined;
    const price = v.price.trim() ? Number(v.price) : undefined;
    const rating = v.rating.trim() ? Number(v.rating) : undefined;
    const editedDescription = v.description.trim() || undefined;
    const editedRegion = v.wineRegion.trim() || undefined;
    const editedCountry = v.wineCountry.trim() || undefined;
    const editedStyle = v.style.trim() || undefined;
    const locale = this.i18n.locale();

    const descriptionEn =
      locale === 'en'
        ? editedDescription || meta?.descriptionEn || meta?.description
        : meta?.descriptionEn || meta?.description;
    const descriptionEs =
      locale === 'es'
        ? editedDescription || meta?.descriptionEs
        : meta?.descriptionEs;
    const regionEn =
      locale === 'en'
        ? editedRegion || meta?.regionEn || meta?.region
        : meta?.regionEn || meta?.region;
    const regionEs =
      locale === 'es' ? editedRegion || meta?.regionEs : meta?.regionEs;
    const countryEn =
      locale === 'en'
        ? editedCountry || meta?.countryEn || meta?.country
        : meta?.countryEn || meta?.country;
    const countryEs =
      locale === 'es' ? editedCountry || meta?.countryEs : meta?.countryEs;
    const styleEn =
      locale === 'en'
        ? editedStyle || meta?.styleEn || meta?.style
        : meta?.styleEn || meta?.style;
    const styleEs =
      locale === 'es' ? editedStyle || meta?.styleEs : meta?.styleEs;
    const grapesEn =
      locale === 'en'
        ? grapes.length
          ? grapes
          : meta?.grapesEn || meta?.grapes
        : meta?.grapesEn || meta?.grapes;
    const grapesEs =
      locale === 'es'
        ? grapes.length
          ? grapes
          : meta?.grapesEs
        : meta?.grapesEs;
    const allergensEn =
      locale === 'en'
        ? allergens.length
          ? allergens
          : meta?.allergensEn || meta?.allergens
        : meta?.allergensEn || meta?.allergens;
    const allergensEs =
      locale === 'es'
        ? allergens.length
          ? allergens
          : meta?.allergensEs
        : meta?.allergensEs;

    const wine: WineDetails = {
      vivinoWineId: meta?.vivinoWineId,
      vivinoVintageId: meta?.vivinoVintageId,
      vivinoUrl: meta?.vivinoUrl || this.vivinoLink().trim() || undefined,
      winery: v.winery.trim() || undefined,
      grapes: grapesEn,
      grapesEn,
      grapesEs,
      region: regionEn || regionEs,
      regionEn,
      regionEs,
      country: countryEn || countryEs,
      countryEn,
      countryEs,
      style: styleEn || styleEs,
      styleEn,
      styleEs,
      alcoholPercentage:
        alcohol != null && Number.isFinite(alcohol) ? alcohol : undefined,
      allergens: allergensEn,
      allergensEn,
      allergensEs,
      description: descriptionEn || descriptionEs || editedDescription,
      descriptionEn,
      descriptionEs,
      price: price != null && Number.isFinite(price) ? price : undefined,
      priceCurrency: v.priceCurrency.trim() || undefined,
      rating: rating != null && Number.isFinite(rating) ? rating : undefined,
      year: v.year.trim() || undefined,
      imageKey: meta?.imageKey,
      imageUrl: meta?.imageKey
        ? undefined
        : meta?.imageUrl?.includes('X-Amz-')
          ? undefined
          : meta?.imageUrl,
    };

    const hasAny = Object.values(wine).some((value) =>
      Array.isArray(value) ? value.length > 0 : value != null && value !== '',
    );
    return hasAny ? wine : undefined;
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
    const locale = this.i18n.locale();
    const existing = this.existingLocaleFields;
    const normalizedTags = this.isFavorite()
      ? addFavoriteTag(this.selectedTags())
      : removeFavoriteTag(this.selectedTags());

    const editedName = v.name.trim();
    // Keep other-language name from existing record when editing in one locale.
    const preservedNameEn =
      locale === 'en' ? editedName : existing?.nameEn;
    const preservedNameEs =
      locale === 'es' ? editedName : existing?.nameEs;

    const editedCity = v.city.trim() || undefined;
    const editedCountry = v.country.trim() || undefined;
    const existingLoc = existing?.location;

    const location = categoryHasLocation(v.category)
      ? place
        ? {
            ...existingLoc,
            city: place.city ?? editedCity ?? existingLoc?.city,
            cityEn:
              locale === 'en'
                ? place.city ?? editedCity ?? existingLoc?.cityEn
                : existingLoc?.cityEn || existingLoc?.city,
            cityEs:
              locale === 'es'
                ? place.city ?? editedCity ?? existingLoc?.cityEs
                : existingLoc?.cityEs || existingLoc?.city,
            country: place.country ?? editedCountry ?? existingLoc?.country,
            countryEn:
              locale === 'en'
                ? place.country ?? editedCountry ?? existingLoc?.countryEn
                : existingLoc?.countryEn || existingLoc?.country,
            countryEs:
              locale === 'es'
                ? place.country ?? editedCountry ?? existingLoc?.countryEs
                : existingLoc?.countryEs || existingLoc?.country,
            latitude: place.latitude || existingLoc?.latitude || undefined,
            longitude: place.longitude || existingLoc?.longitude || undefined,
            address: place.displayName ?? existingLoc?.address,
            addressEn:
              locale === 'en'
                ? place.displayName ?? existingLoc?.addressEn
                : existingLoc?.addressEn || existingLoc?.address,
            addressEs:
              locale === 'es'
                ? place.displayName ?? existingLoc?.addressEs
                : existingLoc?.addressEs || existingLoc?.address,
            region: existingLoc?.region,
            regionEn: existingLoc?.regionEn,
            regionEs: existingLoc?.regionEs,
            googlePlaceId: place.googlePlaceId ?? existingLoc?.googlePlaceId,
            googleMapsUrl: place.googleMapsUrl ?? existingLoc?.googleMapsUrl,
            placeId: place.googlePlaceId ?? existingLoc?.placeId,
          }
        : editedCity || editedCountry || existingLoc
          ? {
              ...existingLoc,
              city: editedCity ?? existingLoc?.city,
              cityEn:
                locale === 'en'
                  ? editedCity ?? existingLoc?.cityEn
                  : existingLoc?.cityEn || existingLoc?.city,
              cityEs:
                locale === 'es'
                  ? editedCity ?? existingLoc?.cityEs
                  : existingLoc?.cityEs || existingLoc?.city,
              country: editedCountry ?? existingLoc?.country,
              countryEn:
                locale === 'en'
                  ? editedCountry ?? existingLoc?.countryEn
                  : existingLoc?.countryEn || existingLoc?.country,
              countryEs:
                locale === 'es'
                  ? editedCountry ?? existingLoc?.countryEs
                  : existingLoc?.countryEs || existingLoc?.country,
            }
          : undefined
      : undefined;

    const payload = {
      name: editedName,
      nameEn: preservedNameEn,
      nameEs: preservedNameEs,
      category: v.category,
      status: v.status,
      rejectionReason:
        v.status === ItemStatus.Rejected
          ? v.rejectionReason.trim() || undefined
          : undefined,
      tags: normalizedTags,
      location,
      wine: this.buildWinePayload(),
      source: {
        type: v.sourceType,
        referrerPersonId: this.referrerPersonIds()[0] || undefined,
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
    locale = this.i18n.locale(),
  ): PlaceSearchResult {
    return {
      name,
      displayName: locationAddress(loc, locale) ?? name,
      latitude: loc.latitude!,
      longitude: loc.longitude!,
      city: locationCity(loc, locale),
      country: locationCountry(loc, locale),
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
