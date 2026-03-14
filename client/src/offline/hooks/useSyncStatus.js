import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db.js';
import { useNetworkStatus } from '../networkStatus.js';

export default function useSyncStatus() {
  const { isOnline } = useNetworkStatus();

  const pendingCount = useLiveQuery(
    () => db.mutationQueue.where('status').anyOf('pending', 'processing').count(),
    [],
    0,
  );

  return { isOnline, pendingCount };
}
