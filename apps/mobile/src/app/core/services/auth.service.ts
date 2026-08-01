import { Injectable, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { ApiService } from './api.service';
import { UserProfile } from '@org/domain';

interface AuthResponse {
  user: UserProfile;
  accessToken: string;
}

const TOKEN_KEY = 'corkboard_token';
const USER_KEY = 'corkboard_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  private readonly tokenSignal = signal<string | null>(this.readToken());
  private readonly userSignal = signal<UserProfile | null>(this.readUser());

  readonly isAuthenticated = computed(() => !!this.tokenSignal());
  readonly user = computed(() => this.userSignal());

  getToken(): string | null {
    return this.tokenSignal();
  }

  register(email: string, password: string, displayName: string) {
    return this.api
      .post<AuthResponse>('/auth/register', { email, password, displayName })
      .pipe(tap((res) => this.persist(res)));
  }

  login(email: string, password: string) {
    return this.api
      .post<AuthResponse>('/auth/login', { email, password })
      .pipe(tap((res) => this.persist(res)));
  }

  changePassword(currentPassword: string, newPassword: string) {
    return this.api.patch<{ success: true }>('/auth/password', {
      currentPassword,
      newPassword,
    });
  }

  logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.tokenSignal.set(null);
    this.userSignal.set(null);
    this.router.navigateByUrl('/login');
  }

  private persist(res: AuthResponse) {
    localStorage.setItem(TOKEN_KEY, res.accessToken);
    localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    this.tokenSignal.set(res.accessToken);
    this.userSignal.set(res.user);
  }

  private readToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  private readUser(): UserProfile | null {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as UserProfile) : null;
  }
}
