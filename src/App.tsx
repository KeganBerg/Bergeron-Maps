import { EditorPage } from './editor/EditorPage';
import { HomePage } from './home/HomePage';
import { useRoute } from './router';
import { repository } from './storage/indexedDbRepository';
import { ViewerPage } from './viewer/ViewerPage';

export function App() {
  const { parts, query } = useRoute();
  if (parts[0] === 'edit' && parts[1]) return <EditorPage key={parts[1]} mapId={parts[1]} repo={repository} />;
  if (parts[0] === 'view' && parts[1])
    return <ViewerPage key={parts[1]} mapId={parts[1]} repo={repository} preview={query.get('preview') === '1'} />;
  return <HomePage repo={repository} />;
}
