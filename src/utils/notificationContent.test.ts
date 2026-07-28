import { describe, it, expect } from 'vitest';
import { resolveNotificationContent } from './notificationContent';

describe('resolveNotificationContent', () => {
  it('en user + doc with only Arabic fields → falls back to the Arabic content', () => {
    const doc = {
      titleAr: 'عنوان عربي',
      descriptionAr: 'وصف عربي',
    };
    const res = resolveNotificationContent(doc, 'en');
    expect(res.title).toBe('عنوان عربي');
    expect(res.body).toBe('وصف عربي');
  });

  it('ar user + doc with both languages → returns the Arabic', () => {
    const doc = {
      titleAr: 'عنوان عربي',
      titleEn: 'English Title',
      descriptionAr: 'وصف عربي',
      descriptionEn: 'English Description',
    };
    const res = resolveNotificationContent(doc, 'ar');
    expect(res.title).toBe('عنوان عربي');
    expect(res.body).toBe('وصف عربي');
  });

  it('en user + doc with both languages → returns the English', () => {
    const doc = {
      titleAr: 'عنوان عربي',
      titleEn: 'English Title',
      descriptionAr: 'وصف عربي',
      descriptionEn: 'English Description',
    };
    const res = resolveNotificationContent(doc, 'en');
    expect(res.title).toBe('English Title');
    expect(res.body).toBe('English Description');
  });

  it('doc with no content fields → returns empty strings', () => {
    const res = resolveNotificationContent({}, 'en');
    expect(res).toEqual({ title: '', body: '' });
  });

  it('empty-string fields are treated as missing and fall back to the other language', () => {
    const doc = {
      titleAr: 'عنوان عربي',
      titleEn: '   ',
      descriptionAr: 'وصف عربي',
      descriptionEn: '',
    };
    const res = resolveNotificationContent(doc, 'en');
    expect(res.title).toBe('عنوان عربي');
    expect(res.body).toBe('وصف عربي');
  });

  it('falls back to the legacy flat title/description fields as a last resort', () => {
    const doc = {
      title: 'Legacy Title',
      description: 'Legacy Description',
    };
    const res = resolveNotificationContent(doc, 'ar');
    expect(res.title).toBe('Legacy Title');
    expect(res.body).toBe('Legacy Description');
  });
});
