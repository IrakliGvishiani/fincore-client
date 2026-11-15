import { FileContentResult } from '../models';

export function base64ToBlob(base64: string, contentType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: contentType });
}

/** Triggers a browser download for a Blob. */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Saves a receipt returned by the backend (FileContentResult serialized inside CommonResponse.result). */
export function saveFileResult(file: FileContentResult, fallbackName = 'download'): void {
  const blob = base64ToBlob(file.fileContents, file.contentType || 'application/octet-stream');
  saveBlob(blob, file.fileDownloadName || fallbackName);
}
