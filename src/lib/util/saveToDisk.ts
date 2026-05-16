import { toBase64 } from 'js-base64';
import { version as FAVersion } from '@fortawesome/fontawesome-free/package.json';
import { waitForRender } from '$lib/util/autoSync';
import { inputStateStore } from '$lib/util/state';

const FONT_AWESOME_URL = `https://cdnjs.cloudflare.com/ajax/libs/font-awesome/${FAVersion}/css/all.min.css`;

function getBase64SVG(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  clone.style.backgroundColor = window
    .getComputedStyle(document.body)
    .getPropertyValue('--background');

  const svgString = clone.outerHTML
    .replaceAll('<br>', '<br/>')
    .replaceAll(/<img([^>]*)>/g, (_, g: string) => `<img ${g} />`);

  return toBase64(`<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet href="${FONT_AWESOME_URL}" type="text/css"?>
${svgString}`);
}

function getImageFormat(): 'webp' | 'png' {
  const c = document.createElement('canvas');
  return c.toDataURL('image/webp').startsWith('data:image/webp') ? 'webp' : 'png';
}

function supportsFileSystemAccess(): boolean {
  return 'showDirectoryPicker' in window;
}

export async function saveDiagramToFolder(code: string): Promise<void> {
  if (!supportsFileSystemAccess()) {
    alert('Folder save is only supported in Chromium-based browsers (Chrome, Edge, etc.).');
    return;
  }

  const folderName = prompt('Enter a folder name:');
  if (!folderName || !folderName.trim()) return;

  const name = folderName.trim();

  let rootHandle: FileSystemDirectoryHandle;
  try {
    rootHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return;
    alert('Could not open directory picker. Try clicking the Save diagram button again.');
    return;
  }

  inputStateStore.update((s) => ({ ...s, panZoom: false }));
  await new Promise((resolve) => setTimeout(resolve, 1000));
  await waitForRender();

  try {
    const folderHandle = await rootHandle.getDirectoryHandle(name, { create: true });

    const mdHandle = await folderHandle.getFileHandle(`${name}.md`, { create: true });
    const mdWritable = await mdHandle.createWritable();
    await mdWritable.write('```mermaid\n' + code + '\n```\n');
    await mdWritable.close();

    const svg = document.querySelector<SVGSVGElement>('#container svg');
    if (!svg) {
      inputStateStore.update((s) => ({ ...s, panZoom: true }));
      alert('Could not find the diagram preview.');
      return;
    }

    const viewBox = svg.viewBox?.baseVal;
    const box = svg.getBoundingClientRect();
    const contentWidth = viewBox && viewBox.width > 0 ? viewBox.width : box.width;
    const contentHeight = viewBox && viewBox.height > 0 ? viewBox.height : box.height;

    if (contentWidth <= 0 || contentHeight <= 0) {
      inputStateStore.update((s) => ({ ...s, panZoom: true }));
      alert('Diagram has no visible content.');
      return;
    }

    const canvas = document.createElement('canvas');
    const multiplier = 2;
    canvas.width = Math.round(contentWidth * multiplier);
    canvas.height = Math.round(contentHeight * multiplier);

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      inputStateStore.update((s) => ({ ...s, panZoom: true }));
      alert('Could not create image.');
      return;
    }

    ctx.fillStyle = window.getComputedStyle(document.body).getPropertyValue('--background');
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const format = getImageFormat();

    const img = new Image();
    img.src = `data:image/svg+xml;base64,${getBase64SVG(svg)}`;

    await new Promise<void>((resolve, reject) => {
      img.onload = async () => {
        try {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          const blob = await new Promise<Blob | null>((res) =>
            canvas.toBlob(res, `image/${format}`, 0.92)
          );
          if (!blob) throw new Error('Failed to encode image');

          const imgHandle = await folderHandle.getFileHandle(`${name}.${format}`, {
            create: true
          });
          const imgWritable = await imgHandle.createWritable();
          await imgWritable.write(blob);
          await imgWritable.close();

          resolve();
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = () => reject(new Error('Failed to render diagram image'));
    });
  } catch (err) {
    if (err instanceof Error) {
      alert(`Save failed: ${err.message}`);
    } else {
      alert('Save failed. Check console for details.');
    }
    console.error('Save to folder error:', err);
  } finally {
    setTimeout(() => {
      inputStateStore.update((s) => ({ ...s, panZoom: true }));
    }, 2000);
  }
}
