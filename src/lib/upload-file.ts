/** Largest document the portal accepts; the server enforces the same limit. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

/**
 * PUT a file to a signed storage URL, reporting progress from 0 to 1.
 * Fails if the connection stalls: no progress for `stallMs` aborts the upload.
 */
export function putFile(url: string, file: File, onProgress: (fraction: number) => void, stallMs = 45_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let timer = 0;
    const arm = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => xhr.abort(), stallMs);
    };
    const fail = (message: string) => { window.clearTimeout(timer); reject(new Error(message)); };

    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      arm();
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      window.clearTimeout(timer);
      if (xhr.status >= 200 && xhr.status < 300) { onProgress(1); resolve(); }
      else reject(new Error("The upload was refused. Please try again."));
    };
    xhr.onerror = () => fail("The upload failed. Check your connection and try again.");
    xhr.onabort = () => fail("The upload stopped responding. Check your connection and try again.");
    arm();
    xhr.send(file);
  });
}
