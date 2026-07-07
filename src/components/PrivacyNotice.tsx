export const PrivacyNotice = () => {
  return (
    <div role="note" className="my-3 text-sm text-gray-600">
      민감한 개인정보(계좌번호, 주민등록번호 등)는 가급적 제외하고 입력하세요. 붙여넣은
      내용은 분석을 위해 Google Gemini API(무료 티어)로 전송되며, 이 서비스는 어떤 내용도
      저장하지 않습니다.
    </div>
  );
};
