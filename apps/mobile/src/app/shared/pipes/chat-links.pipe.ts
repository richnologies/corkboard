import { Pipe, PipeTransform, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

/**
 * Renders chat text with markdown links and bare URLs as safe clickable anchors.
 * Escapes all other HTML so assistant/user content cannot inject markup.
 */
@Pipe({
  name: 'chatLinks',
  standalone: true,
})
export class ChatLinksPipe implements PipeTransform {
  private readonly sanitizer = inject(DomSanitizer);

  transform(value: string | null | undefined): SafeHtml {
    const text = value ?? '';
    if (!text) return this.sanitizer.bypassSecurityTrustHtml('');

    let html = escapeHtml(text);
    const placeholders = new Map<string, string>();

    // [label](https://...)
    html = html.replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      (_match, label: string, url: string) => {
        const marker = `__LINK_${Math.random().toString(36).slice(2)}__`;
        placeholders.set(
          marker,
          `<a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`,
        );
        return marker;
      },
    );

    // Bare URLs that aren't already placeholder markers
    html = html.replace(/(https?:\/\/[^\s<]+)/g, (url) => {
      return `<a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${url}</a>`;
    });

    for (const [marker, anchor] of placeholders) {
      html = html.split(marker).join(anchor);
    }

    // Preserve line breaks
    html = html.replace(/\n/g, '<br />');

    return this.sanitizer.bypassSecurityTrustHtml(html);
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
