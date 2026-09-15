export interface Requirement {
  id: string;
  slug: string;
  category: 'exam' | 'identity_document' | 'bank_kyc';
  form_name: string;
  document_type: string;
  min_kb: number | null;
  max_kb: number | null;
  width: number | null;
  height: number | null;
  unit: string;
  format: string[];
  aspect_ratio: string | null;
  background_rule: string | null;
  special_rules: string | null;
  official_source: string;
  source_date: string | null;
  verified_date: string | null;
  status: 'verified' | 'needs_recheck' | 'known_discrepancy';
  discrepancy_note: string | null;
}

export interface FileProps {
  name: string;
  sizeKB: number;
  width: number;
  height: number;
  format: string;
}

export interface CheckRow {
  label: string;
  actual: string;
  expected: string;
  pass: boolean | null;
}

export function readFileProps(file: File): Promise<FileProps> {
  return new Promise((resolve, reject) => {
    const format = (file.name.split('.').pop() || '').toUpperCase() || (file.type.split('/')[1] || '').toUpperCase();
    const sizeKB = file.size / 1024;
    if (file.type === 'application/pdf') {
      resolve({ name: file.name, sizeKB, width: 0, height: 0, format: 'PDF' });
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const out = { name: file.name, sizeKB, width: img.naturalWidth, height: img.naturalHeight, format };
      URL.revokeObjectURL(url);
      resolve(out);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read this image. Try a JPG, PNG, or PDF file.'));
    };
    img.src = url;
  });
}

export function checkAgainstRequirement(props: FileProps, req: Requirement): CheckRow[] {
  const rows: CheckRow[] = [];
  if (req.max_kb != null || req.min_kb != null) {
    const parts: string[] = [];
    if (req.min_kb != null) parts.push(`Minimum: ${req.min_kb} KB`);
    if (req.max_kb != null) parts.push(`Maximum: ${req.max_kb} KB`);
    const pass =
      (req.min_kb == null || props.sizeKB >= req.min_kb) &&
      (req.max_kb == null || props.sizeKB <= req.max_kb);
    rows.push({ label: 'File size', actual: `${props.sizeKB.toFixed(1)} KB`, expected: parts.join(' · ') || '—', pass });
  }
  if (req.format && req.format.length > 0) {
    const want = req.format.map((f) => f.toUpperCase());
    const pass = want.includes(props.format.toUpperCase());
    rows.push({ label: 'Format', actual: props.format, expected: want.join(' / '), pass });
  }
  if (req.width != null && req.height != null && req.unit === 'px') {
    const pass = props.width === req.width && props.height === req.height;
    rows.push({
      label: 'Dimensions',
      actual: `${props.width} × ${props.height} px`,
      expected: `${req.width} × ${req.height} px`,
      pass,
    });
  } else if (req.width != null && req.height != null) {
    rows.push({
      label: 'Dimensions',
      actual: `${props.width} × ${props.height} px (uploaded pixels)`,
      expected: `${req.width} × ${req.height} ${req.unit}${req.aspect_ratio ? ` (ratio ${req.aspect_ratio})` : ''} — resize preserves ratio, then compresses to size bounds`,
      pass: null,
    });
  } else if (req.aspect_ratio) {
    rows.push({ label: 'Shape', actual: `${props.width} × ${props.height} px`, expected: `Ratio ${req.aspect_ratio}`, pass: null });
  }
  return rows;
}

export async function fixImage(
  file: File,
  req: Requirement,
  onPreview?: (url: string) => void,
): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  let targetW = bitmap.width;
  let targetH = bitmap.height;
  if (req.width != null && req.height != null && req.unit === 'px') {
    targetW = req.width;
    targetH = req.height;
  } else if (req.aspect_ratio && req.aspect_ratio.includes(':')) {
    const [aw, ah] = req.aspect_ratio.split(':').map(Number);
    if (aw > 0 && ah > 0) {
      const current = bitmap.width / bitmap.height;
      const want = aw / ah;
      if (Math.abs(current - want) > 0.02) {
        if (current > want) targetW = Math.round(bitmap.height * want);
        else targetH = Math.round(bitmap.width / want);
      }
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, targetW, targetH);
  const sx = targetW / bitmap.width;
  const sy = targetH / bitmap.height;
  const s = Math.max(sx, sy);
  const dw = bitmap.width * s;
  const dh = bitmap.height * s;
  ctx.drawImage(bitmap, (targetW - dw) / 2, (targetH - dh) / 2, dw, dh);
  bitmap.close();

  const wantJpeg = (req.format || []).some((f) => ['JPG', 'JPEG'].includes(f.toUpperCase()));
  const mime = wantJpeg ? 'image/jpeg' : file.type.startsWith('image/') ? file.type : 'image/jpeg';
  const maxBytes = req.max_kb != null ? req.max_kb * 1024 : 200 * 1024;
  let quality = 0.92;
  let blob: Blob | null = null;
  for (let i = 0; i < 6; i++) {
    blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, mime, quality));
    if (!blob) break;
    onPreview?.(URL.createObjectURL(blob));
    if (blob.size <= maxBytes || quality <= 0.4) break;
    quality -= 0.12;
  }
  if (!blob) throw new Error('Could not process this image. Try a different file.');
  return blob;
}

export type CustomFormat = 'JPEG' | 'PNG' | 'WEBP';

export interface CustomResizeOptions {
  mode: 'dimensions' | 'percentage' | 'kb';
  width?: number;
  height?: number;
  keepRatio?: boolean;
  percent?: number;
  targetKB?: number;
  format: CustomFormat;
}

function customMime(format: CustomFormat): string {
  if (format === 'PNG') return 'image/png';
  if (format === 'WEBP') return 'image/webp';
  return 'image/jpeg';
}

/**
 * General-purpose resize/compress/convert — same client-side canvas +
 * quality-stepdown pipeline as fixImage(), but driven by user-chosen
 * targets instead of a form's pre-set requirement.
 */
export async function customResize(
  file: File,
  opts: CustomResizeOptions,
  onPreview?: (url: string) => void,
): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  let targetW = bitmap.width;
  let targetH = bitmap.height;

  if (opts.mode === 'dimensions') {
    const w = Math.round(opts.width || 0);
    const h = Math.round(opts.height || 0);
    if (!w && !h) {
      bitmap.close();
      throw new Error('Enter a width, a height, or both.');
    }
    if (w > 0 && h > 0) {
      if (opts.keepRatio) {
        const s = Math.min(w / bitmap.width, h / bitmap.height);
        targetW = Math.max(1, Math.round(bitmap.width * s));
        targetH = Math.max(1, Math.round(bitmap.height * s));
      } else {
        targetW = w;
        targetH = h;
      }
    } else if (w > 0) {
      targetW = w;
      targetH = Math.max(1, Math.round((bitmap.height * w) / bitmap.width));
    } else {
      targetH = h;
      targetW = Math.max(1, Math.round((bitmap.width * h) / bitmap.height));
    }
  } else if (opts.mode === 'percentage') {
    const p = opts.percent || 0;
    if (!(p > 0) || p > 400) {
      bitmap.close();
      throw new Error('Enter a percentage between 1 and 400.');
    }
    targetW = Math.max(1, Math.round((bitmap.width * p) / 100));
    targetH = Math.max(1, Math.round((bitmap.height * p) / 100));
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d')!;
  const mime = customMime(opts.format);
  if (mime === 'image/jpeg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetW, targetH);
  } else {
    ctx.clearRect(0, 0, targetW, targetH);
  }
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  bitmap.close();

  const maxBytes =
    opts.mode === 'kb' && opts.targetKB && opts.targetKB > 0
      ? opts.targetKB * 1024
      : null;

  // PNG has no quality knob: single encode, then report actual size.
  if (mime === 'image/png') {
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, mime));
    if (!blob) throw new Error('Could not process this image. Try a different file.');
    onPreview?.(URL.createObjectURL(blob));
    return blob;
  }

  let quality = 0.92;
  let blob: Blob | null = null;
  for (let i = 0; i < 8; i++) {
    blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, mime, quality));
    if (!blob) break;
    onPreview?.(URL.createObjectURL(blob));
    if (maxBytes == null || blob.size <= maxBytes || quality <= 0.3) break;
    quality -= 0.09;
  }
  if (!blob) throw new Error('Could not process this image. Try a different file.');
  return blob;
}
