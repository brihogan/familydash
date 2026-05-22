import { useParams } from 'react-router-dom';
import BadgeBrowser from '../components/badges/BadgeBrowser.jsx';

export default function BadgeBrowserPage() {
  const { userId } = useParams();
  return <BadgeBrowser userId={parseInt(userId, 10)} />;
}
