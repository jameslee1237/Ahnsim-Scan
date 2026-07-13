import { describe, expect, it } from 'vitest';
import { parseImageDataUrl } from './imageDataUrl';

describe('parseImageDataUrl', () => {
  it('parses a jpeg data URL into mimeType and raw base64 data', () => {
    const result = parseImageDataUrl('data:image/jpeg;base64,/9j/4AAQSkZJRg==');
    expect(result).toEqual({ mimeType: 'image/jpeg', data: '/9j/4AAQSkZJRg==' });
  });

  it('parses a png data URL', () => {
    const result = parseImageDataUrl('data:image/png;base64,iVBORw0KGgo=');
    expect(result).toEqual({ mimeType: 'image/png', data: 'iVBORw0KGgo=' });
  });

  it('parses a webp data URL', () => {
    const result = parseImageDataUrl('data:image/webp;base64,UklGRg==');
    expect(result).toEqual({ mimeType: 'image/webp', data: 'UklGRg==' });
  });

  it('throws for a non-data-url string', () => {
    expect(() => parseImageDataUrl('https://example.com/image.jpg')).toThrow('Invalid image data URL');
  });

  it('throws for an unsupported image format', () => {
    expect(() => parseImageDataUrl('data:image/gif;base64,R0lGODlh')).toThrow('Invalid image data URL');
  });

  it('throws for a data URL missing the base64 marker', () => {
    expect(() => parseImageDataUrl('data:image/jpeg,plaintext')).toThrow('Invalid image data URL');
  });
});
