import { Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { osmEmbedUrl } from '../maps';

@Component({
  selector: 'app-osm-map',
  standalone: true,
  template: `
    <iframe
      class="map-frame"
      [style.height.px]="height()"
      [src]="embedUrl()"
      loading="lazy"
      referrerpolicy="no-referrer-when-downgrade"
      title="Map"
    ></iframe>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .map-frame {
        width: 100%;
        height: 220px;
        border: 0;
        border-radius: 16px;
        box-shadow: var(--cork-shadow);
        border: 1px solid var(--cork-border);
      }
    `,
  ],
})
export class OsmMapComponent {
  private readonly sanitizer = inject(DomSanitizer);

  readonly latitude = input.required<number>();
  readonly longitude = input.required<number>();
  readonly height = input(220);

  readonly embedUrl = computed(() =>
    this.sanitizer.bypassSecurityTrustResourceUrl(
      osmEmbedUrl(this.latitude(), this.longitude()),
    ),
  );
}
