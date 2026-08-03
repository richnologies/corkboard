import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ViewWillEnter } from '@ionic/angular/common';
import { AlertController } from '@ionic/angular/standalone';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonChip,
  IonContent,
  IonFab,
  IonFabButton,
  IonFooter,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonItemOption,
  IonItemOptions,
  IonItemSliding,
  IonLabel,
  IonList,
  IonModal,
  IonRefresher,
  IonRefresherContent,
  IonSearchbar,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { add, cloudOfflineOutline, peopleOutline, trashOutline } from 'ionicons/icons';
import { ItemCategory, Person, PersonActivity, PersonType, isWineCategory } from '@org/domain';
import { PeopleService } from '../../core/services/people.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { visitStarsText } from '../../shared/visit-stars';

addIcons({ add, cloudOfflineOutline, peopleOutline, trashOutline });

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
    IonBackButton,
    IonContent,
    IonSearchbar,
    IonList,
    IonItem,
    IonItemSliding,
    IonItemOptions,
    IonItemOption,
    IonLabel,
    IonChip,
    IonIcon,
    IonButton,
    IonSpinner,
    IonModal,
    IonInput,
    IonSelect,
    IonSelectOption,
    IonFab,
    IonFabButton,
    IonFooter,
    IonRefresher,
    IonRefresherContent,
  ],
  templateUrl: './people.page.html',
  styleUrl: './people.page.scss',
})
export class PeoplePage implements OnInit, ViewWillEnter {
  private readonly peopleService = inject(PeopleService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly alertCtrl = inject(AlertController);
  private readonly i18n = inject(I18nService);

  readonly loading = signal(true);
  readonly loadError = signal(false);
  readonly refreshError = signal(false);
  readonly saving = signal(false);
  readonly deleting = signal(false);
  readonly activityLoading = signal(false);
  readonly people = signal<Person[]>([]);
  readonly search = signal('');
  readonly activeType = signal<PersonType | undefined>(undefined);
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

  setType(type: PersonType | undefined) {
    this.activeType.set(this.activeType() === type ? undefined : type);
    this.applyFilter();
  }

  initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
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

  statusLabelKey(category: ItemCategory | string, status: string): string {
    return `${isWineCategory(category as ItemCategory) ? 'statusWine' : 'status'}.${status}`;
  }

  async confirmDeletePerson(person: Person) {
    const alert = await this.alertCtrl.create({
      header: this.i18n.t('people.deletePersonTitle', { name: person.name }),
      message: this.i18n.t('people.deletePersonConfirm'),
      buttons: [
        { text: this.i18n.t('common.cancel'), role: 'cancel' },
        {
          text: this.i18n.t('people.deletePerson'),
          role: 'destructive',
          handler: () => this.removePerson(person),
        },
      ],
    });
    await alert.present();
  }

  faceFor(value: number | null | undefined): string {
    return visitStarsText(value);
  }

  private removePerson(person: Person) {
    this.deleting.set(true);
    this.peopleService.remove(person.id).subscribe({
      next: () => {
        this.deleting.set(false);
        if (this.editingPerson()?.id === person.id) {
          this.closeEditor();
        }
        this.loadPeople();
      },
      error: () => this.deleting.set(false),
    });
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

  private loadPeople(options?: { target?: HTMLIonRefresherElement; silent?: boolean }) {
    if (!options?.silent && !options?.target) {
      this.loading.set(true);
    }
    this.peopleService.list().subscribe({
      next: (people) => {
        this.people.set(people);
        this.applyFilter();
        this.loadError.set(false);
        this.refreshError.set(false);
        this.loading.set(false);
        options?.target?.complete();
      },
      error: () => {
        this.loading.set(false);
        if (!this.people().length) {
          this.loadError.set(true);
          this.refreshError.set(false);
        } else {
          this.refreshError.set(true);
        }
        options?.target?.complete();
      },
    });
  }

  retryLoad() {
    this.loadPeople();
  }

  refresh(ev: CustomEvent) {
    this.loadPeople({ target: ev.target as HTMLIonRefresherElement });
  }

  private applyFilter() {
    const q = this.search().trim().toLowerCase();
    const type = this.activeType();
    let list = this.people();
    if (type) {
      list = list.filter((person) => person.type === type);
    }
    this.filteredPeople.set(
      q
        ? list.filter((person) => person.name.toLowerCase().includes(q))
        : list,
    );
  }
}
