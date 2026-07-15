import { NextRequest, NextResponse } from 'next/server';

const SHARE_COOKIE_NAME = 'shared_content';
const SHARE_COOKIE_MAX_AGE_SECONDS = 60;
// 브라우저의 항목당 쿠키 크기 한도(~4KB)를 감안한 최종(인코딩된) 값 길이 상한.
const MAX_COOKIE_VALUE_LENGTH = 3800;

type SharedPayload = { type: 'sms'; text: string } | { type: 'image'; images: string[] };

// 일부 공유 앱은 텍스트를 text가 아니라 url/title에 담는다 — sw.js와 동일 순서.
const pickText = (formData: FormData): string | null => {
  for (const field of ['text', 'url', 'title']) {
    const value = formData.get(field);
    if (typeof value === 'string' && value.trim().length > 0) return value;
  }
  return null;
};

// 서비스 워커가 아직 활성화되지 않은 설치 직후의 짧은 시간에만 실제로 도달하는
// 경로다 — 정상적으로는 public/sw.js가 이 요청을 가로챈다. 내용은 어디에도
// 저장하지 않고, 쿠키에 실어 즉시 리다이렉트한다(URL에 내용을 싣지 않는다 —
// 브라우저 히스토리/서버 로그 노출 위험). 쿠키 값 인코딩을 명시적으로 제어
// 하려고 Set-Cookie 헤더를 직접 구성한다(encodeURIComponent 1회).
export const POST = async (req: NextRequest) => {
  let payload: SharedPayload | null = null;

  try {
    const formData = await req.formData();
    const files = formData
      .getAll('images')
      .filter((entry): entry is File => entry instanceof File && entry.size > 0);

    // 이미지 우선 — sw.js의 handleShareTarget과 동일한 우선순위. 폴백은 첫
    // 한 장만 쿠키로 처리한다.
    if (files.length > 0) {
      const file = files[0];
      const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');
      payload = { type: 'image', images: [`data:${file.type};base64,${base64}`] };
    } else {
      const text = pickText(formData);
      if (text) payload = { type: 'sms', text };
    }
  } catch {
    // 파싱 실패는 빈 폼으로 이어지도록 조용히 넘어간다.
    payload = null;
  }

  const response = NextResponse.redirect(new URL('/?shared=1', req.url), 303);

  if (payload) {
    const cookieValue = encodeURIComponent(JSON.stringify(payload));
    // 최종 인코딩된 값 길이로 검사한다 — 상한을 넘으면(대개 큰 이미지) 쿠키를
    // 싣지 않고, 클라이언트는 빈 폼을 보여준다.
    if (cookieValue.length <= MAX_COOKIE_VALUE_LENGTH) {
      response.headers.append(
        'Set-Cookie',
        `${SHARE_COOKIE_NAME}=${cookieValue}; Max-Age=${SHARE_COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax`,
      );
    }
  }

  return response;
};
