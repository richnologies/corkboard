import { Component, OnInit, computed, inject, input, model, signal } from '@angular/core';
import {
  IonButton,
  IonChip,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonSelect,
  IonSelectOption,
  IonSpinner,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { addOutline, closeCircle } from 'ionicons/icons';
import { Person, PersonType } from '@org/domain';
import { PeopleService } from '../../core/services/people.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

addIcons({ addOutline, closeCircle });

@Component({
  selector: 'app-person-picker',
  standalone: true,
  imports: [
    TranslatePipe,
    IonLabel,
    IonItem,
    IonInput,
    IonChip,
    IonIcon,
    IonButton,
    IonSpinner,
    IonSelect,
    IonSelectOption,
  ],
  templateUrl: './person-picker.component.html',
  styleUrl: './person-picker.component.scss',
})
export class PersonPickerComponent implements OnInit {
  private readonly peopleService = inject(PeopleService);

  readonly personIds = model<string[]>([]);
  readonly multiple = input(true);
  readonly labelKey = input('item.recommendedBy');
  readonly emptyHintKey = input('people.pickerEmptyHint');
  readonly libraryLabelKey = input('people.pickerLibrary');

  readonly query = signal('');
  readonly library = signal<Person[]>([]);
  readonly similarPeople = signal<Person[]>([]);
  readonly loading = signal(true);
  readonly creating = signal(false);
  readonly suggesting = signal(false);
  readonly disambiguationOpen = signal(false);
  readonly newPersonType = signal<PersonType>(PersonType.Friend);

  readonly personTypes = Object.values(PersonType);

  private suggestTimer: ReturnType<typeof setTimeout> | undefined;

  readonly peopleById = computed(() => {
    const map = new Map<string, Person>();
    for (const person of this.library()) {
      map.set(person.id, person);
    }
    return map;
  });

  readonly filteredSuggestions = computed(() => {
    const q = this.query().trim().toLowerCase();
    const selected = new Set(this.personIds());
    const similarIds = new Set(this.similarPeople().map((person) => person.id));

    return this.library()
      .filter((person) => !selected.has(person.id))
      .filter((person) => !similarIds.has(person.id))
      .filter((person) => !q || person.name.toLowerCase().includes(q))
      .slice(0, 12);
  });

  readonly canCreateNew = computed(() => {
    const value = this.query().trim().toLowerCase();
    if (!value) return false;
    const selectedNames = this.personIds()
      .map((id) => this.peopleById().get(id)?.name.toLowerCase())
      .filter(Boolean);
    if (selectedNames.includes(value)) return false;
    return !this.library().some(
      (person) => person.name.toLowerCase() === value,
    );
  });

  ngOnInit() {
    this.reloadLibrary();
  }

  reloadLibrary() {
    this.loading.set(true);
    this.peopleService.list().subscribe({
      next: (people) => {
        this.library.set(people);
        this.loading.set(false);
        this.refreshSimilarPeople();
      },
      error: () => this.loading.set(false),
    });
  }

  personName(id: string): string {
    return this.peopleById().get(id)?.name ?? id;
  }

  personType(id: string): PersonType | undefined {
    return this.peopleById().get(id)?.type;
  }

  togglePerson(person: Person) {
    if (this.isSelected(person.id)) {
      this.removePerson(person.id);
    } else {
      this.addPerson(person);
    }
  }

  addFromQuery(event?: Event) {
    event?.preventDefault();
    const name = this.query().trim();
    if (!name || this.creating()) return;

    this.creating.set(true);
    this.peopleService.suggest(name).subscribe({
      next: (result) => {
        this.creating.set(false);
        if (result.exact) {
          this.addPerson(result.exact);
          this.query.set('');
          this.disambiguationOpen.set(false);
          return;
        }
        if (result.similar.length) {
          this.similarPeople.set(result.similar);
          this.disambiguationOpen.set(true);
          return;
        }
        this.createPerson(name);
      },
      error: () => this.creating.set(false),
    });
  }

  confirmCreateNew() {
    const name = this.query().trim();
    if (!name || this.creating()) return;
    this.createPerson(name);
  }

  pickSimilar(person: Person) {
    this.addPerson(person);
    this.query.set('');
    this.disambiguationOpen.set(false);
    this.similarPeople.set([]);
  }

  cancelDisambiguation() {
    this.disambiguationOpen.set(false);
  }

  onQueryInput(ev: CustomEvent) {
    this.query.set((ev.detail as { value?: string }).value ?? '');
    this.disambiguationOpen.set(false);
    this.refreshSimilarPeople();
  }

  removePerson(id: string) {
    this.personIds.update((current) => current.filter((personId) => personId !== id));
  }

  isSelected(id: string): boolean {
    return this.personIds().includes(id);
  }

  private createPerson(name: string) {
    this.creating.set(true);
    this.peopleService
      .create({ name, type: this.newPersonType() })
      .subscribe({
        next: (person) => {
          this.library.update((current) => {
            const exists = current.some((entry) => entry.id === person.id);
            return exists ? current : [...current, person].sort((a, b) => a.name.localeCompare(b.name));
          });
          this.addPerson(person);
          this.query.set('');
          this.disambiguationOpen.set(false);
          this.similarPeople.set([]);
          this.creating.set(false);
        },
        error: () => this.creating.set(false),
      });
  }

  private refreshSimilarPeople() {
    clearTimeout(this.suggestTimer);
    const name = this.query().trim();
    if (!name) {
      this.similarPeople.set([]);
      return;
    }

    this.suggestTimer = setTimeout(() => {
      this.suggesting.set(true);
      this.peopleService.suggest(name).subscribe({
        next: (result) => {
          this.similarPeople.set(result.exact ? [] : result.similar);
          this.suggesting.set(false);
        },
        error: () => this.suggesting.set(false),
      });
    }, 250);
  }

  private addPerson(person: Person) {
    if (this.isSelected(person.id)) return;
    if (this.multiple()) {
      this.personIds.update((current) => [...current, person.id]);
      return;
    }
    this.personIds.set([person.id]);
  }
}
