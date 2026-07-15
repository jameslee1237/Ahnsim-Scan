import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

const makeShareRequest = (formData: FormData) =>
  new NextRequest('http://localhost/share-target', { method: 'POST', body: formData });

// 라우트는 명시적으로 encodeURIComponent(JSON.stringify(payload))를 쿠키 값으로
// 쓰고 Set-Cookie 헤더에 직접 넣으므로, 테스트도 그 헤더를 직접 파싱해
// 인코딩 계층을 한 번만 되돌린다(NextResponse 쿠키 직렬화 동작에 의존하지 않음).
const readCookiePayload = (res: Response) => {
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) return null;
  const match = setCookie.match(/shared_content=([^;]*)/);
  if (!match) return null;
  return JSON.parse(decodeURIComponent(match[1]));
};

describe('POST /share-target', () => {
  it('redirects to /?shared=1 for a text share and sets a cookie with the text', async () => {
    const formData = new FormData();
    formData.set('text', '엄마 나 사고났어 이 계좌로 보내줘');

    const res = await POST(makeShareRequest(formData));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('/?shared=1');
    expect(readCookiePayload(res)).toEqual({ type: 'sms', text: '엄마 나 사고났어 이 계좌로 보내줘' });
  });

  it('falls back to the url field when text is absent', async () => {
    const formData = new FormData();
    formData.set('url', 'https://scam.example.com/login');

    const res = await POST(makeShareRequest(formData));
    expect(readCookiePayload(res)).toEqual({ type: 'sms', text: 'https://scam.example.com/login' });
  });

  it('sets a cookie with the image data URL for a small image share', async () => {
    const formData = new FormData();
    formData.set('images', new File([new Uint8Array([1, 2, 3])], 'shot.jpg', { type: 'image/jpeg' }));

    const res = await POST(makeShareRequest(formData));
    const payload = readCookiePayload(res);
    expect(payload.type).toBe('image');
    expect(payload.images[0]).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('prioritizes an image over text when both are shared together', async () => {
    const formData = new FormData();
    formData.set('text', '캡션입니다');
    formData.set('images', new File([new Uint8Array([1, 2, 3])], 'shot.jpg', { type: 'image/jpeg' }));

    const res = await POST(makeShareRequest(formData));
    expect(readCookiePayload(res).type).toBe('image');
  });

  it('redirects without a cookie when the encoded image would exceed the size limit', async () => {
    const formData = new FormData();
    formData.set('images', new File([new Uint8Array(4000)], 'big.jpg', { type: 'image/jpeg' }));

    const res = await POST(makeShareRequest(formData));
    expect(res.status).toBe(303);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('redirects even when the body cannot be parsed as form data', async () => {
    const req = new NextRequest('http://localhost/share-target', {
      method: 'POST',
      body: 'not form data',
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('/?shared=1');
  });
});
