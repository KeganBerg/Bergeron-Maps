import { localModeChosen, setLocalMode, supabase } from './cloud/client';
import { OnlineApp } from './cloud/OnlineApp';
import { isPublicSiteRoute, PublicSitePage } from './cloud/PublicSitePage';
import { EditorPage } from './editor/EditorPage';
import { HomePage } from './home/HomePage';
import { useRoute } from './router';
import { repository } from './storage/indexedDbRepository';
import { ViewerPage } from './viewer/ViewerPage';

/** Browser-only mode: no account, maps live in this browser's storage. */
function LocalApp() {
  const { parts, query } = useRoute();
  if (parts[0] === 'edit' && parts[1]) return <EditorPage key={parts[1]} mapId={parts[1]} repo={repository} />;
  if (parts[0] === 'view' && parts[1])
    return <ViewerPage key={parts[1]} mapId={parts[1]} repo={repository} preview={query.get('preview') === '1'} />;
  const banner = supabase ? (
    <>
      Browser-only mode: these maps stay in this browser and nobody else can see them.{' '}
      <button className="link" onClick={() => { setLocalMode(false); window.location.reload(); }} data-testid="go-online">Sign in to save online</button>
    </>
  ) : undefined;
  return <HomePage repo={repository} banner={banner} />;
}

export function App() {
  const { parts } = useRoute();
  // Public site links open for anyone, signed in or not, even in a browser that chose browser-only mode.
  if (supabase && isPublicSiteRoute(parts)) return <PublicSitePage key={parts[1]} slug={parts[1].toLowerCase()} mapId={parts[2]} />;
  return supabase && !localModeChosen() ? <OnlineApp /> : <LocalApp />;
}
