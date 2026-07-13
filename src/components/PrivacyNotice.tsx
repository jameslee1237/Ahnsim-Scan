import { Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export const PrivacyNotice = () => {
  return (
    <Alert role="note" className="mb-5 border-none bg-muted/60">
      <Info className="size-4 text-muted-foreground" aria-hidden="true" />
      <AlertDescription>
        민감한 개인정보(계좌번호, 주민등록번호 등)는 가급적 제외하고 입력하세요. 스크린샷을
        업로드하는 경우 개인정보가 보이는 부분은 잘라내고 올려주세요. 입력한 내용이나 스크린샷은
        분석을 위해 Google Gemini API(무료 티어) 또는 Groq API(무료 티어)로 전송되며, 이 서비스는
        어떤 내용도 저장하지 않습니다.
      </AlertDescription>
    </Alert>
  );
};
