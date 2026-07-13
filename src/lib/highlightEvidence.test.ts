import { describe, expect, it } from 'vitest';
import { highlightEvidence } from './highlightEvidence';

describe('highlightEvidence', () => {
  it('returns the whole text as one unhighlighted segment when there is no evidence', () => {
    const result = highlightEvidence('안녕하세요 택배가 도착했습니다', []);
    expect(result).toEqual([{ text: '안녕하세요 택배가 도착했습니다', highlighted: false }]);
  });

  it('highlights a single matching evidence quote in place', () => {
    const result = highlightEvidence('지금 즉시 확인하지 않으면 계좌가 정지됩니다', [
      '지금 즉시 확인하지 않으면',
    ]);
    expect(result).toEqual([
      { text: '지금 즉시 확인하지 않으면', highlighted: true },
      { text: ' 계좌가 정지됩니다', highlighted: false },
    ]);
  });

  it('highlights multiple non-overlapping evidence quotes', () => {
    const result = highlightEvidence('엄마 나 사고났어 이 계좌로 보내줘', [
      '엄마 나 사고났어',
      '이 계좌로 보내줘',
    ]);
    expect(result).toEqual([
      { text: '엄마 나 사고났어', highlighted: true },
      { text: ' ', highlighted: false },
      { text: '이 계좌로 보내줘', highlighted: true },
    ]);
  });

  it('merges overlapping evidence ranges into a single highlighted segment', () => {
    const result = highlightEvidence('긴급 계좌 확인 요청', ['긴급 계좌', '계좌 확인']);
    expect(result).toEqual([
      { text: '긴급 계좌 확인', highlighted: true },
      { text: ' 요청', highlighted: false },
    ]);
  });

  it('skips evidence that does not appear in the text without throwing', () => {
    const result = highlightEvidence('정상적인 메시지입니다', ['존재하지 않는 문구']);
    expect(result).toEqual([{ text: '정상적인 메시지입니다', highlighted: false }]);
  });

  it('ignores empty-string evidence entries', () => {
    const result = highlightEvidence('테스트 메시지', ['']);
    expect(result).toEqual([{ text: '테스트 메시지', highlighted: false }]);
  });
});
