import { IMAGE_DATA_URL_PATTERN } from './types';

export interface IParsedImageDataUrl {
  mimeType: string;
  data: string;
}

export const parseImageDataUrl = (dataUrl: string): IParsedImageDataUrl => {
  const match = dataUrl.match(IMAGE_DATA_URL_PATTERN);
  if (!match) {
    throw new Error('Invalid image data URL');
  }
  const [, format, data] = match;
  return { mimeType: `image/${format}`, data };
};
