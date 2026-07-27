import { Injectable, inject } from '@angular/core';
import { Person, PersonType } from '@org/domain';
import { ApiService } from './api.service';

export interface CreatePersonPayload {
  name: string;
  type: PersonType;
}

export interface UpdatePersonPayload {
  name?: string;
  type?: PersonType;
  linkedUserId?: string | null;
}

@Injectable({ providedIn: 'root' })
export class PeopleService {
  private readonly api = inject(ApiService);

  list(q?: string) {
    return this.api.get<Person[]>('/people', q ? { q } : undefined);
  }

  get(id: string) {
    return this.api.get<Person>(`/people/${id}`);
  }

  create(payload: CreatePersonPayload) {
    return this.api.post<Person>('/people', payload);
  }

  update(id: string, payload: UpdatePersonPayload) {
    return this.api.patch<Person>(`/people/${id}`, payload);
  }

  remove(id: string) {
    return this.api.delete(`/people/${id}`);
  }
}
