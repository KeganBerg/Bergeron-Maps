import { useEffect, useState } from 'react';

/** Minimal hash router: #/ , #/edit/:id , #/view/:id */
export function navigate(path: string) {
  window.location.hash = path;
}

export function useRoute() {
  const [hash, setHash] = useState(() => window.location.hash.slice(1) || '/');
  useEffect(() => {
    const on = () => setHash(window.location.hash.slice(1) || '/');
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const [path, query = ''] = hash.split('?');
  return { parts: path.split('/').filter(Boolean), query: new URLSearchParams(query) };
}
