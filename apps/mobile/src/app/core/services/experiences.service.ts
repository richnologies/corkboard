import { Injectable, inject } from '@angular/core';
import { ExperienceCalendarEntry } from '@org/domain';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class ExperiencesService {
  private readonly api = inject(ApiService);

  calendar(from: string, to: string) {
    return this.api.get<ExperienceCalendarEntry[]>('/experiences/calendar', {
      from,
      to,
    });
  }
}
