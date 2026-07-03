export type EmbeddableVideo =
  | { kind: 'iframe'; src: string }
  | { kind: 'file'; src: string };

/**
 * Normalizes a pasted video link (YouTube watch/share/shorts, youtu.be, Vimeo,
 * or a direct video file) into something that can actually play inside an
 * iframe/<video> element. Raw "watch" URLs don't render in an iframe, so this
 * is required for any pasted link to play in-app rather than erroring out.
 */
export function getEmbeddableVideo(url: string): EmbeddableVideo | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();

  if (host === 'youtu.be') {
    const id = parsed.pathname.slice(1).split('/')[0];
    if (id) return { kind: 'iframe', src: `https://www.youtube.com/embed/${id}` };
  }

  if (host === 'youtube.com' || host === 'm.youtube.com') {
    if (parsed.pathname === '/watch') {
      const id = parsed.searchParams.get('v');
      if (id) return { kind: 'iframe', src: `https://www.youtube.com/embed/${id}` };
    }
    const shortsMatch = parsed.pathname.match(/^\/shorts\/([^/]+)/);
    if (shortsMatch) return { kind: 'iframe', src: `https://www.youtube.com/embed/${shortsMatch[1]}` };
    const liveMatch = parsed.pathname.match(/^\/live\/([^/]+)/);
    if (liveMatch) return { kind: 'iframe', src: `https://www.youtube.com/embed/${liveMatch[1]}` };
    if (parsed.pathname.startsWith('/embed/')) {
      return { kind: 'iframe', src: trimmed };
    }
  }

  if (host === 'vimeo.com') {
    const id = parsed.pathname.split('/').filter(Boolean)[0];
    if (id && /^\d+$/.test(id)) return { kind: 'iframe', src: `https://player.vimeo.com/video/${id}` };
  }
  if (host === 'player.vimeo.com') {
    return { kind: 'iframe', src: trimmed };
  }

  if (host === 'loom.com' || host === 'drive.google.com') {
    return { kind: 'iframe', src: trimmed };
  }

  if (/\.(mp4|webm|ogg|mov)$/i.test(parsed.pathname)) {
    return { kind: 'file', src: trimmed };
  }

  // Unknown host: assume the pasted link is already embed-ready (e.g. an S3-hosted file, or a provider's own embed URL).
  return { kind: 'iframe', src: trimmed };
}
