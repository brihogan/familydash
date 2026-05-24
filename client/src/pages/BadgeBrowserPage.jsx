import { useParams, useSearchParams } from 'react-router-dom';
import BadgeBrowser from '../components/badges/BadgeBrowser.jsx';

export default function BadgeBrowserPage() {
  const { userId } = useParams();
  const [params] = useSearchParams();
  // Deep-link support: /badges/:userId?type=award&category=Discover%20Art
  const initialType = params.get('type') || 'badge';
  const initialCategory = params.get('category') || '';
  return (
    <BadgeBrowser
      userId={parseInt(userId, 10)}
      initialType={initialType}
      initialCategory={initialCategory}
    />
  );
}
