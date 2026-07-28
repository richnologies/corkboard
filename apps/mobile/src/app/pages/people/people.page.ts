import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ViewWillEnter } from '@ionic/angular/common';
import {
  IonButton,
  IonButtons,
  IonChip,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { addOutline, createOutline, peopleOutline, trashOutline } from 'ionicons/icons';
import { Person, PersonActivity, PersonType } from '@org/domain';
import { PeopleService } from '../../core/services/people.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

addIcons({ addOutline, createOutline, peopleOutline, trashOutline });

@Component({
  selector: 'app-people',
  standalone: true,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    TranslatePipe,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonChip,
    IonIcon,
    IonButton,
    IonSpinner,
    IonModal,
    IonInput,
    IonSelect,
    IonSelectOption,
  ],
  templateUrl: './people.page.html',
  styleUrl: './people.page.scss',
})
export class PeoplePage implements OnInit, ViewWillEnter {
  private readonly peopleService = inject(PeopleService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly activityLoading = signal(false);
  readonly people = signal<Person[]>([]);
  readonly search = signal('');
  readonly editorOpen = signal(false);
  readonly editingPerson = signal<Person | null>(null);
  readonly activity = signal<PersonActivity | null>(null);
  readonly similarPeople = signal<Person[]>([]);
  readonly disambiguationOpen = signal(false);

  readonly personTypes = Object.values(PersonType);

  readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    type: [PersonType.Friend, Validators.required],
  });

  readonly filteredPeople = signal<Person[]>([]);

  ngOnInit() {
    this.loadPeople();
  }

  ionViewWillEnter() {
    this.loadPeople();
  }

  onSearchInput(ev: CustomEvent) {
    this.search.set((ev.detail as { value?: string }).value ?? '');
    this.applyFilter();
  }

  openCreate() {
    this.editingPerson.set(null);
    this.activity.set(null);
    this.similarPeople.set([]);
    this.disambiguationOpen.set(false);
    this.form.reset({ name: '', type: PersonType.Friend });
    this.editorOpen.set(true);
  }

  openEdit(person: Person) {
    this.editingPerson.set(person);
    this.similarPeople.set([]);
    this.disambiguationOpen.set(false);
    this.form.reset({ name: person.name, type: person.type });
    this.activity.set(null);
    this.activityLoading.set(true);
    this.editorOpen.set(true);

    this.peopleService.getActivity(person.id).subscribe({
      next: (data) => {
        this.activity.set(data);
        this.activityLoading.set(false);
      },
      error: () => this.activityLoading.set(false),
    });
  }

  closeEditor() {
    this.editorOpen.set(false);
    this.editingPerson.set(null);
    this.activity.set(null);
    this.similarPeople.set([]);
    this.disambiguationOpen.set(false);
  }

  savePerson() {
    if (this.form.invalid) return;
    const value = this.form.getRawValue();
    const editing = this.editingPerson();

    if (editing) {
      this.persistPerson(editing.id, value);
      return;
    }

    this.saving.set(true);
    this.peopleService.suggest(value.name).subscribe({
      next: (result) => {
        this.saving.set(false);
        if (result.exact) {
          this.closeEditor();
          this.loadPeople();
          return;
        }
        if (result.similar.length) {
          this.similarPeople.set(result.similar);
          this.disambiguationOpen.set(true);
          return;
        }
        this.persistPerson(undefined, value);
      },
      error: () => this.saving.set(false),
    });
  }

  pickSimilar(person: Person) {
    this.closeEditor();
    this.loadPeople();
    this.openEdit(person);
  }

  confirmCreateNew() {
    if (this.form.invalid) return;
    this.persistPerson(undefined, this.form.getRawValue());
  }

  cancelDisambiguation() {
    this.disambiguationOpen.set(false);
    this.similarPeople.set([]);
  }

  openItem(itemId: string) {
    this.closeEditor();
    this.router.navigate(['/item', itemId]);
  }

  removePerson(person: Person) {
    this.peopleService.remove(person.id).subscribe({
      next: () => this.loadPeople(),
    });
  }

  visitRating(entry: PersonActivity['visits'][number]): string | null {
    const overall = entry.rating?.overall;
    return overall != null ? `${overall}/10` : null;
  }

  private persistPerson(
    id: string | undefined,
    value: { name: string; type: PersonType },
  ) {
    this.saving.set(true);
    const req = id
      ? this.peopleService.update(id, value)
      : this.peopleService.create(value);

    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.closeEditor();
        this.loadPeople();
      },
      error: () => this.saving.set(false),
    });
  }

  private loadPeople() {
    this.loading.set(true);
    this.peopleService.list().subscribe({
      next: (people) => {
        this.people.set(people);
        this.applyFilter();
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  private applyFilter() {
    const q = this.search().trim().toLowerCase();
    const list = this.people();
    this.filteredPeople.set(
      q
        ? list.filter((person) => person.name.toLowerCase().includes(q))
        : list,
    );
  }
}
