import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
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
import { Person, PersonType } from '@org/domain';
import { PeopleService } from '../../core/services/people.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

addIcons({ addOutline, createOutline, peopleOutline, trashOutline });

@Component({
  selector: 'app-people',
  standalone: true,
  imports: [
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

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly people = signal<Person[]>([]);
  readonly search = signal('');
  readonly editorOpen = signal(false);
  readonly editingPerson = signal<Person | null>(null);

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
    this.form.reset({ name: '', type: PersonType.Friend });
    this.editorOpen.set(true);
  }

  openEdit(person: Person) {
    this.editingPerson.set(person);
    this.form.reset({ name: person.name, type: person.type });
    this.editorOpen.set(true);
  }

  closeEditor() {
    this.editorOpen.set(false);
    this.editingPerson.set(null);
  }

  savePerson() {
    if (this.form.invalid) return;
    this.saving.set(true);
    const value = this.form.getRawValue();
    const editing = this.editingPerson();

    const req = editing
      ? this.peopleService.update(editing.id, value)
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

  removePerson(person: Person) {
    this.peopleService.remove(person.id).subscribe({
      next: () => this.loadPeople(),
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
