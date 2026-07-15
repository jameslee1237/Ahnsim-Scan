const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.8;

const readFileAsImage = (file: File): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('이미지를 불러올 수 없습니다.'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다.'));
    reader.readAsDataURL(file);
  });
};

// 스크린샷을 장변 MAX_DIMENSION 이하로 다운스케일하고 JPEG로 재인코딩한
// data URL을 반환한다. 목적은 Vercel 함수의 요청 바디 4.5MB 한도와 Groq
// Llama 4 Scout의 base64 이미지 총합 4MB(디코딩 기준) 한도를 5장까지 안전
// 하게 채우는 것 — 장당 목표 용량을 수백 KB로 낮추는 바이트 용량 최적화가
// 목적이며, Gemini 쪽 토큰 비용 관점에서는 이 해상도 범위 내에서 장변을 더
// 줄여도 타일 수(=토큰 수)가 거의 줄지 않는다 — 그러니 텍스트 가독성을
// 해치면서까지 더 작게 줄이지 않는다.
export const downscaleImage = async (file: File): Promise<string> => {
  const img = await readFileAsImage(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('이미지 처리를 위한 캔버스를 생성할 수 없습니다.');
  }
  ctx.drawImage(img, 0, 0, width, height);

  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
};

// data URL(서버 폴백 쿠키가 실어 보낸 이미지)을 File로 되돌린다 —
// downscaleImage가 File을 받으므로, 공유받은 이미지도 업로드 이미지와 동일한
// 다운스케일 경로를 타게 하려면 먼저 File로 되돌려야 한다. (정상 경로의
// 이미지는 서비스 워커가 Blob으로 저장하므로 page.tsx가 직접 File로 만든다.)
export const dataUrlToFile = (dataUrl: string, filename: string): File => {
  const [header, base64] = dataUrl.split(',');
  const mimeMatch = header.match(/data:(.*?);base64/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], filename, { type: mimeType });
};
