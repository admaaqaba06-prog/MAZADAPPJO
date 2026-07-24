import { describe, it, expect } from 'vitest';
import {
  placeholderAvatarDataUri,
  isRealPhotoUrl,
  hasRealPhoto,
  resolveAvatarUrl,
  resolveAvatar,
  UNSPLASH_PLACEHOLDER_FRAGMENTS,
} from './avatarPlaceholder';

describe('placeholderAvatarDataUri', () => {
  it('returns a valid inline SVG data URI', () => {
    const uri = placeholderAvatarDataUri('user-123');
    expect(uri.startsWith('data:image/svg+xml,')).toBe(true);
    // decodable back to real SVG markup
    const decoded = decodeURIComponent(uri.slice('data:image/svg+xml,'.length));
    expect(decoded).toContain('<svg');
    expect(decoded).toContain('</svg>');
  });

  it('is deterministic — same seed yields identical output', () => {
    expect(placeholderAvatarDataUri('abc')).toBe(placeholderAvatarDataUri('abc'));
    expect(placeholderAvatarDataUri('another-seed')).toBe(placeholderAvatarDataUri('another-seed'));
  });

  it('produces different output for different seeds', () => {
    const a = placeholderAvatarDataUri('seed-a');
    const b = placeholderAvatarDataUri('seed-b');
    const c = placeholderAvatarDataUri('seed-c');
    expect(a).not.toBe(b);
    expect(b).not.toBe(c);
    expect(a).not.toBe(c);
  });

  it('never throws on empty / odd seeds and stays a valid data URI', () => {
    for (const seed of ['', ' ', '💥', ' زبون', '0', 'a'.repeat(500)]) {
      const uri = placeholderAvatarDataUri(seed);
      expect(uri.startsWith('data:image/svg+xml,')).toBe(true);
    }
  });
});

describe('isRealPhotoUrl / hasRealPhoto', () => {
  it('accepts genuine http(s) photo URLs', () => {
    expect(isRealPhotoUrl('https://firebasestorage.googleapis.com/avatars/x.jpg')).toBe(true);
    expect(isRealPhotoUrl('https://lh3.googleusercontent.com/a/abc123')).toBe(true);
    expect(isRealPhotoUrl('http://example.com/me.png')).toBe(true);
  });

  it('rejects empty / missing values', () => {
    expect(isRealPhotoUrl(undefined)).toBe(false);
    expect(isRealPhotoUrl(null)).toBe(false);
    expect(isRealPhotoUrl('')).toBe(false);
    expect(isRealPhotoUrl('   ')).toBe(false);
  });

  it('rejects the generated data: URI placeholder', () => {
    expect(isRealPhotoUrl(placeholderAvatarDataUri('someone'))).toBe(false);
    expect(isRealPhotoUrl('data:image/svg+xml,%3Csvg')).toBe(false);
  });

  it('rejects the old hardcoded Unsplash placeholder avatars', () => {
    for (const frag of UNSPLASH_PLACEHOLDER_FRAGMENTS) {
      expect(isRealPhotoUrl(`https://images.unsplash.com/${frag}?w=150`)).toBe(false);
    }
  });

  it('rejects non-http strings', () => {
    expect(isRealPhotoUrl('blob:whatever')).toBe(false);
    expect(isRealPhotoUrl('just-a-name')).toBe(false);
  });

  it('hasRealPhoto reads user.avatar', () => {
    expect(hasRealPhoto({ id: '1', avatar: 'https://cdn.example.com/a.jpg' } as any)).toBe(true);
    expect(hasRealPhoto({ id: '1', avatar: '' } as any)).toBe(false);
    expect(hasRealPhoto({ id: '1' } as any)).toBe(false);
    expect(hasRealPhoto(null as any)).toBe(false);
  });
});

describe('resolveAvatarUrl / resolveAvatar', () => {
  it('returns the real URL when present', () => {
    expect(resolveAvatarUrl('https://cdn.example.com/a.jpg', 'seed')).toBe('https://cdn.example.com/a.jpg');
  });

  it('falls back to a deterministic placeholder when not real', () => {
    const out = resolveAvatarUrl('', 'seed-x');
    expect(out).toBe(placeholderAvatarDataUri('seed-x'));
    expect(resolveAvatarUrl(undefined, 'seed-x')).toBe(placeholderAvatarDataUri('seed-x'));
  });

  it('resolveAvatar seeds from a stable user id', () => {
    const user = { id: 'uid-9', avatar: '' } as any;
    expect(resolveAvatar(user)).toBe(placeholderAvatarDataUri('uid-9'));
    const real = { id: 'uid-9', avatar: 'https://cdn.example.com/a.jpg' } as any;
    expect(resolveAvatar(real)).toBe('https://cdn.example.com/a.jpg');
  });
});
