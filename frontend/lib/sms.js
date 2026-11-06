// Mirrors backend/src/app/services/sms/segments.ts
const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXT = "^{}\\[~]|€";

export function countSegments(text = "") {
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
    const per = gsmLength <= 160 ? 160 : 153;
    return { encoding: "GSM", length: gsmLength, perSegment: per, segments: Math.max(1, Math.ceil(gsmLength / per)) };
  }
  const length = text.length;
  const per = length <= 70 ? 70 : 67;
  return { encoding: "UNICODE", length, perSegment: per, segments: Math.max(1, Math.ceil(length / per)) };
}

export function SegmentHint({ text }) {
  const s = countSegments(text);
  return (
    <p className="text-xs text-slate-500">
      {s.length} chars · {s.encoding === "UNICODE" ? "Bangla/Unicode" : "English"} · {s.segments} SMS credit(s) per recipient
    </p>
  );
}
