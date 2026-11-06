// GSM 03.38 basic + extension characters. Anything else (e.g. Bangla) forces UCS-2.
const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXT = "^{}\\[~]|€";

export type SegmentInfo = { encoding: "GSM" | "UNICODE"; length: number; segments: number; perSegment: number };

/** How many SMS parts a message costs (each part = 1 credit). */
export function countSegments(text: string): SegmentInfo {
  let gsm = true;
  let gsmLength = 0;
  for (const ch of text) {
    if (GSM_BASIC.includes(ch)) gsmLength += 1;
    else if (GSM_EXT.includes(ch)) gsmLength += 2;
    else {
      gsm = false;
      break;
    }
  }
  if (gsm) {
    const perSegment = gsmLength <= 160 ? 160 : 153;
    return { encoding: "GSM", length: gsmLength, perSegment, segments: Math.max(1, Math.ceil(gsmLength / perSegment)) };
  }
  // UCS-2 counts UTF-16 code units
  const length = text.length;
  const perSegment = length <= 70 ? 70 : 67;
  return { encoding: "UNICODE", length, perSegment, segments: Math.max(1, Math.ceil(length / perSegment)) };
}
