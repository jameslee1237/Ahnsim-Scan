export interface ITextSegment {
  text: string;
  highlighted: boolean;
}

interface IMatchRange {
  start: number;
  end: number;
}

const findMatchRanges = (text: string, evidences: string[]): IMatchRange[] => {
  const ranges: IMatchRange[] = [];
  for (const evidence of evidences) {
    if (!evidence) continue;
    const start = text.indexOf(evidence);
    if (start === -1) continue;
    ranges.push({ start, end: start + evidence.length });
  }
  return ranges;
};

// 겹치거나 맞닿은 구간을 하나로 합쳐, 하이라이트된 span이 서로 잘게
// 쪼개지지 않게 한다.
const mergeRanges = (ranges: IMatchRange[]): IMatchRange[] => {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: IMatchRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
};

// 텍스트 안에서 evidence 인용문과 실제로 일치하는 부분을 찾아 하이라이트
// 구간으로 표시한다. evidence가 원문에서 발견되지 않으면(모델이 요약하거나
// 살짝 다르게 인용한 경우) 조용히 건너뛴다 — 하이라이트가 없어질 뿐, 결과
// 자체를 에러로 취급하지 않는다.
export const highlightEvidence = (text: string, evidences: string[]): ITextSegment[] => {
  const ranges = mergeRanges(findMatchRanges(text, evidences));
  if (ranges.length === 0) {
    return [{ text, highlighted: false }];
  }

  const segments: ITextSegment[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) {
      segments.push({ text: text.slice(cursor, range.start), highlighted: false });
    }
    segments.push({ text: text.slice(range.start, range.end), highlighted: true });
    cursor = range.end;
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), highlighted: false });
  }
  return segments;
};
